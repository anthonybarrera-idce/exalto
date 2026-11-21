import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const KEY = 'exalto.favorites.v1';

type FavoritesState = {
  ids: string[];
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => void;
};

const FavoritesContext = createContext<FavoritesState | null>(null);

/** Liked hymns, stored on the device until accounts sync them. */
export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setIds(JSON.parse(raw) as string[]))
      .catch(() => {});
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ids, isFavorite: (id: string) => ids.includes(id), toggle }), [ids, toggle]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used inside FavoritesProvider');
  return ctx;
}
