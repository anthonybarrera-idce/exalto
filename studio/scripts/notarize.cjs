// electron-builder afterSign hook (wired up by `npm run dist:mac:signed`).
// Notarizes the signed .app and tries to staple it before the .dmg and .zip are made, so they
// carry the stapled app when stapling works. See notarize-lib.cjs for why stapling may fail.
const path = require('node:path')
const { notarizeApp, staple } = require('./notarize-lib.cjs')

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  console.log(`Notarizing ${appPath}`)
  notarizeApp(appPath)
  if (!staple(appPath)) {
    console.warn('    The .zip will hold the unstapled app; the .dmg is notarized and stapled separately.\n')
  }
}
