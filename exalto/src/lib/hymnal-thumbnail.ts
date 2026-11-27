import { collection, deleteField, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

import { hymnalById } from '@/data/hymnals';
import { auth } from '@/lib/auth/instance';
import { app, db } from '@/lib/firebase';

/**
 * Hymnal cover images, same place and format as the admin's (Storage `hymnals/{id}/thumbnail.*`, URL in the
 * hymnal's `thumbnailUrl`). Every picture is cropped square and shrunk on the phone before upload, so a 12 MP photo
 * becomes a ~100 KB 512 px JPEG and nobody can upload a huge file (Storage also refuses anything over 1 MB).
 */
const SIZE = 512;
const QUALITY = 0.82;
const EXTS = ['webp', 'jpg', 'png'] as const;

type Picker = typeof import('expo-image-picker');
type Manipulator = typeof import('expo-image-manipulator');
function load<T>(get: () => T): T | null {
  try {
    return get();
  } catch {
    return null; // A dev build made before these were added: the cover picker just isn't offered.
  }
}
const Picker = load<Picker>(() => require('expo-image-picker'));
const Manip = load<Manipulator>(() => require('expo-image-manipulator'));

export const canPickThumbnail = Boolean(Picker && Manip);

/** Lets the person pick a photo (square crop where the OS offers it), then squares, shrinks and compresses it. */
export async function pickThumbnail(): Promise<{ uri: string } | null> {
  if (!Picker || !Manip) return null;
  const res = await Picker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  // Centre square of whatever came back (web and some Android pickers ignore the crop).
  const side = Math.min(a.width || SIZE, a.height || SIZE);
  const ctx = Manip.ImageManipulator.manipulate(a.uri);
  if (a.width && a.height && a.width !== a.height) {
    ctx.crop({ originX: Math.floor((a.width - side) / 2), originY: Math.floor((a.height - side) / 2), width: side, height: side });
  }
  if (side > SIZE) ctx.resize({ width: SIZE, height: SIZE });
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ format: Manip.SaveFormat.JPEG, compress: QUALITY });
  return { uri: out.uri };
}

const storage = () => getStorage(app);

/** Which thumbnail file a download URL points at (`…/o/hymnals%2F{id}%2Fthumbnail.webp?…` → 'webp'). */
function extOf(url: string | undefined) {
  const m = url && /thumbnail\.(webp|jpg|png)(?:\?|$)/.exec(decodeURIComponent(url));
  return m ? (m[1] as (typeof EXTS)[number]) : null;
}

/**
 * Deletes the previous thumbnail file when its format differs from the one kept. Only the file the old URL names,
 * so there's no request (and no 404 in the console) for files that never existed.
 */
async function deleteOld(hymnalId: string, oldUrl: string | undefined, keep?: string) {
  const ext = extOf(oldUrl);
  if (!ext || ext === keep) return;
  await deleteObject(ref(storage(), `hymnals/${hymnalId}/thumbnail.${ext}`)).catch((err: { code?: string }) => {
    if (err?.code !== 'storage/object-not-found') throw err;
  });
}

function audited(action: string, target: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in again to make changes.');
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'auditLog')), { actorUid: user.uid, actorName: user.displayName ?? user.email ?? user.uid, action, target, at: serverTimestamp() });
  return { batch, uid: user.uid };
}

/** Uploads a prepared (square, compressed) image and points the hymnal at it. The hymnal doc must exist. */
export async function uploadHymnalThumbnail(hymnalId: string, hymnalName: string, uri: string) {
  const oldUrl = hymnalById(hymnalId)?.thumbnailUrl;
  const blob = await (await fetch(uri)).blob();
  if (blob.size > 1024 * 1024) throw new Error('image-too-large');
  const fileRef = ref(storage(), `hymnals/${hymnalId}/thumbnail.jpg`);
  await uploadBytes(fileRef, blob, { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' });
  const url = await getDownloadURL(fileRef);
  const { batch, uid } = audited('Set hymnal thumbnail in the app', hymnalName);
  batch.update(doc(db, 'hymnals', hymnalId), { thumbnailUrl: url, updatedAt: serverTimestamp(), updatedBy: uid });
  await batch.commit();
  await deleteOld(hymnalId, oldUrl, 'jpg').catch(() => {});
  return url;
}

/**
 * Deletes a hymnal's thumbnail file, for when the hymnal itself is deleted. Call it before deleting the doc: a
 * composer's permission to delete the file is checked against the hymnal doc (storage.rules).
 */
export async function deleteHymnalThumbnailFile(hymnalId: string, url?: string) {
  await deleteOld(hymnalId, url ?? hymnalById(hymnalId)?.thumbnailUrl).catch(() => {});
}

export async function removeHymnalThumbnail(hymnalId: string, hymnalName: string) {
  const oldUrl = hymnalById(hymnalId)?.thumbnailUrl;
  const { batch, uid } = audited('Removed hymnal thumbnail in the app', hymnalName);
  batch.update(doc(db, 'hymnals', hymnalId), { thumbnailUrl: deleteField(), updatedAt: serverTimestamp(), updatedBy: uid });
  await batch.commit();
  await deleteOld(hymnalId, oldUrl).catch(() => {});
}
