# Exalto monorepo

One Firebase project (`exalto-fe127`) shared by several apps:

| Folder | App |
|---|---|
| `exalto/` | Mobile app (Expo, iOS/Android/web), see `exalto/AGENTS.md` |
| `admin/` | Admin web app (Vite + React), plus `firestore.rules`, `storage.rules`, Cloud Functions in `admin/functions` |
| `studio/` | Hymn Studio desktop app (Electron) |
| `services/hymn-studio/` | Python converter used by Studio (slides/PDF → score, lyrics, audio, `practice.json`) |
| `website/` | exalto.app landing page |

## Keep the apps in sync

When a change touches something the apps share, update **every app that uses it** in the same task,
or list in your report what still needs doing in the others. Don't leave one app writing data another
can't read.

Shared things to check:
- **Firestore data shapes:** `hymns`, `hymnals`, `users`, `handles`, `studioAccess`, `auditLog`, composer requests.
  - Who reads and writes them: the mobile app (`exalto/src/lib`, `exalto/src/context`), the admin (`admin/src/lib`) and Studio (`studio/src/renderer/src/lib`).
  - A new or renamed field needs the writers, the readers, and the types in each app.
- **Hymn fields:** number vs. display label, hymnal, status, lyrics sections, recordings (`audioUri`, `acapellaUri`), `practice`, `ownerUid`.
- **Hymnals:** name, color, kind, visibility, offline, order, `thumbnailUrl`. They're edited in the admin, Studio and the app.
- **Roles and access:** custom claims (`role`, `composer`), `setUserRole` and related Cloud Functions, and what each app shows per role.
- **Security rules:** `admin/firestore.rules` and `admin/storage.rules` must allow what every app writes. Rules and functions aren't deployed by Claude; give the user the deploy command.
- **`practice.json` format:** written by `services/hymn-studio`, read by the mobile app's practice tool and by Studio.
- **User-facing wording:** Spanish and English strings live in each app (`exalto/src/i18n/strings.ts`, `studio/src/renderer/src/lib/i18n.ts`, the admin's pages). Keep terms consistent across apps.

## Working in this repo

- Never read, print or commit `.env` / `.env.local` files or credentials.
- Deploys (Firebase rules, functions, hosting) and pushes are done by the user from Terminal with the church account.
- Commits in this folder use the church git identity (`~/.gitconfig-idce`).
