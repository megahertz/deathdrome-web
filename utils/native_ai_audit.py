"""Isolated x86 harness shared by AI component verification tools."""
from pathlib import Path
import struct
from unicorn import Uc, UC_ARCH_X86, UC_MODE_32
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_EBX, UC_X86_REG_ECX, UC_X86_REG_EDX, UC_X86_REG_ESP, UC_X86_REG_EIP

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / 'private/original/game/RUN/ddrome.exe'
REGISTERS = dict(eax=UC_X86_REG_EAX, ebx=UC_X86_REG_EBX, ecx=UC_X86_REG_ECX, edx=UC_X86_REG_EDX)
NODE_POOL, SEGMENT_POOL, RUNNER, SCRATCH, STACK, STOP = 0x50ea00, 0x5061d0, 0x1000000, 0x1003000, 0x2008000, 0x3000000

def f32(value):
    return struct.unpack('<f', struct.pack('<f', value))[0]

class Native:
    def __init__(self):
        data = EXE.read_bytes()
        pe = struct.unpack_from('<I', data, 0x3c)[0]
        sections, optional = struct.unpack_from('<H', data, pe+6)[0], struct.unpack_from('<H', data, pe+20)[0]
        self.cpu = Uc(UC_ARCH_X86, UC_MODE_32)
        self.cpu.mem_map(0x400000, 0x5b0000)
        for i in range(sections):
            _, _, va, size, raw = struct.unpack_from('<8sIIII', data, pe+24+optional+i*40)
            if raw:
                self.cpu.mem_write(0x400000+va, data[raw:raw+size])
        for address, size in [(RUNNER, 0x10000), (0x2000000, 0x10000), (STOP, 0x1000)]:
            self.cpu.mem_map(address, size)
        self.cpu.mem_write(STOP, b'\xdb\xe3')  # fninit, outside the original image
        self.cpu.emu_start(STOP, STOP+2)
        # Intersection-surface toggling has no effect on these synthetic rays.
        self.cpu.mem_write(0x44b67c, b'\xc3')
        self.cpu.mem_write(0x446764, b'\xa0'+struct.pack('<I', SCRATCH+0x100)+b'\xc2\x1c\x00')
        self.visibility(True)

    def visibility(self, clear):
        # 446764 returns AL=1 for zero collected intersections, ret 28.
        self.cpu.mem_write(SCRATCH+0x100, bytes([int(clear)]))

    def call(self, address, args=(), **registers):
        self.cpu.mem_write(STACK, struct.pack('<I', STOP)+b''.join(struct.pack('<f', x) for x in args))
        self.cpu.reg_write(UC_X86_REG_ESP, STACK)
        for name, value in registers.items():
            self.cpu.reg_write(REGISTERS[name], value)
        self.cpu.emu_start(address, STOP, count=500000)
        if self.cpu.reg_read(UC_X86_REG_EIP) != STOP:
            raise RuntimeError('Native instruction limit reached')
        return self.cpu.reg_read(UC_X86_REG_EAX)

    def write(self, address, fmt, *values):
        self.cpu.mem_write(address, struct.pack('<'+fmt, *values))

    def read(self, address, fmt):
        return struct.unpack('<'+fmt, self.cpu.mem_read(address, struct.calcsize('<'+fmt)))

    def segment(self, address):
        return dict(direction=list(self.read(address+4, 'fff'))[::2],
                    advanceDistance=self.read(address+0x10, 'f')[0],
                    normal=list(self.read(address+0x14, 'fff'))[::2],
                    positive=list(self.read(address+0x20, 'fff'))[::2],
                    negative=list(self.read(address+0x2c, 'fff'))[::2])

    def graph(self, graph):
        for n in graph:
            address = NODE_POOL+n['id']*0x34
            self.write(0x50e1d0+n['id']*4, 'I', address)
            self.write(address, 'Ifff', 1, *n['position'])
            self.write(address+0x28, 'Ii', n['color'], n['id'])
        for n in graph:
            address = NODE_POOL+n['id']*0x34
            for index, target in enumerate(n['links']):
                if target < 0:
                    continue
                segment = self.call(0x42dbe4)
                self.write(address+0x10+index*4, 'I', NODE_POOL+target*0x34)
                self.write(address+0x1c+index*4, 'I', segment)
                self.call(0x42c610, [*n['position'], *graph[target]['position'], 10.], eax=segment)
        self.write(RUNNER+0x1ec, 'II', NODE_POOL+3*0x34, 0)
        self.write(RUNNER+0x440, 'I', 12)
        self.write(RUNNER+0x80, 'fff', 0., 0., -1.)

    def node_id(self, address):
        native_id = self.read(address+0x2c, 'i')[0]
        return native_id if native_id >= 0 else -(address-NODE_POOL)//0x34-1

    def snapshot(self, graph, cleanup=False):
        node = self.read(RUNNER+0x1ec, 'I')[0]
        pool = sum(self.read(NODE_POOL+i*0x34, 'B')[0] != 0 for i in range(len(graph), 512))
        result = dict(pool=pool)
        if cleanup:
            return result
        selected = self.read(RUNNER+0x1f0, 'I')[0]
        segment = self.read(node+0x1c+selected*4, 'I')[0]
        result.update(current=self.node_id(node), next=self.node_id(self.read(node+0x10+selected*4, 'I')[0]),
                      segment=self.segment(segment), refreshAt=self.read(RUNNER+0x1f4, 'f')[0], chain=[])
        while self.read(node+0x2c, 'i')[0] < 0:
            result['chain'].append(self.node_id(node))
            node = self.read(node+0x10, 'I')[0]
        return result


