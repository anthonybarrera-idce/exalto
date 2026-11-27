import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { addFavorites, removeFavorite } from '@/lib/auth/profile';

const KEY = 'exalto.favorites.v1';

type FavoritesState = {
  ids: string[];
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => void;
  /** True when liked hymns are kept with the signed-in account, not just this phone. */
  synced: boolean;
};

const FavoritesContext = createContext<FavoritesState | null>(null);

/**
 * Liked hymns. Always kept on the device (newest first). When someone signs in, the phone's likes are merged into
 * their profile (`users/{uid}.favorites`, oldest first) and from then on follow the account.
 */
export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const idsRef = useRef(ids);
  const { user, profile } = useAuth();
  const uid = user?.uid;
  const mergedFor = useRef<string | null>(null);

  const apply = useCallback((next: string[]) => {
    idsRef.current = next;
    setIds(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw || mergedFor.current) return;
        idsRef.current = JSON.parse(raw) as string[];
        setIds(idsRef.current);
      })
      .catch(() => {});
  }, []);

  const remote = profile?.favorites;
  useEffect(() => {
    if (!uid) {
      mergedFor.current = null; // Signed out: keep the phone's copy.
      return;
    }
    if (!remote) return;
    if (mergedFor.current !== uid) {
      mergedFor.current = uid;
      const missing = idsRef.current.filter((id) => !remote.includes(id));
      addFavorites(uid, [...missing].reverse()).catch(() => {});
      apply([...missing, ...[...remote].reverse()]);
    } else {
      apply([...remote].reverse());
    }
  }, [uid, remote, apply]);

  const toggle = useCallback(
    (id: string) => {
      const liked = idsRef.current.includes(id);
      apply(liked ? idsRef.current.filter((x) => x !== id) : [id, ...idsRef.current]);
      if (uid) (liked ? removeFavorite(uid, id) : addFavorites(uid, [id])).catch(() => {});
    },
    [uid, apply],
  );

  const value = useMemo(
    () => ({ ids, isFavorite: (id: string) => ids.includes(id), toggle, synced: Boolean(uid) }),
    [ids, toggle, uid],
  );
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used inside FavoritesProvider');
  return ctx;
}
