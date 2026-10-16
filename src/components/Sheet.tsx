import { useEffect, useRef, useState, type ReactNode } from 'react';

export type SheetState = 'peek' | 'half' | 'full';

/** Draggable bottom sheet for narrow screens; a plain side panel on wide screens (via CSS). */
export function Sheet({ children, header, state, onState }: { children: ReactNode; header?: ReactNode; state: SheetState; onState: (s: SheetState) => void }) {
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; start: number } | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => setOffset(0), [state]);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, start: Date.now() };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset(e.clientY - drag.current.y);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.y;
    const fast = Date.now() - drag.current.start < 250;
    drag.current = null;
    const order: SheetState[] = ['peek', 'half', 'full'];
    const i = order.indexOf(state);
    if (Math.abs(dy) < 6) onState(order[(i + 1) % 3] === 'peek' && state === 'full' ? 'half' : order[Math.min(2, i + 1)] ?? 'half');
    else if (dy < -40 || (fast && dy < -10)) onState(order[Math.min(2, i + 1)]);
    else if (dy > 40 || (fast && dy > 10)) onState(order[Math.max(0, i - 1)]);
    setOffset(0);
  };

  return (
    <aside ref={ref} className={`sheet sheet-${state}`} style={offset ? { transform: `translateY(${offset}px)`, transition: 'none' } : undefined}>
      <div className="sheet-grip" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="button" aria-label="Panel" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onState(state === 'full' ? 'peek' : state === 'peek' ? 'half' : 'full')}>
        <span className="grip-bar" />
        {header}
      </div>
      <div className="sheet-body">{children}</div>
    </aside>
  );
}
