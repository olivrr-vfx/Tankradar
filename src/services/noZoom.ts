/**
 * The app itself must not zoom (pinch, double-tap, ctrl+wheel, iOS input auto-zoom) –
 * only the map does. MapLibre handles its own gestures, so everything inside `.map` is exempt.
 */
const inMap = (t: EventTarget | null) => t instanceof Element && !!t.closest('.map, .maplibregl-map');

export function disablePageZoom() {
  // iOS Safari ignores user-scalable=no; gesture events are the reliable way.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => !inMap(e.target) && e.preventDefault(), { passive: false });
  }
  // Two-finger pinch outside the map.
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1 && !inMap(e.target)) e.preventDefault();
    },
    { passive: false },
  );
  // Desktop: ctrl/cmd + wheel and ctrl/cmd + (+/-/0) zoom the page (also in Tauri).
  window.addEventListener(
    'wheel',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && !inMap(e.target)) e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
  });
}
