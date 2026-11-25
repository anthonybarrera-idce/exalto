import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, onSnapshot, query, where, type DocumentData } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { Hymn } from '@/context/audio-context';
import { useHymnals, watchHymnals, type Hymnal } from '@/data/hymnals';
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

function toHymn(id: string, d: DocumentData, hymnals: Hymnal[]): Hymn {
  const hymnal = hymnals.find((h) => h.id === d.hymnalId);
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

function sortHymns(list: Hymn[], hymnals: Hymnal[]) {
  const hymnalOrder = (id?: string) => {
    const i = hymnals.findIndex((h) => h.id === id);
    return i === -1 ? hymnals.length : i;
  };
  return [...list].sort(
    (a, b) =>
      hymnalOrder(a.hymnalId) - hymnalOrder(b.hymnalId) ||
      (a.hymnNumber ?? Infinity) - (b.hymnNumber ?? Infinity) ||
      (a.label ?? '').localeCompare(b.label ?? '') ||
      a.title.localeCompare(b.title),
  );
}

export function HymnsProvider({ children }: { children: React.ReactNode }) {
  // Published hymn docs as the server sent them; display fields (color, order) come from the live hymnal list.
  const [docs, setDocs] = useState<{ id: string; data: DocumentData }[]>([]);
  const [cached, setCached] = useState<Hymn[]>([]);
  const hymnals = useHymnals();
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = false;
    watchHymnals();

    // Show the last downloaded hymnal right away (and offline).
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        if (!live && raw) {
          setCached(JSON.parse(raw) as Hymn[]);
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
        setDocs(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
        setLoading(false);
        setStale(false);
        setError(null);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, []);

  // Hymns in hidden hymnals don't show; the offline copy keeps only hymnals marked "available offline".
  const hymns = useMemo(() => {
    const shown = new Set(hymnals.filter((h) => h.visible).map((h) => h.id));
    const list = stale ? cached : docs.map((d) => toHymn(d.id, d.data, hymnals));
    return sortHymns(list.filter((h) => !h.hymnalId || shown.has(h.hymnalId) || !hymnals.some((x) => x.id === h.hymnalId)), hymnals);
  }, [docs, cached, stale, hymnals]);

  useEffect(() => {
    if (stale) return;
    const offline = new Set(hymnals.filter((h) => h.offline).map((h) => h.id));
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(hymns.filter((h) => h.hymnalId && offline.has(h.hymnalId)))).catch(() => {});
  }, [hymns, hymnals, stale]);

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
