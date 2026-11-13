"""Native arena geometry with the original hot-spot initialization.

SETUP/HOTSPOT/DOMAIN_X world and template commands are supplied explicitly;
43a524 and its marker replacement run unmodified. Full GW/Domain gameplay,
runner/effect creation and the update loop are not executed.
"""
from native_gamegen_loader import GameGenLoader


class ArenaScene(GameGenLoader):
    def __init__(self, arena, round=1):
        super().__init__()
        self.configure_world()
        self.call(0x464280)  # GameGen world is unset while HOTSPOT.GW runs.
        self.templates = []
        for model, name in [('hotspot1', 'HotSpot_dormant'), ('hotspot2', 'HotSpot_active')]+[
                ('hotspot3', f'HotSpot_erupting_{i}') for i in range(6)]:
            root = self.load(model+'.gam')
            self.templates.append(root)
            label = self.reserve(len(name)+1)
            self.cpu.mem_write(label, name.encode()+b'\0')
            self.call(0x44b570, eax=root, edx=label)
        self.call(0x4644dc, eax=self.world)
        self.root = self.load(f'ARENA{arena}.GAM')
        before = self.graph(self.root, self.world, *self.templates)
        self.initial_world_children = before[self.world]['children']
        self.initial_graph = before
        # Static arena query fixture: pickups and exit are managed separately
        # by gameplay. 44b4f0 changes ACTIVE (+24), 44b67c changes only segment
        # intersection (+34); using the latter does not disable ground hits.
        self.disabled = []
        for address, node in before.items():
            name = node['name']
            if name.startswith('enh_') or name == 'exit':
                self.call(0x44b4f0, eax=address, edx=0)
                self.disabled.append({'node': address, 'name': name})
            if len(name) == 6 and name[:4] in ['open', 'lock'] and name[4:].isdigit():
                locked = int(name[4]) > round+1
                self.call(0x44b4f0, eax=address, edx=int(locked == name.startswith('lock')))
                self.call(0x44b66c, eax=address, edx=0)
        if self.call(0x43a524)&255:
            raise RuntimeError('Original hot-spot initialization failed')
        self.hot_spot_count, self.hot_spot_data = self.read(0x48f3ac, 'II')
        self.update()
        self.nodes_after = self.graph(self.root, self.world, *self.templates, *before)

    def hot_spots(self):
        result = []
        for i in range(self.hot_spot_count):
            data = self.hot_spot_data+i*24
            parent = self.read(data, 'I')[0]
            result.append({'name': self.string(parent, 32),
                'alwaysArmed': bool(self.read(data+12, 'B')[0]),
                'phase': self.read(data+13, 'B')[0],
                'seconds': self.read(data+16, 'f')[0],
                'children': self.read(parent+0x68, 'I')[0],
                'altitude': self.read(parent+0x30, 'I')[0],
                'intersect': self.read(parent+0x34, 'I')[0],
                'bbox': self.read(parent+0x38, 'I')[0],
                'corners': [list(self.read(parent+0x74+j*12, '3f')) for j in range(8)]})
        return result
