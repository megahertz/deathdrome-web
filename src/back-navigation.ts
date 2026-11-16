export function backAction(mode: string, hasMenuBack: boolean) {
  if (mode === 'playing') {
    return 'pause';
  }
  if (mode === 'paused') {
    return 'quit';
  }
  if (mode === 'loading') {
    return 'none';
  }
  return hasMenuBack ? 'menu' : 'none';
}
export function installBackGuard({
  history,
  location,
  events,
  onBack,
}: {
  history: Pick<History, 'state' | 'pushState' | 'replaceState'>;
  location: Pick<Location, 'href'>;
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  onBack: (source: string) => void;
}) {
  const marker = 'deathdromeBackGuard',
    state = () =>
      history.state && typeof history.state === 'object' ? history.state : {};
  const arm = () =>
    history.pushState({ ...state(), [marker]: 'guard' }, '', location.href);
  if (state()[marker] !== 'guard') {
    history.replaceState({ ...state(), [marker]: 'base' }, '', location.href);
    arm();
  }
  const pop = (event: { state: { [x: string]: string } }) => {
    if (event.state?.[marker] === 'guard') {
      return;
    }
    onBack('history');
    arm();
  };
  events.addEventListener('popstate', pop);
  return () => events.removeEventListener('popstate', pop);
}

export function installEdgeBack({
  events,
  onBack,
  edgeWidth = () => 28,
  enabled = () => true,
  now = () => performance.now(),
}: {
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  onBack: (source: string) => void;
  edgeWidth?: () => number;
  enabled?: () => boolean;
  now?: () => number;
}) {
  let finger: { id: any; x?: any; y?: any } | null = null,
    lastSwipe = -Infinity;
  const down = (e: {
    pointerType: string;
    clientX: number;
    pointerId: any;
    clientY: any;
  }) => {
    if (
      !enabled() ||
      e.pointerType === 'mouse' ||
      finger ||
      e.clientX > edgeWidth()
    ) {
      return;
    }
    finger = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const cancel = (e: { pointerId: any }) => {
    if (finger?.id === e.pointerId) {
      finger = null;
    }
  };
  const up = (e: {
    pointerId: any;
    clientX: number;
    clientY: number;
    preventDefault: () => void;
  }) => {
    const p = finger;
    if (!p || p.id !== e.pointerId) {
      return;
    }
    finger = null;
    if (!enabled()) {
      return;
    }
    const dx = e.clientX - p.x,
      dy = Math.abs(e.clientY - p.y);
    if (dx < 64 || dx < dy * 1.8) {
      return;
    }
    e.preventDefault();
    lastSwipe = now();
    onBack('edge');
  };
  const click = (e: {
    detail: any;
    preventDefault: () => void;
    stopImmediatePropagation: () => void;
  }) => {
    if (e.detail && now() - lastSwipe < 700) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  events.addEventListener('pointerdown', down, true);
  events.addEventListener('pointerup', up, true);
  events.addEventListener('pointercancel', cancel, true);
  events.addEventListener('click', click, true);
  return () => {
    events.removeEventListener('pointerdown', down, true);
    events.removeEventListener('pointerup', up, true);
    events.removeEventListener('pointercancel', cancel, true);
    events.removeEventListener('click', click, true);
  };
}

export function installTopTap({
  events,
  onTap,
  enabled,
  topHeight,
}: {
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  onTap: () => void;
  enabled: () => boolean;
  topHeight: () => number;
}) {
  const fingers = new Map();
  events.addEventListener(
    'pointerdown',
    (e: {
      pointerType: string;
      clientY: number;
      pointerId: any;
      clientX: any;
    }) => {
      if (e.pointerType !== 'mouse' && enabled() && e.clientY <= topHeight()) {
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
    },
    true,
  );
  events.addEventListener(
    'pointercancel',
    (e: { pointerId: any }) => fingers.delete(e.pointerId),
    true,
  );
  events.addEventListener(
    'pointerup',
    (e: {
      pointerId: any;
      clientX: number;
      clientY: number;
      preventDefault: () => void;
    }) => {
      const p = fingers.get(e.pointerId);
      fingers.delete(e.pointerId);
      if (
        p &&
        enabled() &&
        Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 14
      ) {
        e.preventDefault();
        onTap();
      }
    },
    true,
  );
}

export function deduplicateBack(
  onBack: { (): void; (): void; (): void },
  { now = () => performance.now() } = {},
) {
  let source: string | null = null,
    at = -Infinity;
  return (next: string) => {
    const t = now();
    if (
      ((next === 'edge' && source === 'history') ||
        (next === 'history' && source === 'edge')) &&
      t - at < 700
    ) {
      return;
    }
    source = next;
    at = t;
    onBack();
  };
}

// Touch menu taps activate on release, without Safari's hover-first click.
// Suppress only the compatibility click from that same physical tap.
export function installMenuTaps(
  menu: HTMLElement,
  {
    getMode,
    onBackgroundTap,
    now = () => performance.now(),
    surface = menu,
  }: {
    getMode: () => string;
    onBackgroundTap: () => unknown;
    now?: () => number;
    surface?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  },
) {
  const fingers = new Map();
  let activated: { at: any; x: any; y: any } | null = null;
  const button = (e: PointerEvent) => {
    const b = (e.target as Element | null)?.closest<HTMLButtonElement>(
      'button',
    );
    return b && menu.contains(b) ? b : null;
  };
  surface.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      return;
    }
    fingers.set(e.pointerId, {
      button: button(e),
      x: e.clientX,
      y: e.clientY,
      mode: getMode(),
    });
  });
  surface.addEventListener('pointercancel', (e) => fingers.delete(e.pointerId));
  surface.addEventListener('pointerup', (e) => {
    const p = fingers.get(e.pointerId);
    fingers.delete(e.pointerId);
    if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 14) {
      return;
    }
    const b = button(e);
    if (p.button === b && b && !b.disabled) {
      e.preventDefault();
      activated = { at: now(), x: e.clientX, y: e.clientY };
      b.click();
    } else if (
      !p.button &&
      !b &&
      p.mode === 'paused' &&
      getMode() === 'paused'
    ) {
      e.preventDefault();
      onBackgroundTap();
    }
  });
  menu.addEventListener(
    'click',
    (e) => {
      if (
        e.detail &&
        activated &&
        now() - activated.at < 700 &&
        Math.hypot(e.clientX - activated.x, e.clientY - activated.y) < 18
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
}

export function nextMenuButton<T extends { disabled: boolean }>(
  buttons: readonly T[],
  active: unknown,
  direction: 1 | -1,
): T | undefined {
  const enabled = buttons.filter((button) => !button.disabled);
  const index = enabled.indexOf(active as T);
  if (index === -1) {
    return direction === 1 ? enabled[0] : enabled.at(-1);
  }
  return enabled[(index + direction + enabled.length) % enabled.length];
}
