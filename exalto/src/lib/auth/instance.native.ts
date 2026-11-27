import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, initializeAuth, type Auth, type Persistence } from 'firebase/auth';

import { app } from '@/lib/firebase';

// On React Native, firebase/auth resolves to its RN build, which exports getReactNativePersistence; the public
// typings don't declare it, hence the cast.
const { getReactNativePersistence } = require('firebase/auth') as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};

function create(): Auth {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    return getAuth(app); // Already initialized (fast refresh).
  }
}

/** Native: the session is kept in AsyncStorage so people stay signed in across launches. */
export const auth = create();
