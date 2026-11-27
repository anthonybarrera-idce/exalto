import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';

import type { Hymn } from '@/context/audio-context';
import { useAuth } from '@/context/auth-context';
import { deletePlaylist, newPlaylistId, savePlaylist, watchPlaylists, type Playlist } from '@/lib/playlists';

/** Playlists made without an account, kept on this phone until the person signs in. */
const GUEST_KEY = 'exalto.playlists.guest.v1';

type PlaylistsState = {
  playlists: Playlist[];
  /** True when playlists are kept with the signed-in account, not just this phone. */
  synced: boolean;
  get: (id: string) => Playlist | undefined;
  create: (name: string, opts?: { description?: string; hymnIds?: string[] }) => string;
  update: (id: string, changes: { name?: string; description?: string }) => void;
  remove: (id: string) => void;
  addHymn: (id: string, hymnId: string) => void;
  /** Remove the hymn at `index` (a hymn can be in a playlist more than once). */
  removeAt: (id: string, index: number) => void;
  /** Remove every copy of a hymn (the add-to-playlist sheet's toggle). */
  removeHymn: (id: string, hymnId: string) => void;
  move: (id: string, from: number, to: number) => void;

  /** The "Add to playlist" sheet, open for this hymn. */
  pickerHymn: Hymn | null;
  openPicker: (hymn: Hymn) => void;
  closePicker: () => void;
  /** The hymn actions menu (Play next, Add to queue, Add to playlist), open for this hymn. */
  menuHymn: Hymn | null;
  menuExtra: MenuExtra[] | null;
  openMenu: (hymn: Hymn, extra?: MenuExtra[]) => void;
  closeMenu: () => void;
};

/** An extra action a screen adds to the hymn menu, e.g. "Remove from this playlist". */
export type MenuExtra = { label: string; Icon: ComponentType<{ size?: number; color?: string }>; onPress: () => void; danger?: boolean };

const PlaylistsContext = createContext<PlaylistsState | null>(null);

/**
 * Playlists. Signed in: `users/{uid}/playlists`, live. Guest: on the phone (AsyncStorage). At sign-in the guest
 * playlists are copied into the account and then cleared from the phone, so they aren't copied again.
 */
export function PlaylistsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [guest, setGuest] = useState<Playlist[]>([]);
  const guestRef = useRef(guest);
  const [remote, setRemote] = useState<Playlist[] | null>(null);
  const remoteRef = useRef(remote);
  remoteRef.current = remote;
  const [pickerHymn, setPickerHymn] = useState<Hymn | null>(null);
  const [menuHymn, setMenuHymn] = useState<Hymn | null>(null);
  const [menuExtra, setMenuExtra] = useState<MenuExtra[] | null>(null);

  const applyGuest = useCallback((next: Playlist[]) => {
    guestRef.current = next;
    setGuest(next);
    AsyncStorage.setItem(GUEST_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(GUEST_KEY)
      .then((raw) => {
        if (raw) {
          guestRef.current = JSON.parse(raw) as Playlist[];
          setGuest(guestRef.current);
        }
      })
      .catch(() => {});
  }, []);

  // Signed in: follow the account's playlists.
  useEffect(() => {
    setRemote(null);
    if (!uid) return;
    return watchPlaylists(uid, setRemote, () => setRemote([]));
  }, [uid]);

  // Copy the guest playlists into the account once both are known, then clear them from the phone.
  useEffect(() => {
    if (!uid || remote === null || !guestRef.current.length) return;
    const have = new Set(remote.map((p) => p.id));
    const missing = guestRef.current.filter((p) => !have.has(p.id));
    Promise.all(missing.map((p) => savePlaylist(uid, p, { isNew: true })))
      .then(() => applyGuest([]))
      .catch(() => {});
  }, [uid, remote, guest, applyGuest]);

  const playlists = uid ? (remote ?? []) : guest;
  const listsRef = useRef(playlists);
  listsRef.current = playlists;

  /** Apply a change to one playlist, on the phone or in the account. */
  const write = useCallback(
    (next: Playlist, opts: { isNew?: boolean } = {}) => {
      const stamped = { ...next, updatedAt: Date.now() };
      if (uid) {
        const cur = remoteRef.current ?? [];
        setRemote(opts.isNew ? [...cur, stamped] : cur.map((p) => (p.id === next.id ? stamped : p)));
        savePlaylist(uid, stamped, opts).catch(() => {});
      } else {
        const cur = guestRef.current;
        applyGuest(opts.isNew ? [...cur, stamped] : cur.map((p) => (p.id === next.id ? stamped : p)));
      }
    },
    [uid, applyGuest],
  );

  const get = useCallback((id: string) => listsRef.current.find((p) => p.id === id), []);

  const create = useCallback(
    (name: string, opts: { description?: string; hymnIds?: string[] } = {}) => {
      const now = Date.now();
      const list: Playlist = {
        id: newPlaylistId(),
        name: name.trim(),
        description: opts.description?.trim() || undefined,
        hymnIds: opts.hymnIds ?? [],
        createdAt: now,
        updatedAt: now,
      };
      write(list, { isNew: true });
      return list.id;
    },
    [write],
  );

  const edit = useCallback(
    (id: string, fn: (p: Playlist) => Playlist) => {
      const cur = get(id);
      if (cur) write(fn(cur));
    },
    [get, write],
  );

  const update = useCallback(
    (id: string, changes: { name?: string; description?: string }) =>
      edit(id, (p) => ({
        ...p,
        ...(changes.name !== undefined ? { name: changes.name.trim() || p.name } : {}),
        ...(changes.description !== undefined ? { description: changes.description.trim() || undefined } : {}),
      })),
    [edit],
  );

  const remove = useCallback(
    (id: string) => {
      if (uid) {
        setRemote((cur) => (cur ?? []).filter((p) => p.id !== id));
        deletePlaylist(uid, id).catch(() => {});
      } else {
        applyGuest(guestRef.current.filter((p) => p.id !== id));
      }
    },
    [uid, applyGuest],
  );

  const addHymn = useCallback((id: string, hymnId: string) => edit(id, (p) => ({ ...p, hymnIds: [...p.hymnIds, hymnId] })), [edit]);
  const removeAt = useCallback(
    (id: string, index: number) => edit(id, (p) => ({ ...p, hymnIds: p.hymnIds.filter((_, i) => i !== index) })),
    [edit],
  );
  const removeHymn = useCallback(
    (id: string, hymnId: string) => edit(id, (p) => ({ ...p, hymnIds: p.hymnIds.filter((h) => h !== hymnId) })),
    [edit],
  );
  const move = useCallback(
    (id: string, from: number, to: number) =>
      edit(id, (p) => {
        if (from === to || from < 0 || from >= p.hymnIds.length) return p;
        const next = [...p.hymnIds];
        const [item] = next.splice(from, 1);
        next.splice(Math.min(Math.max(to, 0), next.length), 0, item);
        return { ...p, hymnIds: next };
      }),
    [edit],
  );

  const value = useMemo<PlaylistsState>(
    () => ({
      playlists,
      synced: Boolean(uid),
      get: (id) => playlists.find((p) => p.id === id),
      create,
      update,
      remove,
      addHymn,
      removeAt,
      removeHymn,
      move,
      pickerHymn,
      openPicker: (hymn) => {
        setMenuHymn(null);
        setPickerHymn(hymn);
      },
      closePicker: () => setPickerHymn(null),
      menuHymn,
      menuExtra,
      openMenu: (hymn, extra) => {
        setMenuExtra(extra ?? null);
        setMenuHymn(hymn);
      },
      closeMenu: () => setMenuHymn(null),
    }),
    [playlists, uid, create, update, remove, addHymn, removeAt, removeHymn, move, pickerHymn, menuHymn, menuExtra],
  );
  return <PlaylistsContext.Provider value={value}>{children}</PlaylistsContext.Provider>;
}

export function usePlaylists() {
  const ctx = useContext(PlaylistsContext);
  if (!ctx) throw new Error('usePlaylists must be used inside PlaylistsProvider');
  return ctx;
}
