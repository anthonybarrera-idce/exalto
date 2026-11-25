/**
 * Build the standalone converter (services/hymn-studio/dist/hymn-cli) with PyInstaller, for this OS.
 * PyInstaller can't cross-compile: build the Mac app on a Mac and the Windows app on Windows.
 */
const { execFileSync } = require("node:child_process")
const { join } = require("node:path")

const service = join(__dirname, "..", "..", "services", "hymn-studio")
const pyinstaller = process.platform === "win32" ? join(service, ".venv", "Scripts", "pyinstaller.exe") : join(service, ".venv", "bin", "pyinstaller")
execFileSync(pyinstaller, ["hymn-cli.spec", "--noconfirm", "--distpath", "../dist", "--workpath", "../build/pyinstaller"], {
  cwd: join(service, "packaging"),
  stdio: "inherit",
})
