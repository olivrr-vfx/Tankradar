import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { haptic } from '../services/haptics';
import { RadarLoader } from './motion';

export type SheetState = 'peek' | 'half' | 'full';
const ORDER: SheetState[] = ['peek', 'half', 'full'];

const isNarrow = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px)').matches;

/**
 * Bottom sheet on phones (real height snapping, so the list always scrolls inside the visible
 * area), plain side panel on wide screens. Optional pull-to-refresh on the list.
 */
export function Sheet({
  children,
  header,
  state,
  onState,
  onRefresh,
}: {
  children: ReactNode;
  header?: ReactNode;
  state: SheetState;
  onState: (s: SheetState) => void;
  onRefresh?: () => Promise<void>;
}) {
  const ref = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; h: number; t: number; lastY: number; lastT: number } | null>(null);
  const [dragH, setDragH] = useState<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStart = useRef<number | null>(null);

  const heights = () => {
    const parent = ref.current?.parentElement?.clientHeight ?? window.innerHeight;
    return { peek: 88, half: Math.round(parent * 0.5), full: parent - 96 } as Record<SheetState, number>;
  };

  useLayoutEffect(() => setDragH(null), [state]);

  const onDown = (e: React.PointerEvent) => {
    if (!isNarrow()) return;
    const h = ref.current?.getBoundingClientRect().height ?? 0;
    drag.current = { y: e.clientY, h, t: performance.now(), lastY: e.clientY, lastT: performance.now() };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const hs = heights();
    const h = Math.max(hs.peek - 30, Math.min(hs.full + 20, d.h - (e.clientY - d.y)));
    d.lastY = e.clientY;
    d.lastT = performance.now();
    setDragH(h);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) < 6) {
      // tap on the grip cycles the sheet
      onState(state === 'full' ? 'half' : state === 'half' ? 'full' : 'half');
      setDragH(null);
      return;
    }
    const hs = heights();
    const v = (e.clientY - d.lastY) / Math.max(1, performance.now() - d.lastT); // px/ms, + = down
    const h = d.h - dy - v * 180; // project the fling
    let best: SheetState = 'half';
    for (const s of ORDER) if (Math.abs(hs[s] - h) < Math.abs(hs[best] - h)) best = s;
    if (best !== state) void haptic('light');
    onState(best);
    setDragH(null);
  };

  // Pull to refresh (only when the list is scrolled to the top)
  useEffect(() => {
    const el = body.current;
    if (!el || !onRefresh) return;
    const start = (e: TouchEvent) => {
      pullStart.current = el.scrollTop <= 0 ? e.touches[0].clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (pullStart.current == null || refreshing) return;
      const dy = e.touches[0].clientY - pullStart.current;
      if (dy > 0 && el.scrollTop <= 0) {
        setPull(Math.min(90, dy * 0.5));
        if (dy > 10) e.preventDefault();
      } else setPull(0);
    };
    const end = async () => {
      if (pullStart.current == null) return;
      pullStart.current = null;
      if (pull > 60) {
        setRefreshing(true);
        void haptic('medium');
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
      setPull(0);
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
    };
  }, [onRefresh, pull, refreshing]);

  const style = dragH != null ? { height: dragH, transition: 'none' } : undefined;
  const ptr = refreshing ? 56 : pull;

  return (
    <aside ref={ref} className={`sheet sheet-${state}`} style={style}>
      <div
        className="sheet-grip"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="button"
        aria-label="Panel"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onState(state === 'full' ? 'peek' : state === 'peek' ? 'half' : 'full')}
      >
        <span className="grip-bar" />
        {header}
      </div>
      <div className="sheet-body" ref={body}>
        {onRefresh && (
          <div className="ptr" style={{ height: ptr, opacity: Math.min(1, ptr / 50) }}>
            <span style={{ transform: `rotate(${pull * 4}deg)` }}>
              <RadarLoader size={26} />
            </span>
          </div>
        )}
        {children}
      </div>
    </aside>
  );
}
