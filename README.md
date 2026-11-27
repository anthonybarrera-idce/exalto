# Exalto

Church hymn platform for Iglesia de Cristo en Elgin. Every app shares one Firebase project, `exalto-fe127`.

| Folder | App | Where it lives |
|---|---|---|
| `exalto/` | Mobile app (Expo: iOS, Android) and its web version | App Store / Google Play, https://web.exalto.app |
| `website/` | Landing page | https://exalto.app |
| `admin/` | Admin web app, plus Firestore/Storage rules and Cloud Functions | https://exalto-admin.web.app |
| `studio/` | Hymn Studio desktop app (Electron, Mac and Windows) | Downloaded installers |
| `services/hymn-studio/` | Python converter bundled into Studio | Not deployed on its own |

See `CLAUDE.md` for how the apps share data, and each folder's README for local development.

## Deploying

Deploy from Terminal while signed in with the **church accounts**:
- Firebase CLI: `firebase login` with the church Google account. Check with `firebase login:list`.
- Google Cloud CLI (Storage CORS only): the church profile, `CLOUDSDK_CONFIG=$HOME/.config/gcloud-idce`.
- Expo / EAS: the account that owns `idcelgin` (`eas whoami`).

All Firebase commands run from **`admin/`**, which holds `firebase.json` and `.firebaserc`. Always deploy a single
target with `--only`. A bare `firebase deploy` would push every site, the rules and the functions at once.

### Firebase Hosting targets

| Target | Site | Built into | Domain |
|---|---|---|---|
| `web` | `exalto-fe127` | `admin/web-dist` | exalto.app |
| `webapp` | `exalto-web-app` | `admin/webapp-dist` | web.exalto.app |
| `admin` | `exalto-admin` | `admin/dist` | exalto-admin.web.app |

### Website (exalto.app)

```bash
cd website && npm install && npm run build      # builds into ../admin/web-dist
cd ../admin && firebase deploy --only hosting:web
```

### Web app (web.exalto.app)

The web build of the mobile app. `npm run export:web` reads the `EXPO_PUBLIC_*` values from `exalto/.env.local`,
so that file must exist with the Firebase and Google settings. Don't commit it.

```bash
cd exalto && npm install && npm run export:web  # builds into ../admin/webapp-dist
cd ../admin && firebase deploy --only hosting:webapp
```

- `https://web.exalto.app/?signin=1` (or `/signin`) opens the sign-in screen. The website's "Sign in" button uses it.
- One-time setup, already done once: the hosting site `exalto-web-app`, the custom domain `web.exalto.app` in Hosting,
  and `web.exalto.app` and `exalto-web-app.web.app` as Auth authorized domains (Firebase console → Authentication →
  Settings).

### Admin (exalto-admin.web.app)

```bash
cd admin && npm install && npm run deploy       # = npm run build && firebase deploy --only hosting:admin
```

### Firestore rules, Storage rules and Cloud Functions

Deploy these whenever `admin/firestore.rules`, `admin/storage.rules` or `admin/functions/` change. Check that
every app's reads and writes are still allowed first (see `CLAUDE.md`).

```bash
cd admin
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage
firebase deploy --only functions                 # or one function: --only functions:deleteMyAccount
```

### Storage CORS

Browsers can only read Storage files (such as `practice.json` and hymnal thumbnails) from the origins listed in
`admin/storage-cors.json`. After adding a web origin there, apply it from the repo root:

```bash
CLOUDSDK_CONFIG=$HOME/.config/gcloud-idce gcloud storage buckets update gs://exalto-fe127.firebasestorage.app --cors-file=admin/storage-cors.json
```

### Mobile app (App Store and Google Play)

Built and submitted with EAS (`exalto/eas.json`). The production profile increments the build number by itself.
Set environment variables in EAS (`eas env:create`) for each environment, not only in `.env.local`.

```bash
cd exalto
eas build --platform ios --profile production
eas submit --platform ios                       # uploads the latest build to App Store Connect
eas build --platform android --profile production
eas submit --platform android                   # uploads to Google Play
```

- Raise `version` in `exalto/app.json` for each store release. EAS manages the build number.
- A build is needed when native modules or `app.json` / `app.config.ts` change. JS-only changes still ship through a
  new build, because over-the-air updates aren't set up.
- Test builds: `eas build --profile preview` (internal distribution) or `--profile development` (dev client).

### Hymn Studio (desktop)

Studio isn't hosted. You build installers and share the files from `studio/release/`.

```bash
cd studio && npm install
npm run dist:mac:signed   # signed and notarized .dmg and .zip (Mac)
npm run dist:win          # .exe installer (Windows, x64)
```

- Notarizing needs `APPLE_KEYCHAIN_PROFILE` (a `xcrun notarytool store-credentials` profile), or `APPLE_ID` +
  `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`, set in your shell. `npm run dist:mac` builds without notarizing,
  for testing only.
- The converter (`services/hymn-studio`) is bundled by `npm run converter`, which the `dist:*` scripts run.
- Studio uploads hymns into Firebase, so deploy `storage` and `firestore:rules` first when its uploads change.
