import { clockTower, library, lighthouse, science, stadium, theatre, type LandmarkBuilder } from './landmarks';

/** The dressing corners a district theme draws its clusters from. */
export type Corner = 'park' | 'market' | 'garden' | 'plaza' | 'woods';

export type ThemeId = 'library' | 'science' | 'sports' | 'arts' | 'harbour';

/** A district's identity (art bible section 5): hero landmark, one accent colour repeated on roofs and flags, its clusters. */
export interface DistrictTheme {
  readonly id: ThemeId | 'hub';
  readonly accent: number;
  readonly accentShade: number;
  readonly landmark: LandmarkBuilder;
  readonly corners: readonly Corner[];
}

export const HUB_THEME: DistrictTheme = { id: 'hub', accent: 0x2fa39a, accentShade: 0x1f7a78, landmark: clockTower, corners: ['market', 'park'] };

export const THEMES: Readonly<Record<ThemeId, DistrictTheme>> = {
  library: { id: 'library', accent: 0x2fa39a, accentShade: 0x1f7a78, landmark: library, corners: ['garden', 'plaza'] },
  science: { id: 'science', accent: 0x8bd346, accentShade: 0x5fa83a, landmark: science, corners: ['garden', 'park'] },
  sports: { id: 'sports', accent: 0xf07a5f, accentShade: 0xc9564a, landmark: stadium, corners: ['park', 'plaza'] },
  arts: { id: 'arts', accent: 0xf6c445, accentShade: 0xd49a2a, landmark: theatre, corners: ['market', 'plaza'] },
  harbour: { id: 'harbour', accent: 0xe5484d, accentShade: 0xb23a3e, landmark: lighthouse, corners: ['woods', 'market'] },
};

const ORDER: readonly ThemeId[] = ['library', 'science', 'sports', 'arts', 'harbour'];

const BY_PURPOSE: Readonly<Record<string, ThemeId>> = {
  content: 'library',
  interactivecontent: 'science',
  assessment: 'sports',
  communication: 'arts',
  collaboration: 'arts',
  other: 'harbour',
  administration: 'harbour',
};

/**
 * One theme per district from its activities' purposes: the dominant purpose's theme while it is still unused in the
 * world, else the next unused one in order; past five districts the themes repeat in the same way.
 */
export function pickThemes(districts: readonly (readonly string[])[]): ThemeId[] {
  const used = new Set<ThemeId>();
  return districts.map((purposes) => {
    if (used.size === ORDER.length) used.clear();
    const counts = new Map<ThemeId, number>();
    for (const p of purposes) {
      const t = BY_PURPOSE[p];
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const ranked = [...counts].sort((a, b) => b[1] - a[1] || ORDER.indexOf(a[0]) - ORDER.indexOf(b[0])).map(([t]) => t);
    const theme = ranked.find((t) => !used.has(t)) ?? ORDER.find((t) => !used.has(t))!;
    used.add(theme);
    return theme;
  });
}
