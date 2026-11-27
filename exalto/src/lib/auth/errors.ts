import type { StringKey } from '@/i18n/strings';

/** Maps Firebase Auth / Functions error codes to a friendly UI string. */
export function authErrorKey(e: unknown): StringKey {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'error.wrongPassword';
    case 'auth/email-already-in-use':
      return 'error.emailInUse';
    case 'auth/weak-password':
      return 'error.weakPassword';
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return 'error.invalidEmail';
    case 'auth/too-many-requests':
      return 'error.tooMany';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'error.network';
    case 'auth/account-exists-with-different-credential':
    case 'auth/credential-already-in-use':
      return 'error.otherProvider';
    case 'auth/invalid-api-key':
    case 'auth/configuration-not-found':
    case 'auth/operation-not-allowed':
    case 'auth/unauthorized-domain':
      return 'error.notConfigured';
    default:
      return 'error.generic';
  }
}
