import { getAuth } from 'firebase/auth';

import { app } from '@/lib/firebase';

/** Web: the default browser persistence (IndexedDB) keeps people signed in. */
export const auth = getAuth(app);
