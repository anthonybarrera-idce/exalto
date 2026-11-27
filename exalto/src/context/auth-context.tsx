import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { auth } from '@/lib/auth/instance';
import { deleteMyAccount, ensureProfile, saveProfile, toProfile, type Profile } from '@/lib/auth/profile';
import { revokeAppleIfLinked, signInWithApple, signInWithGoogle, signOutProviders, type ProviderResult } from '@/lib/auth/providers';
import { publishComposer } from '@/lib/composers';
import { db, firebaseConfigured } from '@/lib/firebase';

/** Pages of the account sheet (opened from the header avatar, or when a feature needs an account). */
export type AccountPage =
  | 'settings'
  | 'welcome'
  | 'email'
  | 'edit'
  | 'delete'
  | 'composer'
  | 'myHymns'
  | 'becomeComposer'
  | 'hymnEditor'
  | 'hymnalEditor';

type AuthState = {
  /** False until Firebase has restored (or ruled out) a saved session. */
  ready: boolean;
  configured: boolean;
  user: User | null;
  profile: Profile | null;
  /** Signed in but hasn't picked a handle yet: show profile setup. */
  needsSetup: boolean;
  /** Has the `composer` auth claim (given by an admin), so can manage their own hymns. */
  isComposer: boolean;
  /** Owner, admin or editor (auth claim `role`): can edit every hymn and hymnal. */
  canEditAll: boolean;
  /** Owner or admin: can also delete hymnals. */
  canManageTeam: boolean;
  /** The role to show: the sign-in claim for team roles (owner, admin, editor, moderator), else composer or listener. */
  displayRole: 'owner' | 'admin' | 'editor' | 'moderator' | 'composer' | 'listener';

  signInApple: () => Promise<ProviderResult>;
  signInGoogle: () => Promise<ProviderResult>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  saveProfile: (input: { displayName: string; handle: string; church: string }) => Promise<void>;
  signOut: () => Promise<void>;
  /** Returns false if the person backed out of Apple's confirmation. */
  deleteAccount: () => Promise<boolean>;

  sheetPage: AccountPage | null;
  openAccount: (page?: AccountPage) => void;
  closeAccount: () => void;
  /** The composer shown on the 'composer' page. */
  composerUid: string | null;
  openComposer: (uid: string) => void;
  editTarget: EditTarget | null;
  openEditor: (target: EditTarget) => void;
};

/** What the editor pages are working on. `returnTo` is the account page Back goes to (none = close the sheet). */
export type EditTarget =
  | { kind: 'hymn'; id?: string; hymnalId?: string; returnTo?: AccountPage }
  | { kind: 'hymnal'; id?: string; returnTo?: AccountPage };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sheetPage, setSheetPage] = useState<AccountPage | null>(null);
  const [composerUid, setComposerUid] = useState<string | null>(null);
  const [composerClaim, setComposerClaim] = useState(false);
  const [staffRole, setStaffRole] = useState<string | null>(null);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setReady(true);
        if (u) ensureProfile(u).catch(() => {}); // Offline: try again next launch.
      }),
    [],
  );

  const uid = user?.uid;
  useEffect(() => {
    setProfile(null);
    if (!uid) return;
    return onSnapshot(
      doc(db, 'users', uid),
      (snap) => setProfile(toProfile(snap.data())),
      () => {},
    );
  }, [uid]);

  // The composer claim lives on the ID token. Refresh it when the profile's role changes (an admin just approved them).
  const role = profile?.role;
  useEffect(() => {
    setComposerClaim(false);
    setStaffRole(null);
    if (!user) return;
    let live = true;
    user
      .getIdTokenResult(true)
      .then((r) => {
        if (!live) return;
        setComposerClaim(r.claims.composer === true);
        setStaffRole(typeof r.claims.role === 'string' ? r.claims.role : null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [user, role]);
  // The profile's role is updated by the same function that sets the claim; trust a demotion to listener right away
  // (an old token can still carry the claim until it refreshes).
  const isComposer = composerClaim && role !== 'listener';
  const canEditAll = staffRole === 'owner' || staffRole === 'admin' || staffRole === 'editor';
  const canManageTeam = staffRole === 'owner' || staffRole === 'admin';
  // Team roles are set on the sign-in token (setUserRole / set-role script) and may not be mirrored on the profile.
  const displayRole: AuthState['displayRole'] =
    staffRole === 'owner' || staffRole === 'admin' || staffRole === 'editor' || staffRole === 'moderator'
      ? staffRole
      : isComposer
        ? 'composer'
        : 'listener';

  // Composers keep a public copy of their name, handle and photo for their composer page.
  const pub = isComposer && uid && profile?.handle ? { displayName: profile.displayName, handle: profile.handle, photoURL: profile.photoURL ?? user?.photoURL ?? null, church: profile.church ?? '' } : null;
  const pubKey = pub ? JSON.stringify(pub) : '';
  useEffect(() => {
    if (pub && uid) publishComposer(uid, pub).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubKey, uid]);

  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const openEditor = useCallback((target: EditTarget) => {
    setEditTarget(target);
    setSheetPage(target.kind === 'hymn' ? 'hymnEditor' : 'hymnalEditor');
  }, []);

  const openComposer = useCallback((id: string) => {
    setComposerUid(id);
    setSheetPage('composer');
  }, []);

  const openAccount = useCallback((page?: AccountPage) => setSheetPage(page ?? 'settings'), []);
  const closeAccount = useCallback(() => setSheetPage(null), []);

  const needsSetup = Boolean(user && profile && !profile.handle);

  // A signed-in account without a handle finishes profile setup before seeing settings.
  useEffect(() => {
    if (needsSetup) setSheetPage((p) => (p === 'settings' ? 'edit' : p));
  }, [needsSetup]);

  const signUpEmail = useCallback(async (email: string, password: string, name: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name.trim()) {
      await updateProfile(cred.user, { displayName: name.trim() });
      await ensureProfile(cred.user, name.trim()).catch(() => {});
    }
  }, []);

  const signOut = useCallback(async () => {
    await signOutProviders();
    await firebaseSignOut(auth);
  }, []);

  const deleteAccount = useCallback(async () => {
    const apple = await revokeAppleIfLinked();
    if (apple === 'cancelled') return false;
    await deleteMyAccount();
    await signOutProviders({ revoke: true });
    await firebaseSignOut(auth).catch(() => {});
    return true;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      configured: firebaseConfigured,
      user,
      profile,
      needsSetup,
      isComposer,
      canEditAll,
      canManageTeam,
      displayRole,
      signInApple: signInWithApple,
      signInGoogle: signInWithGoogle,
      signInEmail: async (email, password) => {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      },
      signUpEmail,
      resetPassword: (email) => sendPasswordResetEmail(auth, email.trim()),
      saveProfile: async (input) => {
        if (!uid) throw new Error('Not signed in');
        await saveProfile(uid, input);
      },
      signOut,
      deleteAccount,
      sheetPage,
      openAccount,
      closeAccount,
      composerUid,
      openComposer,
      editTarget,
      openEditor,
    }),
    [ready, user, profile, needsSetup, isComposer, canEditAll, canManageTeam, signUpEmail, uid, signOut, deleteAccount, sheetPage, openAccount, closeAccount, composerUid, openComposer, editTarget, openEditor],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
