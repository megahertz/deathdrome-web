import assert from 'node:assert/strict';
import test from 'node:test';
import {
  backAction,
  installBackGuard,
  installMenuTaps,
  installEdgeBack,
  deduplicateBack,
  installTopTap,
  nextMenuButton,
} from '../../src/back-navigation.ts';
function event(type: string, fields = {}) {
  const e = new Event(type, { cancelable: true });
  for (const [k, v] of Object.entries(fields)) {
    Object.defineProperty(e, k, { value: v });
  }
  return e;
}
test('Back pauses, then quits, and main menu is a no-op', () => {
  assert.equal(backAction('playing', false), 'pause');
  assert.equal(backAction('paused', false), 'quit');
  assert.equal(backAction('menu', true), 'menu');
  assert.equal(backAction('training', true), 'menu');
  assert.equal(backAction('menu', false), 'none');
  assert.equal(backAction('loading', true), 'none');
});
test('browser Back re-arms one guard without growing history or changing the URL, including reload', () => {
  const events = new EventTarget(),
    location = { href: 'http://game.test/?image=assets/cd.iso' },
    entries = [{}];
  let index = 0;
  let mode = 'playing';
  const actions: unknown[] = [];
  const history = {
    get state() {
      return entries[index];
    },
    replaceState(state: {}, _title: any, url: unknown) {
      assert.equal(url, location.href);
      entries[index] = state;
    },
    pushState(state: {}, _title: any, url: unknown) {
      assert.equal(url, location.href);
      entries.splice(index + 1);
      entries.push(state);
      index++;
    },
    back() {
      index--;
      events.dispatchEvent(event('popstate', { state: entries[index] }));
    },
  };
  const onBack = () => {
    const action = backAction(mode, mode !== 'main');
    actions.push(action);
    if (action === 'pause') {
      mode = 'paused';
    } else if (action === 'quit') {
      mode = 'main';
    }
  };
  let stop = installBackGuard({ events, location, history, onBack });
  assert.equal(entries.length, 2);
  history.back();
  history.back();
  history.back();
  assert.deepEqual(actions, ['pause', 'quit', 'none']);
  assert.equal(entries.length, 2);
  stop();
  stop = installBackGuard({ events, location, history, onBack });
  assert.equal(entries.length, 2);
  stop();
});
function menuSetup(mode = 'menu') {
  const menu = Object.assign(new EventTarget(), {
    contains: (b: { menu: EventTarget }) => b?.menu === menu,
  });
  let time = 1,
    resumed = 0,
    clicks = 0;
  const button = {
      menu,
      disabled: false,
      click() {
        menu.dispatchEvent(
          event('click', {
            target: { closest: () => button },
            detail: 0,
            clientX: 30,
            clientY: 30,
          }),
        );
      },
    },
    target = { closest: () => button };
  installMenuTaps(menu as unknown as HTMLElement, {
    getMode: () => mode,
    onBackgroundTap: () => resumed++,
    now: () => time,
  });
  menu.addEventListener('click', () => clicks++);
  const pointer = (type: string, values = {}) =>
    menu.dispatchEvent(
      event(type, {
        pointerType: 'touch',
        pointerId: 1,
        clientX: 30,
        clientY: 30,
        target,
        ...values,
      }),
    );
  return {
    menu,
    button,
    pointer,
    get clicks() {
      return clicks;
    },
    get resumed() {
      return resumed;
    },
    advance() {
      time += 1000;
    },
  };
}
test('GO activates on the first touch release and the following compatibility click is suppressed', () => {
  const f = menuSetup();
  f.pointer('pointerdown');
  f.pointer('pointerup');
  assert.equal(f.clicks, 1);
  const duplicate = event('click', {
    target: { closest: () => f.button },
    detail: 1,
    clientX: 30,
    clientY: 30,
  });
  f.menu.dispatchEvent(duplicate);
  assert.equal(duplicate.defaultPrevented, true);
  assert.equal(f.clicks, 1);
  f.pointer('pointerdown');
  f.pointer('pointerup');
  assert.equal(f.clicks, 2);
});
test('dragged, canceled and disabled menu taps do not activate', () => {
  const f = menuSetup();
  f.pointer('pointerdown');
  f.pointer('pointerup', { clientX: 80 });
  f.pointer('pointerdown');
  f.pointer('pointercancel');
  f.pointer('pointerup');
  f.button.disabled = true;
  f.pointer('pointerdown');
  f.pointer('pointerup');
  assert.equal(f.clicks, 0);
});
test('a background tap on pause resumes, while Y/N taps only activate their button', () => {
  const f = menuSetup('paused'),
    target = { closest: () => null };
  f.pointer('pointerdown', { target });
  f.pointer('pointerup', { target });
  assert.equal(f.resumed, 1);
  f.pointer('pointerdown');
  f.pointer('pointerup');
  assert.equal(f.resumed, 1);
  assert.equal(f.clicks, 1);
});
test('left-edge swipe works with safe-area inset and does not treat other drags as Back', () => {
  const events = new EventTarget(),
    backs: unknown[] = [];
  installEdgeBack({
    events,
    onBack: (source: any) => backs.push(source),
    edgeWidth: () => 56,
  });
  const p = (type: string, x: number, y = 100, id = 1, pointerType = 'touch') =>
    events.dispatchEvent(
      event(type, { pointerId: id, pointerType, clientX: x, clientY: y }),
    );
  p('pointerdown', 50);
  p('pointerup', 140, 110);
  assert.deepEqual(backs, ['edge']);
  p('pointerdown', 100);
  p('pointerup', 200);
  p('pointerdown', 10);
  p('pointerup', 35);
  p('pointerdown', 10);
  p('pointerup', 85, 200);
  p('pointerdown', 790);
  p('pointerup', 700);
  p('pointerdown', 10, 100, 1, 'mouse');
  p('pointerup', 100, 100, 1, 'mouse');
  assert.equal(backs.length, 1);
});
test('canceled edge swipes and other fingers do not invoke Back or cancel the owner', () => {
  const events = new EventTarget();
  let backs = 0;
  installEdgeBack({ events, onBack: () => backs++ });
  const p = (type: string, id: number, x: number) =>
    events.dispatchEvent(
      event(type, {
        pointerId: id,
        pointerType: 'touch',
        clientX: x,
        clientY: 100,
      }),
    );
  p('pointerdown', 1, 5);
  p('pointerdown', 2, 8);
  p('pointerup', 2, 100);
  assert.equal(backs, 0);
  p('pointercancel', 1, 100);
  p('pointerup', 1, 100);
  assert.equal(backs, 0);
  p('pointerdown', 3, 5);
  p('pointerup', 3, 100);
  assert.equal(backs, 1);
});
test('one swipe plus native popstate performs one back action, while a second swipe still quits', () => {
  let time = 100,
    mode = 'playing';
  const actions: unknown[] = [],
    back = deduplicateBack(
      () => {
        const action = backAction(mode, false);
        actions.push(action);
        mode = action === 'pause' ? 'paused' : 'menu';
      },
      { now: () => time },
    );
  back('edge');
  time += 10;
  back('history');
  assert.deepEqual(actions, ['pause']);
  time += 100;
  back('edge');
  assert.deepEqual(actions, ['pause', 'quit']);
  time += 10;
  back('history');
  assert.equal(actions.length, 2);
});
test('edge-swipe tracking is disabled during gameplay, including mode changes before release', () => {
  const events = new EventTarget();
  let mode = 'playing',
    backs = 0;
  installEdgeBack({
    events,
    onBack: () => backs++,
    enabled: () => mode === 'menu',
  });
  const p = (type: string, x: number) =>
    events.dispatchEvent(
      event(type, {
        pointerId: 1,
        pointerType: 'touch',
        clientX: x,
        clientY: 100,
      }),
    );
  p('pointerdown', 5);
  p('pointerup', 130);
  assert.equal(backs, 0);
  mode = 'menu';
  p('pointerdown', 5);
  mode = 'playing';
  p('pointerup', 130);
  assert.equal(backs, 0);
  mode = 'menu';
  p('pointerdown', 5);
  p('pointerup', 130);
  assert.equal(backs, 1);
});
test('top taps open the phone menu; gameplay swipes, canceled touches and other areas do not', () => {
  const events = new EventTarget();
  let enabled = true,
    taps = 0;
  installTopTap({
    events,
    onTap: () => taps++,
    enabled: () => enabled,
    topHeight: () => 60,
  });
  const p = (type: string, x: number, y: number) =>
    events.dispatchEvent(
      event(type, {
        pointerId: 1,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
      }),
    );
  p('pointerdown', 400, 20);
  p('pointerup', 402, 22);
  assert.equal(taps, 1);
  p('pointerdown', 400, 20);
  p('pointerup', 500, 20);
  p('pointerdown', 400, 100);
  p('pointerup', 400, 100);
  p('pointerdown', 400, 20);
  p('pointercancel', 400, 20);
  p('pointerup', 400, 20);
  enabled = false;
  p('pointerdown', 400, 20);
  p('pointerup', 400, 20);
  assert.equal(taps, 1);
});

test('menu arrows skip disabled demo domains and wrap through enabled actions', () => {
  const arena = { disabled: false },
    back = { disabled: false };
  const buttons = [
    arena,
    ...Array.from({ length: 7 }, () => ({ disabled: true })),
    back,
  ];
  assert.equal(nextMenuButton(buttons, arena, 1), back);
  assert.equal(nextMenuButton(buttons, back, 1), arena);
  assert.equal(nextMenuButton(buttons, arena, -1), back);
  assert.equal(nextMenuButton(buttons, buttons[1], 1), arena);
  assert.equal(nextMenuButton(buttons, null, -1), back);
  assert.equal(nextMenuButton([{ disabled: true }], null, 1), undefined);
  assert.equal(nextMenuButton([], null, -1), undefined);
});
