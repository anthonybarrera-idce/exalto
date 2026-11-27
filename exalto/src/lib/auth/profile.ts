import type { User } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { app, db } from '@/lib/firebase';

/** Roles as the admin shows them (admin/src/lib/types.ts). Set only by Cloud Functions. */
export type UserRole = 'listener' | 'composer' | 'moderator' | 'editor' | 'admin' | 'owner';

/** `users/{uid}`: the same fields the admin's Users page reads. People may write their own, never role or status. */
export type Profile = {
  displayName: string;
  handle: string;
  photoURL?: string | null;
  church?: string;
  role: UserRole;
  status: 'active' | 'warned' | 'suspended';
  uploadCount: number;
  /** Liked hymn ids, kept with the account so they follow the person to another phone. */
  favorites: string[];
  createdAt?: Timestamp;
  lastActiveAt?: Timestamp;
};

const userRef = (uid: string) => doc(db, 'users', uid);
/** Handle reservations (`handles/{handle}` → { uid }), so no two people share an @handle. */
const handleRef = (handle: string) => doc(db, 'handles', handle);

export function toProfile(data: Record<string, unknown> | undefined): Profile | null {
  if (!data) return null;
  return {
    displayName: (data.displayName as string) ?? '',
    handle: (data.handle as string) ?? '',
    photoURL: (data.photoURL as string | null) ?? null,
    church: (data.church as string) ?? '',
    role: (data.role as UserRole) ?? 'listener',
    status: (data.status as Profile['status']) ?? 'active',
    uploadCount: (data.uploadCount as number) ?? 0,
    favorites: Array.isArray(data.favorites) ? (data.favorites as string[]) : [],
    createdAt: data.createdAt as Timestamp | undefined,
    lastActiveAt: data.lastActiveAt as Timestamp | undefined,
  };
}

/** Creates the profile on first sign-in (without role or status, as the rules require), or marks it active. */
export async function ensureProfile(user: User, fallbackName?: string) {
  const ref = userRef(user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { lastActiveAt: serverTimestamp() });
    return;
  }
  await setDoc(ref, {
    displayName: user.displayName ?? fallbackName ?? '',
    handle: '',
    photoURL: user.photoURL ?? null,
    church: '',
    uploadCount: 0,
    favorites: [],
    createdAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(),
  });
}

export const HANDLE_PATTERN = /^[a-z0-9_.]{3,20}$/;

/** Lower-case, letters/digits/._ only: "Ana María López" → "anamarialopez". */
export function normalizeHandle(raw: string) {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 20);
}

export function suggestHandle(name: string) {
  const base = normalizeHandle(name.split('@')[0] ?? '');
  return base.length >= 3 ? base : `${base || 'exalto'}${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function isHandleAvailable(handle: string, uid: string) {
  const snap = await getDoc(handleRef(handle));
  return !snap.exists() || snap.data()?.uid === uid;
}

export class HandleTakenError extends Error {}

/** Saves name, handle and church. Claims the new handle and releases the old one in one transaction. */
export async function saveProfile(uid: string, input: { displayName: string; handle: string; church: string }) {
  const handle = normalizeHandle(input.handle);
  await runTransaction(db, async (tx) => {
    const current = toProfile((await tx.get(userRef(uid))).data());
    const old = current?.handle ?? '';
    const claim = handle !== old ? await tx.get(handleRef(handle)) : null;
    const oldClaim = handle !== old && old ? await tx.get(handleRef(old)) : null;
    if (claim?.exists() && claim.data()?.uid !== uid) throw new HandleTakenError(handle);
    if (claim && !claim.exists()) tx.set(handleRef(handle), { uid });
    if (oldClaim?.exists() && oldClaim.data()?.uid === uid) tx.delete(handleRef(old));
    tx.update(userRef(uid), {
      displayName: input.displayName.trim(),
      handle,
      church: input.church.trim(),
      lastActiveAt: serverTimestamp(),
    });
  });
}

export async function addFavorites(uid: string, ids: string[]) {
  if (ids.length) await updateDoc(userRef(uid), { favorites: arrayUnion(...ids) });
}

export async function removeFavorite(uid: string, id: string) {
  await updateDoc(userRef(uid), { favorites: arrayRemove(id) });
}

/**
 * Deletes the signed-in person's account: profile, handle and Firebase Auth user. Runs in the `deleteMyAccount`
 * Cloud Function (admin/functions) because profiles can't be deleted from the app.
 */
export async function deleteMyAccount() {
  await httpsCallable(getFunctions(app, 'us-central1'), 'deleteMyAccount')();
}
