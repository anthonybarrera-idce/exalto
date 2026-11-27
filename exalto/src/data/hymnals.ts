import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, onSnapshot } from 'firebase/firestore';
import { useSyncExternalStore } from 'react';

import { db, firebaseConfigured } from '@/lib/firebase';

/**
 * Hymnals come from Firestore (`hymnals/{id}`), edited in the admin and Hymn Studio (admin/src/lib/hymnals.ts).
 * These built-in ones are the defaults: a doc with the same id overrides them, and they're used until the
 * first answer (or offline, from the last saved copy).
 */
export type Hymnal = {
  id: string;
  name: string;
  shortName: string;
  color: string;
  kind: 'official' | 'community';
  visible: boolean;
  /** Cached on the phone so it works offline. */
  offline: boolean;
  order: number;
  /** Name of the person who created it, shown under the hymnal name (not on the built-in hymnals). */
  createdByName?: string;
};

export const DEFAULT_HYMNALS: Hymnal[] = [
  { id: 'idc-himnario', name: 'IDC Himnario', shortName: 'Himnario', color: '#1A6B9A', kind: 'official', visible: true, offline: true, order: 0 },
  { id: 'canticos-espirituales', name: 'Cánticos Espirituales', shortName: 'Cánticos', color: '#7A3E1E', kind: 'official', visible: true, offline: true, order: 1 },
  { id: 'community', name: 'Community', shortName: 'Community', color: '#4A2E6B', kind: 'community', visible: true, offline: false, order: 2 },
];

const CACHE_KEY = 'exalto.hymnals.v1';
let current: Hymnal[] = DEFAULT_HYMNALS;
const listeners = new Set<() => void>();
let started = false;

function merge(docs: Hymnal[]) {
  const byId = new Map(DEFAULT_HYMNALS.map((h) => [h.id, h]));
  for (const d of docs) byId.set(d.id, d);
  return [...byId.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function publish(next: Hymnal[]) {
  current = next;
  listeners.forEach((l) => l());
}

/** Starts watching once (called by HymnsProvider); safe to call again. */
export function watchHymnals() {
  if (started) return;
  started = true;
  AsyncStorage.getItem(CACHE_KEY)
    .then((raw) => raw && current === DEFAULT_HYMNALS && publish(JSON.parse(raw) as Hymnal[]))
    .catch(() => {});
  if (!firebaseConfigured) return;
  onSnapshot(
    collection(db, 'hymnals'),
    (snap) => {
      const next = merge(
        snap.docs.map((d) => {
          const x = d.data();
          const base = DEFAULT_HYMNALS.find((h) => h.id === d.id);
          return {
            id: d.id,
            name: x.name ?? base?.name ?? d.id,
            shortName: x.shortName || base?.shortName || x.name || d.id,
            color: x.color || base?.color || '#4A2E6B',
            kind: x.kind === 'official' ? 'official' : 'community',
            visible: x.visible !== false,
            offline: x.offline === true,
            order: typeof x.order === 'number' ? x.order : (base?.order ?? 99),
            ...(typeof x.createdByName === 'string' && x.createdByName ? { createdByName: x.createdByName } : {}),
          } satisfies Hymnal;
        }),
      );
      publish(next);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
    },
    () => {},
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** All hymnals in display order, hidden ones included. */
export const useHymnals = () => useSyncExternalStore(subscribe, () => current);

export function hymnalById(id: string | undefined) {
  return current.find((h) => h.id === id);
}
