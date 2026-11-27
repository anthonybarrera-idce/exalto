import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

import { auth } from './instance';

/** Web build: Google through Firebase's popup; Sign in with Apple is offered on iOS only. */
export type ProviderResult = { cancelled: true } | { cancelled: false; fullName?: string };

export async function availableProviders() {
  return { apple: false, google: true };
}

export async function signInWithGoogle(): Promise<ProviderResult> {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    return { cancelled: false };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return { cancelled: true };
    throw e;
  }
}

export async function signInWithApple(): Promise<ProviderResult> {
  throw new Error('Sign in with Apple is only available on iOS.');
}

/** Apple asks apps to revoke its tokens when an account is deleted; nothing to do on web. */
export async function revokeAppleIfLinked(): Promise<'done' | 'cancelled' | 'not-linked'> {
  return 'not-linked';
}

export async function signOutProviders(_opts?: { revoke?: boolean }) {}
