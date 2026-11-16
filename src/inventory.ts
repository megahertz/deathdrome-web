import { GAME_TABLES } from './game-tables.ts';
import type { Runner, Weapon, WeaponName } from './game-types.ts';
export const WEAPON_IDS = GAME_TABLES.combat.weaponIds;
export const WEAPON_NAMES = Object.entries(WEAPON_IDS).reduce<Weapon[]>(
  (a, [name, id]) => (
    (a[id] = name === 'Laser' ? null : (name as WeaponName)),
    a
  ),
  [],
);
export const weaponCode = (name: Weapon) => WEAPON_IDS[name ?? 'Laser'];
// The executable stores four cells independently of the active item count.
// Reads by 42db7c include cells beyond that count; do not clear them on removal.
export function inventoryCells(
  r: Pick<Runner, 'weaponCells' | 'weapons'> & Partial<Runner>,
) {
  r.weaponCells ??= [0, 0, 0, 0];
  r.weapons ??= [null];
  for (let i = 0; i < Math.min(4, r.weapons.length); i++) {
    r.weaponCells[i] = weaponCode(r.weapons[i]);
  }
  return r.weaponCells;
}
export function selectInventoryWeapon(
  r: Pick<
    Runner,
    'ammo' | 'selectedWeapon' | 'weapon' | 'weaponCells' | 'weapons'
  > &
    Partial<Runner>,
) {
  inventoryCells(r);
  r.selectedWeapon ??= 0;
  r.weapon = r.weapons[r.selectedWeapon];
  r.ammo = r.weapon ? 1 : 0;
  return r.weapon;
}
export function appendWeapon(
  r: Pick<Runner, 'weaponCells' | 'weapons'> & Partial<Runner>,
  weapon: Weapon,
) {
  const cells = inventoryCells(r),
    count = r.weapons.length;
  if (count >= 4) {
    return { added: false, matching: false };
  }
  cells[count] = weaponCode(weapon);
  r.weapons.push(weapon);
  return {
    added: true,
    matching: count === 3 && cells[1] === cells[2] && cells[2] === cells[3],
  };
}
export function consumeWeapon(
  r: Pick<
    Runner,
    'ammo' | 'selectedWeapon' | 'weapon' | 'weaponCells' | 'weapons'
  > &
    Partial<Runner>,
) {
  const cells = inventoryCells(r),
    count = r.weapons.length;
  if (count <= 1) {
    return false;
  }
  if (count > 2) {
    for (let i = r.selectedWeapon; i < count - 1; i++) {
      cells[i] = cells[i + 1];
    }
  }
  r.weapons = cells.slice(0, count - 1).map((id: number) => WEAPON_NAMES[id]);
  r.selectedWeapon = 0;
  selectInventoryWeapon(r);
  return true;
}
export function resetInventory(
  r: Pick<
    Runner,
    | 'ammo'
    | 'missileLockTarget'
    | 'muzzleSide'
    | 'nitro'
    | 'nitroTarget'
    | 'selectedWeapon'
    | 'weapon'
    | 'weaponCells'
    | 'weapons'
  > &
    Partial<Runner>,
) {
  const cells = inventoryCells(r);
  cells[0] = WEAPON_IDS.Laser;
  r.weapons = [null];
  r.selectedWeapon = 0;
  r.missileLockTarget = null;
  r.muzzleSide = 0;
  r.nitro = 0;
  r.nitroTarget = null;
  selectInventoryWeapon(r);
}
export function cycleInventory(
  r: Pick<
    Runner,
    | 'ammo'
    | 'missileLockTarget'
    | 'selectedWeapon'
    | 'weapon'
    | 'weaponCells'
    | 'weapons'
  > &
    Partial<Runner>,
) {
  inventoryCells(r);
  r.selectedWeapon = (r.selectedWeapon + 1) % r.weapons.length;
  selectInventoryWeapon(r);
  const id = weaponCode(r.weapon);
  if (id !== 0 && id !== 1) {
    r.missileLockTarget = null;
  }
}
