import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where, type Timestamp } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { hymnNumberText } from '@/lib/hymn-number';

/** `composers/{uid}`: the public part of a composer's profile, readable by everyone. */
export type ComposerPublic = { displayName: string; handle: string; photoURL?: string | null; church?: string };

export function watchComposer(uid: string, cb: (c: ComposerPublic | null) => void) {
  return onSnapshot(
    doc(db, 'composers', uid),
    (snap) => {
      const x = snap.data();
      cb(x ? { displayName: x.displayName ?? '', handle: x.handle ?? '', photoURL: x.photoURL ?? null, church: x.church ?? '' } : null);
    },
    () => cb(null),
  );
}

/** Keeps the public composer doc in step with the composer's own profile. */
export async function publishComposer(uid: string, c: ComposerPublic) {
  await setDoc(doc(db, 'composers', uid), {
    displayName: c.displayName.slice(0, 60),
    handle: c.handle.slice(0, 20),
    photoURL: c.photoURL ?? null,
    church: (c.church ?? '').slice(0, 80),
    updatedAt: serverTimestamp(),
  });
}

export type ComposerRequest = { about: string; sampleUrl?: string; status: 'pending' | 'approved' | 'declined'; createdAt?: Timestamp };

export function watchComposerRequest(uid: string, cb: (r: ComposerRequest | null) => void) {
  return onSnapshot(
    doc(db, 'composerRequests', uid),
    (snap) => cb((snap.data() as ComposerRequest | undefined) ?? null),
    () => cb(null),
  );
}

export async function sendComposerRequest(uid: string, input: { displayName: string; handle: string; about: string; sampleUrl: string }) {
  const sampleUrl = input.sampleUrl.trim();
  await setDoc(doc(db, 'composerRequests', uid), {
    displayName: input.displayName,
    handle: input.handle,
    about: input.about.trim().slice(0, 1000),
    ...(sampleUrl ? { sampleUrl: sampleUrl.slice(0, 300) } : {}),
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export async function withdrawComposerRequest(uid: string) {
  await deleteDoc(doc(db, 'composerRequests', uid));
}

export type HymnStatus = 'published' | 'draft' | 'review' | 'hidden';
export type MyHymn = { id: string; title: string; label?: string; hymnalId?: string; status: HymnStatus; hasAudio: boolean };

/** All of a composer's own hymns, any status. The rules allow this only with the `composer` auth claim. */
export function watchMyHymns(uid: string, cb: (list: MyHymn[] | null, error?: string) => void) {
  return onSnapshot(
    query(collection(db, 'hymns'), where('ownerUid', '==', uid)),
    (snap) =>
      cb(
        snap.docs
          .map((d) => {
            const x = d.data();
            return {
              id: d.id,
              title: x.title ?? '',
              label: hymnNumberText({ number: x.number, label: x.label }) ?? undefined,
              hymnalId: x.hymnalId,
              status: (['published', 'draft', 'review', 'hidden'].includes(x.status) ? x.status : 'draft') as HymnStatus,
              hasAudio: Boolean(x.audioUri),
            };
          })
          .sort((a, b) => a.title.localeCompare(b.title)),
      ),
    (e) => cb(null, e.message),
  );
}
