/** Mirrors admin/src/lib/hymnals.ts. */
export type Hymnal = { id: string; name: string; shortName: string; color: string };

export const HYMNALS: Hymnal[] = [
  { id: 'idc-himnario', name: 'IDC Himnario', shortName: 'Himnario', color: '#1A6B9A' },
  { id: 'canticos-espirituales', name: 'Cánticos Espirituales', shortName: 'Cánticos', color: '#7A3E1E' },
  { id: 'community', name: 'Community', shortName: 'Community', color: '#4A2E6B' },
];

export function hymnalById(id: string | undefined) {
  return HYMNALS.find((h) => h.id === id);
}
