"""Execute the original GameGen loader with host-backed file I/O and allocation.

Unlike native_scene_queries, this harness does not construct Object3D nodes.
The x86 parser, converter, external references and native constructors run.
This is an investigation helper, not a claim of full-game equivalence.
"""
import struct
from unicorn import UC_HOOK_CODE, UC_HOOK_MEM_INVALID
from unicorn.x86_const import (UC_X86_REG_EAX, UC_X86_REG_EBX,
    UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_EIP, UC_X86_REG_ESP,
    UC_X86_REG_GDTR, UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_ES, UC_X86_REG_SS)
from native_ai_audit import Native, ROOT, EXE, STACK, STOP, REGISTERS


class GameGenLoader(Native):
    def __init__(self):
        super().__init__()
        self.cpu.mem_map(0x1800000, 0x800000)
        self.cpu.mem_map(0x3100000, 0x4000000)
        self.heap, self.sizes, self.files, self.file_log = 0x3100000, {}, {}, []
        # String helpers use ES; a flat, 32-bit SS is also required by the CRT.
        self.cpu.mem_map(0x8000000, 0x1000)
        self.cpu.mem_write(0x8000000, b'\0'*8 + bytes.fromhex(
            'ffff0000009bcf00ffff00000093cf00'))
        self.cpu.reg_write(UC_X86_REG_GDTR, (0, 0x8000000, 23, 0))
        self.cpu.reg_write(UC_X86_REG_CS, 8)
        for reg in [UC_X86_REG_DS, UC_X86_REG_ES, UC_X86_REG_SS]:
            self.cpu.reg_write(reg, 16)
        # Restore the intersection setter/ray query patched by the AI harness.
        data = EXE.read_bytes()
        for start, end in [(0x44b67c, 0x44b684), (0x446764, 0x446aa6)]:
            self.cpu.mem_write(start, data[start-0x410000+0x400:end-0x410000+0x400])
        for address, callback in [(0x4679ce, self._malloc), (0x469eb7, self._calloc),
                (0x468c6c, self._realloc), (0x441df0, self._open),
                (0x441edc, self._read), (0x443e19, self._seek), (0x4420db, self._close)]:
            self.cpu.mem_write(address, b'\xc3')
            self.cpu.hook_add(UC_HOOK_CODE, callback, begin=address, end=address)
        # Host free is a no-op in the bounded arena; progress has no UI to pump.
        for address in [0x467940, 0x413894]:
            self.cpu.mem_write(address, b'\xc3')
        self.cpu.hook_add(UC_HOOK_CODE, self._error, begin=0x443f58, end=0x443f58)
        self.cpu.hook_add(UC_HOOK_MEM_INVALID, self._invalid)
        self.path_map = {p.name.lower(): p for p in (ROOT/'private/original/game/DATA').rglob('*') if p.is_file()}
        self.write(0x490ce0, 'III', self.reserve(0x40000), self.reserve(0x40000), self.reserve(0x40000))
        # CRT per-thread state (strtok continuation); no host OS TLS in Unicorn.
        thread = self.reserve(0x100)
        self.cpu.mem_write(0x8000100, b'\xb8'+struct.pack('<I', thread)+b'\xc3')
        self.write(0x490c4c, 'I', 0x8000100)
        self.world = None
        self.output = self.reserve(0x10000)

    def configure_world(self):
        """Commands from SETUP.GW and DOMAIN_X.GW, using native entry points."""
        self.world = self.call(0x4441b0)
        for address, args in [(0x444710, [1792, -1792]),
                (0x4446c8, [-896, 896]), (0x444754, [128, -128]),
                (0x4449f0, [3, 3])]:
            self.call(address, args, eax=self.world)
        self.call(0x4644dc, eax=self.world)
        self.call(0x464278, eax=1)

    def update(self):
        # Global dirty-object processing, including ancestor propagation and
        # World partition relocation. A single world recursion can skip nodes
        # when native updates relocate its child arrays during traversal.
        self.call(0x459328)

    def graph(self, *roots):
        nodes = {}
        def visit(address):
            if address in nodes:
                return
            children, pointer = self.read(address+0x68, 'II')
            parents, parent_pointer = self.read(address+0x58, 'II')
            nodes[address] = {'name': self.string(address, 32),
                'children': list(self.read(pointer, 'I'*children)) if children else [],
                'parents': list(self.read(parent_pointer, 'I'*parents)) if parents else [],
                'flags': list(self.read(address+0x30, '3I')),
                'shape': self.read(address+0x48, 'I')[0],
                'boundsValid': self.read(address+0x70, 'I')[0],
                'partition': list(self.read(address+0x60, '2i'))}
            for child in nodes[address]['children']:
                visit(child)
        for root in roots:
            if root:
                visit(root)
        return nodes

    def query(self, kind, **values):
        bits = struct.unpack('<f', struct.pack('<I', self.output))[0]
        if kind == 'ground':
            self.call(0x4459a4, [values['x'], values['z'], bits], eax=self.world)
        elif kind == 'sweep':
            self.call(0x446764, [*[values['from'][k] for k in 'xyz'],
                *[values['to'][k] for k in 'xyz'], bits], eax=self.world)
        else:
            raise ValueError(kind)
        count = self.read(self.output, 'I')[0]
        if count > 1024:
            raise RuntimeError(f'Unexpected query count {count}')
        hits = []
        for i in range(count):
            pointer = self.output+4+i*32
            node = self.read(pointer+28, 'I')[0]
            hits.append({'node': node, 'name': self.string(node, 32),
                'normal': dict(zip('xyz', self.read(pointer, '3f'))),
                **({'height': self.read(pointer+16, 'f')[0]} if kind == 'ground' else
                   {'point': dict(zip('xyz', self.read(pointer+12, '3f')))})})
        return hits

    def reserve(self, length):
        if length < 0 or length > 0x1000000:
            raise ValueError(f'Invalid allocation {length}')
        result = self.heap
        self.heap += max(16, (length+15)&~15)
        if self.heap >= 0x7100000:
            raise RuntimeError('GameGen allocation pool exhausted')
        self.sizes[result] = length
        return result

    def string(self, address, limit=1024):
        return bytes(self.cpu.mem_read(address, limit)).split(b'\0')[0].decode('latin1')

    def _malloc(self, cpu, address, size, data):
        cpu.reg_write(UC_X86_REG_EAX, self.reserve(cpu.reg_read(UC_X86_REG_EAX)))

    def _calloc(self, cpu, address, size, data):
        cpu.reg_write(UC_X86_REG_EAX, self.reserve(cpu.reg_read(UC_X86_REG_EAX)*cpu.reg_read(UC_X86_REG_EDX)))

    def _realloc(self, cpu, address, size, data):
        old, length = cpu.reg_read(UC_X86_REG_EAX), cpu.reg_read(UC_X86_REG_EDX)
        out = self.reserve(length)
        if old:
            cpu.mem_write(out, bytes(cpu.mem_read(old, min(length, self.sizes[old]))))
        cpu.reg_write(UC_X86_REG_EAX, out)

    def _open(self, cpu, address, size, data):
        name = self.string(cpu.reg_read(UC_X86_REG_EAX))
        path = self.path_map.get(name.replace('\\', '/').split('/')[-1].lower())
        if path is None:
            raise FileNotFoundError(name)
        handle = len(self.file_log)+1
        self.file_log.append({'requested': name, 'source': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size})
        self.files[handle] = [path.read_bytes(), 0]
        cpu.reg_write(UC_X86_REG_EAX, handle)

    def _read(self, cpu, address, size, data):
        out, item, count, handle = [cpu.reg_read(r) for r in [UC_X86_REG_EAX, UC_X86_REG_EDX, UC_X86_REG_EBX, UC_X86_REG_ECX]]
        contents, offset = self.files[handle]
        chunk = contents[offset:offset+item*count]
        if chunk:
            cpu.mem_write(out, chunk)
        self.files[handle][1] += len(chunk)
        cpu.reg_write(UC_X86_REG_EAX, len(chunk)//item if item else 0)

    def _close(self, cpu, address, size, data):
        del self.files[cpu.reg_read(UC_X86_REG_EAX)]
        cpu.reg_write(UC_X86_REG_EAX, 0)

    def _seek(self, cpu, address, size, data):
        contents, offset = self.files[cpu.reg_read(UC_X86_REG_EAX)]
        delta = struct.unpack('<i', struct.pack('<I', cpu.reg_read(UC_X86_REG_EDX)))[0]
        origin = cpu.reg_read(UC_X86_REG_EBX)
        self.files[cpu.reg_read(UC_X86_REG_EAX)][1] = [0, offset, len(contents)][origin]+delta
        cpu.reg_write(UC_X86_REG_EAX, 0)

    def _error(self, cpu, address, size, data):
        raise RuntimeError('Native error: '+self.string(0x57f460))

    def _invalid(self, cpu, access, address, size, value, data):
        raise RuntimeError(f'Unmapped access {access} at {address:#x}, EIP={cpu.reg_read(UC_X86_REG_EIP):#x}')

    def call(self, address, args=(), **registers):
        self.cpu.mem_write(STACK, struct.pack('<I', STOP)+b''.join(struct.pack('<f', x) for x in args))
        self.cpu.reg_write(UC_X86_REG_ESP, STACK)
        for name, value in registers.items():
            self.cpu.reg_write(REGISTERS[name], value)
        self.cpu.emu_start(address, STOP, count=100000000)
        if self.cpu.reg_read(UC_X86_REG_EIP) != STOP:
            raise RuntimeError(f'Native loader instruction limit, EIP={self.cpu.reg_read(UC_X86_REG_EIP):#x}')
        return self.cpu.reg_read(UC_X86_REG_EAX)

    def load(self, name):
        pointer = self.reserve(len(name)+1)
        self.cpu.mem_write(pointer, name.encode()+b'\0')
        return self.call(0x464928, eax=pointer)


if __name__ == '__main__':
    import argparse, json
    p = argparse.ArgumentParser()
    p.add_argument('model', nargs='?', default='ARENA6.GAM')
    args = p.parse_args()
    n = GameGenLoader()
    root = n.load(args.model)
    print(json.dumps({'root': hex(root), 'name': n.string(root, 32), 'heapBytes': n.heap-0x3100000, 'files': n.file_log}))
