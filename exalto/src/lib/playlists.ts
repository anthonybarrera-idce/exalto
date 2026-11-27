import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore';

import { db } from '@/lib/firebase';

/**
 * A person's playlist: `users/{uid}/playlists/{id}`, readable and writable only by that person (firestore.rules).
 * Guests keep theirs on the phone in the same shape and they're copied to the account at sign-in.
 */
export type Playlist = {
  id: string;
  name: string;
  description?: string;
  /** Hymn ids in play order. A hymn may be listed more than once. */
  hymnIds: string[];
  /** Milliseconds since 1970. */
  createdAt: number;
  updatedAt: number;
};

const playlistsRef = (uid: string) => collection(db, 'users', uid, 'playlists');
const playlistRef = (uid: string, id: string) => doc(db, 'users', uid, 'playlists', id);

/** A new id that's also a valid Firestore document id. */
export function newPlaylistId(): string {
  return `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const millis = (v: unknown, fallback: number) => ((v as Timestamp | undefined)?.toMillis?.() ?? (typeof v === 'number' ? v : fallback));

/** Live list of someone's playlists, oldest first. */
export function watchPlaylists(uid: string, onChange: (lists: Playlist[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    playlistsRef(uid),
    (snap) => {
      const now = Date.now();
      const lists = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: typeof data.name === 'string' ? data.name : '',
          description: typeof data.description === 'string' && data.description ? data.description : undefined,
          hymnIds: Array.isArray(data.hymnIds) ? data.hymnIds.filter((x: unknown): x is string => typeof x === 'string') : [],
          // Pending server timestamps read as null until the write lands.
          createdAt: millis(data.createdAt, now),
          updatedAt: millis(data.updatedAt, now),
        } satisfies Playlist;
      });
      lists.sort((a, b) => a.createdAt - b.createdAt);
      onChange(lists);
    },
    onError,
  );
}

/** Create or replace a playlist. `createdAt` is kept from the phone when a guest playlist is copied up. */
export function savePlaylist(uid: string, list: Playlist, opts: { isNew?: boolean } = {}) {
  return setDoc(
    playlistRef(uid, list.id),
    {
      name: list.name,
      description: list.description ?? '',
      hymnIds: list.hymnIds,
      updatedAt: serverTimestamp(),
      ...(opts.isNew ? { createdAt: new Date(list.createdAt) } : {}),
    },
    { merge: true },
  );
}

export function deletePlaylist(uid: string, id: string) {
  return deleteDoc(playlistRef(uid, id));
}
