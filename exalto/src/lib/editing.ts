import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';

import { deleteHymnalThumbnailFile } from '@/lib/hymnal-thumbnail';
import type { LyricSection } from '@/context/audio-context';
import { auth } from '@/lib/auth/instance';
import { db } from '@/lib/firebase';
import { hymnNumberText } from '@/lib/hymn-number';

/**
 * Editing hymns and hymnals from the phone. Same documents and rules as the admin and Hymn Studio:
 * owners, admins and editors edit everything; composers edit only their own hymns, in hymnals they own.
 * Every write goes in a batch with an audit log entry, like the admin.
 */

export type HymnStatus = 'published' | 'draft' | 'review' | 'hidden';
export const HYMN_STATUSES: HymnStatus[] = ['published', 'draft', 'review', 'hidden'];

export type EditableHymn = {
  id: string;
  title: string;
  number: number | null;
  label: string;
  hymnalId: string;
  language: 'es' | 'en';
  author: string;
  lyrics: LyricSection[];
  repeatChorus: boolean;
  status: HymnStatus;
  ownerUid?: string;
};

function toEditable(id: string, x: DocumentData): EditableHymn {
  return {
    id,
    title: x.title ?? '',
    number: typeof x.number === 'number' ? x.number : null,
    label: x.label ?? '',
    hymnalId: x.hymnalId ?? '',
    language: x.language === 'en' ? 'en' : 'es',
    author: x.author ?? '',
    lyrics: Array.isArray(x.lyrics) ? x.lyrics : [],
    repeatChorus: x.repeatChorus === true,
    status: HYMN_STATUSES.includes(x.status) ? x.status : 'draft',
    ownerUid: x.ownerUid,
  };
}

export function emptyHymn(hymnalId: string): EditableHymn {
  return { id: '', title: '', number: null, label: '', hymnalId, language: 'es', author: '', lyrics: [], repeatChorus: false, status: 'draft' };
}

export async function loadHymn(id: string) {
  const snap = await getDoc(doc(db, 'hymns', id));
  return snap.exists() ? toEditable(snap.id, snap.data()) : null;
}

/** Hymns of any status: a whole hymnal for staff, or a composer's own (the only query the rules allow them). */
export function watchEditableHymns(scope: { hymnalId: string } | { ownerUid: string }, cb: (list: EditableHymn[] | null, error?: string) => void) {
  const q = 'hymnalId' in scope ? where('hymnalId', '==', scope.hymnalId) : where('ownerUid', '==', scope.ownerUid);
  return onSnapshot(
    query(collection(db, 'hymns'), q),
    (snap) =>
      cb(
        snap.docs
          .map((d) => toEditable(d.id, d.data()))
          .sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.title.localeCompare(b.title)),
      ),
    (e) => cb(null, e.message),
  );
}

function auditBatch(action: string, target: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in again to make changes.');
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'auditLog')), {
    actorUid: user.uid,
    actorName: user.displayName ?? user.email ?? user.uid,
    action,
    target,
    at: serverTimestamp(),
  });
  return { batch, uid: user.uid };
}

/** "Himnos de Gloria" → "himnos-de-gloria" (the id style Hymn Studio uses). */
export function slugify(name: string, max = 40) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max);
}

/** A free `{hymnalId}-{slug}` id for a new hymn, matching Hymn Studio's ids. */
async function newHymnId(hymnalId: string, title: string) {
  const base = `${hymnalId}-${slugify(title, 60) || 'himno'}`;
  for (let i = 0; i < 20; i++) {
    const id = i ? `${base}-${i + 1}` : base;
    if (!(await getDoc(doc(db, 'hymns', id))).exists()) return id;
  }
  return doc(collection(db, 'hymns')).id;
}

const describeHymn = (h: Pick<EditableHymn, 'number' | 'label' | 'title'>) =>
  `${hymnNumberText(h) ? `Hymn ${hymnNumberText(h)} ` : ''}"${h.title}"`;

/** Creates or updates a hymn. A composer's new hymn is marked as theirs (`ownerUid`), as the rules require. */
export async function saveHymn(h: EditableHymn, opts: { asComposer: boolean }) {
  const isNew = !h.id;
  const id = isNew ? await newHymnId(h.hymnalId, h.title) : h.id;
  const { batch, uid } = auditBatch(isNew ? 'Created hymn in the app' : 'Edited hymn in the app', describeHymn(h));
  batch.set(
    doc(db, 'hymns', id),
    {
      title: h.title.trim(),
      number: h.number,
      label: h.label.trim() || null,
      hymnalId: h.hymnalId,
      language: h.language,
      author: h.author.trim(),
      lyrics: h.lyrics.map((s) => ({ type: s.type, ...(s.number != null ? { number: s.number } : {}), lines: s.lines })),
      repeatChorus: h.repeatChorus,
      status: h.status,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      ...(isNew ? { createdAt: serverTimestamp(), recordingCount: 0, tags: [], source: 'exalto-app' } : {}),
      // Composers may only write hymns they own; keep an existing owner when staff edit.
      ...(opts.asComposer ? { ownerUid: uid } : h.ownerUid ? { ownerUid: h.ownerUid } : {}),
    },
    { merge: true },
  );
  await batch.commit();
  return id;
}

export async function deleteHymn(h: EditableHymn) {
  const { batch } = auditBatch('Deleted hymn in the app', describeHymn(h));
  batch.delete(doc(db, 'hymns', h.id));
  await batch.commit();
}

export type EditableHymnal = {
  id: string;
  name: string;
  shortName: string;
  color: string;
  kind: 'official' | 'community';
  visible: boolean;
  offline: boolean;
  order: number;
  ownerUid?: string;
};

export const BUILT_IN_HYMNALS = ['idc-himnario', 'canticos-espirituales', 'community'];

/** Creates or updates a hymnal. Composers' hymnals are always community, theirs, and not downloaded to every phone. */
export async function saveHymnal(h: EditableHymnal, opts: { isNew: boolean; asComposer: boolean; creatorName?: string }) {
  const id = opts.isNew ? slugify(h.name) : h.id;
  if (!/^[a-z0-9-]{2,40}$/.test(id)) throw new Error('invalid-name');
  if (opts.isNew && (BUILT_IN_HYMNALS.includes(id) || (await getDoc(doc(db, 'hymnals', id))).exists())) throw new Error('name-taken');
  const { batch, uid } = auditBatch(opts.isNew ? 'Created hymnal in the app' : 'Edited hymnal in the app', h.name);
  const creatorName = opts.creatorName?.trim().slice(0, 80);
  batch.set(
    doc(db, 'hymnals', id),
    {
      name: h.name.trim().slice(0, 60),
      shortName: (h.shortName.trim() || h.name.trim()).slice(0, 30),
      color: h.color,
      kind: opts.asComposer ? 'community' : h.kind,
      visible: h.visible,
      offline: opts.asComposer ? false : h.offline,
      order: Math.max(0, Math.round(h.order)),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      ...(opts.asComposer ? { ownerUid: uid } : h.ownerUid ? { ownerUid: h.ownerUid } : {}),
      ...(opts.isNew ? { createdAt: serverTimestamp(), createdBy: uid, ...(creatorName ? { createdByName: creatorName } : {}) } : {}),
    },
    { merge: true },
  );
  await batch.commit();
  return id;
}

/** True if any hymn (any status) is still in this hymnal. Composers can only look among their own hymns. */
export async function hymnalHasHymns(hymnalId: string, ownerUid?: string) {
  const filters = [where('hymnalId', '==', hymnalId), ...(ownerUid ? [where('ownerUid', '==', ownerUid)] : [])];
  return !(await getDocs(query(collection(db, 'hymns'), ...filters, limit(1)))).empty;
}

export async function deleteHymnal(h: EditableHymnal) {
  // The cover file first, while the doc still proves who owns it.
  await deleteHymnalThumbnailFile(h.id);
  const { batch } = auditBatch('Deleted hymnal in the app', h.name);
  batch.delete(doc(db, 'hymnals', h.id));
  await batch.commit();
}

/**
 * Splits pasted lyrics into blocks: blank lines separate blocks; a block that starts with a "Coro"/"Chorus" or
 * "Puente"/"Bridge" heading becomes that type (the heading line is dropped). Everything else is a verse.
 */
export function splitLyrics(text: string): LyricSection[] {
  const blocks = text
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((b) => b.length);
  return numberVerses(
    blocks.map((lines) => {
      const head = lines[0].toLowerCase().replace(/[:.\d\s]+$/g, '');
      const type = /^(coro|chorus|estribillo)$/.test(head) ? 'chorus' : /^(puente|bridge)$/.test(head) ? 'bridge' : null;
      const isVerseHead = /^(estrofa|verso|verse)$/.test(head);
      return { type: type ?? 'verse', lines: type || isVerseHead ? lines.slice(1) : lines } as LyricSection;
    }),
  ).filter((s) => s.lines.length);
}

/** Verses are numbered in order (1, 2, 3…); choruses and bridges have no number. */
export function numberVerses(list: LyricSection[]): LyricSection[] {
  let n = 0;
  return list.map((s) => (s.type === 'verse' ? { ...s, number: ++n } : { type: s.type, lines: s.lines }));
}
