// electron-builder afterAllArtifactBuild hook (wired up by `npm run dist:mac:signed`).
// Notarizes each .dmg and tries to staple it, so the downloaded installer passes Gatekeeper
// offline too. A failed staple only warns; see notarize-lib.cjs.
const { submit, staple } = require('./notarize-lib.cjs')
const path = require('node:path')

exports.default = async function afterAllArtifactBuild(buildResult) {
  const dmgs = buildResult.artifactPaths.filter((p) => p.endsWith('.dmg'))
  for (const dmg of dmgs) {
    submit(dmg, path.basename(dmg))
    staple(dmg)
  }
  return []
}
