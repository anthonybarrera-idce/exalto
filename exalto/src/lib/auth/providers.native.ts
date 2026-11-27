import { GoogleAuthProvider, OAuthProvider, revokeAccessToken, signInWithCredential, updateProfile } from 'firebase/auth';
import { Platform } from 'react-native';

import { auth } from './instance';

export type ProviderResult = { cancelled: true } | { cancelled: false; fullName?: string };

// Native modules are loaded lazily: a dev client built before these packages were added has no native side,
// and the app must keep working there (guest mode, email sign-in) instead of crashing at import.
type AppleModule = typeof import('expo-apple-authentication');
type CryptoModule = typeof import('expo-crypto');
type GoogleModule = typeof import('@react-native-google-signin/google-signin');

function load<T>(get: () => T): T | null {
  try {
    return get();
  } catch {
    return null;
  }
}
const Apple = Platform.OS === 'ios' ? load<AppleModule>(() => require('expo-apple-authentication')) : null;
const Crypto = load<CryptoModule>(() => require('expo-crypto'));
const Google = load<GoogleModule>(() => require('@react-native-google-signin/google-signin'));

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleConfigured = Boolean(Google && WEB_CLIENT_ID && (Platform.OS !== 'ios' || IOS_CLIENT_ID));
if (googleConfigured) Google!.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID });

export async function availableProviders() {
  const apple = Boolean(Apple && Crypto) && (await Apple!.isAvailableAsync().catch(() => false));
  return { apple, google: googleConfigured };
}

/** Apple sign-in with a hashed nonce, as Firebase requires. Returns the raw credential pieces. */
async function appleCredential() {
  if (!Apple || !Crypto) throw new Error('Sign in with Apple needs a new build of the app.');
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  try {
    const cred = await Apple.signInAsync({
      requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    return { cred, rawNonce };
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw e;
  }
}

export async function signInWithApple(): Promise<ProviderResult> {
  const r = await appleCredential();
  if (!r) return { cancelled: true };
  const { cred, rawNonce } = r;
  if (!cred.identityToken) throw new Error('Apple did not return an identity token.');
  const result = await signInWithCredential(auth, new OAuthProvider('apple.com').credential({ idToken: cred.identityToken, rawNonce }));
  // Apple shares the name only the first time; keep it on the Firebase user.
  const fullName = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') || undefined;
  if (fullName && !result.user.displayName) await updateProfile(result.user, { displayName: fullName }).catch(() => {});
  return { cancelled: false, fullName };
}

export async function signInWithGoogle(): Promise<ProviderResult> {
  if (!Google || !googleConfigured) throw new Error('Google sign-in is not set up in this build.');
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = Google;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return { cancelled: true };
    if (!res.data.idToken) throw new Error('Google did not return an ID token.');
    await signInWithCredential(auth, GoogleAuthProvider.credential(res.data.idToken));
    return { cancelled: false };
  } catch (e) {
    if (isErrorWithCode(e) && (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)) return { cancelled: true };
    throw e;
  }
}

/**
 * Apple requires apps to revoke Sign in with Apple tokens when someone deletes their account. That needs a fresh
 * authorization code, so this asks the person to confirm with Apple once more.
 */
export async function revokeAppleIfLinked(): Promise<'done' | 'cancelled' | 'not-linked'> {
  const linked = auth.currentUser?.providerData.some((p) => p.providerId === 'apple.com');
  if (!linked || !Apple) return 'not-linked';
  const r = await appleCredential();
  if (!r) return 'cancelled';
  if (r.cred.authorizationCode) await revokeAccessToken(auth, r.cred.authorizationCode);
  return 'done';
}

export async function signOutProviders(opts?: { revoke?: boolean }) {
  if (!Google || !googleConfigured) return;
  if (opts?.revoke) await Google.GoogleSignin.revokeAccess().catch(() => {});
  await Google.GoogleSignin.signOut().catch(() => {});
}
