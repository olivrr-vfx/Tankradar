/**
 * Brand identities of common fuel station chains in DE/AT: colours for the generated logo badge,
 * a short mark, and the website domain used to fetch the real logo (favicon) when allowed.
 */
export interface BrandMeta {
  key: string;
  name: string;
  /** Short text shown in the badge. */
  mark: string;
  bg: string;
  fg: string;
  /** Accent (canopy stripe, pylon) – defaults to fg. */
  accent?: string;
  domain?: string;
}

const B = (key: string, name: string, mark: string, bg: string, fg: string, domain?: string, accent?: string): BrandMeta => ({ key, name, mark, bg, fg, domain, accent });

export const BRANDS: BrandMeta[] = [
  B('aral', 'Aral', 'Aral', '#0a5fb4', '#ffffff', 'aral.de', '#7cc0ff'),
  B('shell', 'Shell', 'Shell', '#fbce07', '#dd1d21', 'shell.de'),
  B('esso', 'Esso', 'Esso', '#ffffff', '#e2231a', 'esso.de', '#1d3b8f'),
  B('total', 'TotalEnergies', 'Total', '#ed1c24', '#ffffff', 'totalenergies.de', '#ffb100'),
  B('avia', 'AVIA', 'AVIA', '#e30613', '#ffffff', 'avia.de'),
  B('jet', 'JET', 'JET', '#ffd400', '#111111', 'jet-tankstellen.de'),
  B('star', 'Star', 'Star', '#ffffff', '#e30613', 'star.de'),
  B('hem', 'HEM', 'HEM', '#d6001c', '#ffffff', 'hem-tankstelle.de'),
  B('agip', 'Agip / Eni', 'eni', '#ffd200', '#111111', 'eni.com'),
  B('eni', 'Eni', 'eni', '#ffd200', '#111111', 'eni.com'),
  B('bft', 'bft', 'bft', '#00539f', '#ffffff', 'bft.de', '#ffd200'),
  B('raiffeisen', 'Raiffeisen', 'RWG', '#007a3d', '#ffe500', 'raiffeisen.com'),
  B('westfalen', 'Westfalen', 'W', '#e2001a', '#ffffff', 'westfalen.com'),
  B('orlen', 'ORLEN', 'ORLEN', '#e2001a', '#ffffff', 'orlen.de'),
  B('omv', 'OMV', 'OMV', '#003b70', '#ffffff', 'omv.at', '#8dc63f'),
  B('bp', 'BP', 'bp', '#009639', '#ffe600', 'bp.com'),
  B('q1', 'Q1', 'Q1', '#e2001a', '#ffffff', 'q1.eu'),
  B('tamoil', 'Tamoil', 'Tamoil', '#ffffff', '#e30613', 'tamoil.de', '#00843d'),
  B('oil', 'OIL!', 'OIL!', '#e30613', '#ffffff', 'oil-tankstellen.de'),
  B('hoyer', 'Hoyer', 'Hoyer', '#e30613', '#ffffff', 'hoyer.de'),
  B('globus', 'Globus', 'Globus', '#004f9f', '#ffffff', 'globus.de'),
  B('classic', 'Classic', 'Classic', '#00529b', '#ffffff'),
  B('markant', 'Markant', 'M', '#e30613', '#ffffff'),
  B('turmoel', 'Turmöl', 'Turm', '#ffd200', '#e30613', 'turmoel.at'),
  B('avanti', 'Avanti', 'Avanti', '#e30613', '#ffffff', 'avanti.at'),
  B('socar', 'SOCAR', 'SOCAR', '#003da5', '#ffffff', 'socar.at'),
  B('mol', 'MOL', 'MOL', '#e2001a', '#ffffff', 'mol.hu'),
  B('diskont', 'Diskont', 'D', '#00a651', '#ffffff'),
];

const ALIASES: [RegExp, string][] = [
  [/\baral\b/i, 'aral'],
  [/\bshell\b/i, 'shell'],
  [/\besso\b/i, 'esso'],
  [/total/i, 'total'],
  [/\bavia\b/i, 'avia'],
  [/\bjet\b/i, 'jet'],
  [/^star\b|\bstar tank/i, 'star'],
  [/\bhem\b/i, 'hem'],
  [/\bagip\b/i, 'agip'],
  [/\beni\b/i, 'eni'],
  [/\bbft\b/i, 'bft'],
  [/raiffeisen|\brwg\b|baywa/i, 'raiffeisen'],
  [/westfalen/i, 'westfalen'],
  [/orlen/i, 'orlen'],
  [/\bomv\b/i, 'omv'],
  [/^bp\b|\bbp\b/i, 'bp'],
  [/\bq1\b/i, 'q1'],
  [/tamoil/i, 'tamoil'],
  [/\boil!?\b/i, 'oil'],
  [/hoyer/i, 'hoyer'],
  [/globus/i, 'globus'],
  [/classic/i, 'classic'],
  [/markant/i, 'markant'],
  [/turm[oö]l/i, 'turmoel'],
  [/avanti/i, 'avanti'],
  [/socar/i, 'socar'],
  [/\bmol\b/i, 'mol'],
  [/diskont/i, 'diskont'],
];

const byKey = new Map(BRANDS.map((b) => [b.key, b]));

/** Neutral but distinct colours for independent stations (stable per name). */
const FREE_COLORS = ['#334155', '#3f3d56', '#14532d', '#7c2d12', '#1e3a8a', '#4a044e', '#134e4a'];

export function brandMeta(brand: string, name = ''): BrandMeta {
  for (const text of [brand, name]) {
    if (!text) continue;
    for (const [re, key] of ALIASES) if (re.test(text)) return byKey.get(key)!;
  }
  const label = (brand || name || '?').trim();
  let h = 0;
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const words = label.replace(/tankstelle|tankcenter|autohof|tank &|wasch/gi, '').trim().split(/\s+/).filter(Boolean);
  const mark = (words[0]?.[0] ?? label[0] ?? '?').toUpperCase() + (words[1]?.[0]?.toUpperCase() ?? '');
  return { key: 'free', name: label, mark, bg: FREE_COLORS[h % FREE_COLORS.length], fg: '#ffffff', accent: '#10c5c1' };
}

/** Real logo via the site favicon (only used when the user allows remote images). */
export function logoUrl(meta: BrandMeta): string | null {
  return meta.domain ? `https://www.google.com/s2/favicons?domain=${meta.domain}&sz=128` : null;
}
