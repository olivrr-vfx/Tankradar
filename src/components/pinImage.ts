/**
 * Draws price pins into canvases so MapLibre can render them on the GPU as part of the map
 * (HTML markers have to be repositioned by the browser every frame and lag on phones).
 */
import type { PriceLevel } from '../lib/stats';

export interface PinLook {
  text: string;
  sup: string;
  level: PriceLevel;
  closed: boolean;
  dark: boolean;
  logo?: { bg: string; fg: string; mark: string };
  badge?: string;
  selected?: boolean;
}

const COLORS = {
  light: { cheap: '#0e8443', mid: '#a86400', expensive: '#cc2f32', closed: '#dfe3ea', ink: '#ffffff', closedInk: '#6b7690', ring: '#ffffff' },
  dark: { cheap: '#3ccf7c', mid: '#f0b43c', expensive: '#ff6b6b', closed: '#2a3348', ink: '#0a0f1a', closedInk: '#8590a8', ring: '#121a29' },
};

const FONT = '"Inter Variable", Inter, -apple-system, system-ui, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawPin(look: PinLook, ratio: number): { data: ImageData; width: number; height: number } {
  const c = COLORS[look.dark ? 'dark' : 'light'];
  const scale = look.selected ? 1.18 : 1;
  const s = ratio * scale;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `750 13px ${FONT}`;
  const mainW = measure.measureText(look.text).width;
  measure.font = `750 8.5px ${FONT}`;
  const supW = measure.measureText(look.sup).width;
  const logoW = look.logo ? 19 : 0;
  const badgeW = look.badge ? 19 : 0;
  const padX = 7;
  const bodyW = Math.ceil(padX * 2 + badgeW + logoW + mainW + supW + 1);
  const bodyH = 24;
  const arrow = 6;
  const shadow = 4;
  const W = bodyW + shadow * 2;
  const H = bodyH + arrow + shadow * 2;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(W * s);
  canvas.height = Math.ceil(H * s);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(s, s);
  const x0 = shadow;
  const y0 = shadow - 1;
  const fill = look.closed ? c.closed : c[look.level];
  const ink = look.closed ? c.closedInk : c.ink;

  // shadow + ring + body + arrow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 1.5;
  ctx.fillStyle = c.ring;
  roundRect(ctx, x0 - 2, y0 - 2, bodyW + 4, bodyH + 4, 10);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = c.ring;
  ctx.beginPath();
  ctx.moveTo(x0 + bodyW / 2 - arrow - 2, y0 + bodyH);
  ctx.lineTo(x0 + bodyW / 2, y0 + bodyH + arrow + 2);
  ctx.lineTo(x0 + bodyW / 2 + arrow + 2, y0 + bodyH);
  ctx.fill();
  ctx.fillStyle = fill;
  roundRect(ctx, x0, y0, bodyW, bodyH, 8);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x0 + bodyW / 2 - arrow, y0 + bodyH - 1);
  ctx.lineTo(x0 + bodyW / 2, y0 + bodyH + arrow);
  ctx.lineTo(x0 + bodyW / 2 + arrow, y0 + bodyH - 1);
  ctx.fill();
  if (look.selected) {
    ctx.strokeStyle = '#2f5bff';
    ctx.lineWidth = 2;
    roundRect(ctx, x0 - 3, y0 - 3, bodyW + 6, bodyH + 6, 11);
    ctx.stroke();
  }

  let x = x0 + padX;
  const cy = y0 + bodyH / 2;
  if (look.badge) {
    ctx.fillStyle = look.dark ? '#eef2fa' : '#0d1726';
    ctx.beginPath();
    ctx.arc(x + 8, cy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.dark ? '#0d1726' : '#ffffff';
    ctx.font = `800 9.5px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(look.badge, x + 8, cy + 0.5);
    x += badgeW;
  }
  if (look.logo) {
    ctx.fillStyle = look.logo.bg;
    roundRect(ctx, x, cy - 8, 16, 16, 4.5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = look.logo.fg;
    ctx.font = `800 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(look.logo.mark.slice(0, 1), x + 8, cy + 0.5);
    x += logoW;
  }
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `750 13px ${FONT}`;
  ctx.fillText(look.text, x, cy + 4.6);
  x += mainW + 0.5;
  ctx.font = `750 8.5px ${FONT}`;
  ctx.fillText(look.sup, x, cy - 0.5);

  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), width: canvas.width, height: canvas.height };
}
