import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, onSnapshot, query, where, type DocumentData } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { Hymn } from '@/context/audio-context';
import { hymnalById, HYMNALS } from '@/data/hymnals';
import { db, firebaseConfigured } from '@/lib/firebase';

const CACHE_KEY = 'exalto.hymns.v1';

type HymnsState = {
  hymns: Hymn[];
  /** True until either the offline cache or the first server snapshot has loaded. */
  loading: boolean;
  /** True while showing cached hymns that haven't been refreshed from the server yet. */
  stale: boolean;
  error: string | null;
  byHymnal: (hymnalId: string) => Hymn[];
};

const HymnsContext = createContext<HymnsState | null>(null);

function toHymn(id: string, d: DocumentData): Hymn {
  const hymnal = hymnalById(d.hymnalId);
  return {
    id,
    title: d.title ?? '',
    artist: d.author || hymnal?.name || '',
    hymnNumber: typeof d.number === 'number' ? d.number : undefined,
    label: d.label || (typeof d.number === 'number' ? String(d.number) : undefined),
    hymnalId: d.hymnalId,
    artworkColor: hymnal?.color,
    audioUri: d.audioUri || undefined,
    lyrics: d.lyrics ?? [],
    practice: typeof d.practiceData?.url === 'string' ? { url: d.practiceData.url, version: Number(d.practiceData.version) || 1 } : undefined,
  };
}

const hymnalOrder = (id?: string) => {
  const i = HYMNALS.findIndex((h) => h.id === id);
  return i === -1 ? HYMNALS.length : i;
};

function sortHymns(list: Hymn[]) {
  return [...list].sort(
    (a, b) =>
      hymnalOrder(a.hymnalId) - hymnalOrder(b.hymnalId) ||
      (a.hymnNumber ?? Infinity) - (b.hymnNumber ?? Infinity) ||
      (a.label ?? '').localeCompare(b.label ?? '') ||
      a.title.localeCompare(b.title),
  );
}

export function HymnsProvider({ children }: { children: React.ReactNode }) {
  const [hymns, setHymns] = useState<Hymn[]>([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = false;

    // Show the last downloaded hymnal right away (and offline).
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        if (!live && raw) {
          setHymns(JSON.parse(raw) as Hymn[]);
          setLoading(false);
        }
      })
      .catch(() => {});

    if (!firebaseConfigured) {
      setError('Firebase is not configured. Add exalto/.env.local.');
      setLoading(false);
      return;
    }

    // Rules only allow the app to read published hymns, so the query must filter on status.
    return onSnapshot(
      query(collection(db, 'hymns'), where('status', '==', 'published')),
      (snap) => {
        live = true;
        const next = sortHymns(snap.docs.map((d) => toHymn(d.id, d.data())));
        setHymns(next);
        setLoading(false);
        setStale(false);
        setError(null);
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, []);

  const value = useMemo<HymnsState>(
    () => ({
      hymns,
      loading,
      stale,
      error,
      byHymnal: (id) => hymns.filter((h) => h.hymnalId === id),
    }),
    [hymns, loading, stale, error],
  );

  return <HymnsContext.Provider value={value}>{children}</HymnsContext.Provider>;
}

export function useHymns() {
  const ctx = useContext(HymnsContext);
  if (!ctx) throw new Error('useHymns must be used inside HymnsProvider');
  return ctx;
}

/** A stable pick for "Hymn of the Day": same hymn all day, changes daily. */
export function pickHymnOfTheDay(list: Hymn[], date = new Date()) {
  if (!list.length) return null;
  const day = Math.floor(date.getTime() / 86_400_000);
  return list[(day * 2654435761) % list.length];
}
