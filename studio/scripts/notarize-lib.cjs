// Shared helpers for the Mac notarization hooks (notarize.cjs, notarize-dmg.cjs).
//
// Notarizing (upload to Apple, wait for the verdict) and stapling (download the ticket and
// attach it to the file) are separate steps. Stapling talks to Apple's ticket server
// (api.apple-cloudkit.com); networks that inspect TLS break that connection. A notarized but
// unstapled app still opens when the user is online, so a failed staple is a warning, not a
// failed build. A failed notarization still fails the build.
//
// Credentials come only from the environment, never from files in the repo:
//   APPLE_KEYCHAIN_PROFILE  (a `xcrun notarytool store-credentials` profile), or
//   APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

function credentialArgs() {
  const { APPLE_KEYCHAIN_PROFILE, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } =
    process.env
  if (APPLE_KEYCHAIN_PROFILE) return ['--keychain-profile', APPLE_KEYCHAIN_PROFILE]
  if (APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID) {
    return ['--apple-id', APPLE_ID, '--password', APPLE_APP_SPECIFIC_PASSWORD, '--team-id', APPLE_TEAM_ID]
  }
  throw new Error(
    'Notarizing needs APPLE_KEYCHAIN_PROFILE, or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID.'
  )
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts })
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` }
}

// Uploads `file` (.zip or .dmg) and waits for Apple's verdict. Throws unless Accepted.
function submit(file, label) {
  const creds = credentialArgs()
  console.log(`  • notarizing ${label} (this takes a few minutes)…`)
  const r = run('xcrun', ['notarytool', 'submit', file, ...creds, '--wait', '--output-format', 'json'])
  let info = {}
  try {
    info = JSON.parse(r.out.slice(r.out.indexOf('{')))
  } catch {}
  if (r.code !== 0 || info.status !== 'Accepted') {
    const id = info.id ? `\n  See why: xcrun notarytool log ${info.id} <same credentials>` : ''
    throw new Error(`Notarization of ${label} failed (${info.status || `exit ${r.code}`}).\n${r.out}${id}`)
  }
  console.log(`  • ${label} notarized (submission ${info.id})`)
}

// Notarizes an .app bundle by zipping it the way Apple expects.
function notarizeApp(appPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hymn-notarize-'))
  const zip = path.join(tmp, `${path.basename(appPath, '.app')}.zip`)
  try {
    const z = run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, zip])
    if (z.code !== 0) throw new Error(`Could not zip the app for notarizing:\n${z.out}`)
    submit(zip, path.basename(appPath))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

// Returns true if the ticket was stapled; prints how to do it later if not.
function staple(file) {
  const r = run('xcrun', ['stapler', 'staple', file])
  if (r.code === 0) {
    console.log(`  • stapled ${path.basename(file)}`)
    return true
  }
  console.warn(
    [
      '',
      `  ⚠ Notarized, but could not staple ${path.basename(file)} (stapler exit ${r.code}).`,
      '    Usually this network blocks or inspects the connection to Apple (api.apple-cloudkit.com).',
      '    The file still opens on Macs that are online. To staple later, on a direct connection:',
      `      xcrun stapler staple "${file}"`,
      '',
    ].join('\n')
  )
  return false
}

module.exports = { notarizeApp, submit, staple }

// `node scripts/notarize-lib.cjs --check`: fail fast, before the build, if credentials are missing.
if (require.main === module && process.argv.includes('--check')) {
  try {
    credentialArgs()
  } catch (e) {
    console.error(`${e.message}\nSee "Notarizing and stapling" in studio/PACKAGING.md.`)
    process.exit(1)
  }
}
