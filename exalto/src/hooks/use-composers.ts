import { useEffect, useMemo, useState } from 'react';

import type { Hymn } from '@/context/audio-context';
import type { Hymnal } from '@/data/hymnals';
import { watchComposer, type ComposerPublic } from '@/lib/composers';

/** Composer docs subscribed to at once. */
const COMPOSER_LIMIT = 24;

export type Composer = { uid: string; name: string; handle?: string; photoURL?: string | null; count: number };

/**
 * Composers who own published hymns or visible community hymnals, most hymns first, with their public
 * profile (`composers/{uid}`) once it loads. Before that the name comes from the hymnal or the hymn's author.
 */
export function useComposers(hymns: Hymn[], hymnals: Hymnal[]): Composer[] {
  const base = useMemo(() => {
    const byUid = new Map<string, { name: string; hymnalIds: Set<string> }>();
    for (const h of hymnals) {
      if (h.visible && h.kind === 'community' && h.ownerUid) {
        const c = byUid.get(h.ownerUid) ?? { name: h.createdByName ?? '', hymnalIds: new Set<string>() };
        c.hymnalIds.add(h.id);
        byUid.set(h.ownerUid, c);
      }
    }
    for (const h of hymns) if (h.ownerUid && !byUid.has(h.ownerUid)) byUid.set(h.ownerUid, { name: h.artist, hymnalIds: new Set() });
    return [...byUid.entries()]
      .map(([uid, c]) => ({ uid, name: c.name, count: hymns.filter((h) => h.ownerUid === uid || (h.hymnalId && c.hymnalIds.has(h.hymnalId))).length }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, COMPOSER_LIMIT);
  }, [hymns, hymnals]);

  const [profiles, setProfiles] = useState<Record<string, ComposerPublic | null>>({});
  const key = base.map((c) => c.uid).join(',');
  useEffect(() => {
    if (!key) return;
    const unsubs = key.split(',').map((uid) => watchComposer(uid, (p) => setProfiles((prev) => ({ ...prev, [uid]: p }))));
    return () => unsubs.forEach((u) => u());
  }, [key]);

  return useMemo(
    () =>
      base
        .map((c) => ({ ...c, name: profiles[c.uid]?.displayName || c.name, handle: profiles[c.uid]?.handle || undefined, photoURL: profiles[c.uid]?.photoURL }))
        .filter((c) => c.name),
    [base, profiles],
  );
}
