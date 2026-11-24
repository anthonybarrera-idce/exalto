// Renders the app icon from the Exalto mark on the macOS icon grid, light and dark:
// build/icon.png + .icns and build/icon-dark.png + .icns.
//   npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require("electron")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..")
const mark = fs.readFileSync(path.join(root, "src/renderer/src/assets/exalto-mark.svg"), "utf8")
const TILES = {
  light: "background:linear-gradient(160deg,#ffffff 0%,#f3f7fb 55%,#e8eef6 100%);box-shadow:0 10px 24px rgba(0,0,0,.22),inset 0 0 0 1px rgba(0,0,0,.06)",
  dark: "background:linear-gradient(160deg,#2a2f38 0%,#1a1d23 55%,#111318 100%);box-shadow:0 10px 24px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.08)",
}
const page = (tile) => `<!doctype html><html><head><style>
  html,body{margin:0;width:1024px;height:1024px;background:transparent;overflow:hidden}
  /* Apple's icon grid: an 824px rounded tile centred in 1024px, soft shadow below */
  .tile{position:absolute;left:100px;top:92px;width:824px;height:824px;border-radius:185px;${tile}}
  .mark{position:absolute;left:50%;top:50%;width:470px;height:470px;transform:translate(-50%,-50%)}
  .mark svg{width:100%;height:100%}
</style></head><body><div class="tile"><div class="mark">${mark}</div></div></body></html>`

async function render(tile, file) {
  const w = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false,
    webPreferences: { offscreen: true } })
  await w.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(page(tile)))
  await new Promise((r) => setTimeout(r, 400))
  const img = (await w.webContents.capturePage()).resize({ width: 1024, height: 1024, quality: "best" })
  fs.writeFileSync(file, img.toPNG())
  w.destroy()
}

function icns(png, out) {
  const set = out.replace(/\.icns$/, ".iconset")
  fs.rmSync(set, { recursive: true, force: true })
  fs.mkdirSync(set)
  for (const s of [16, 32, 128, 256, 512]) {
    execFileSync("sips", ["-z", String(s), String(s), png, "--out", path.join(set, `icon_${s}x${s}.png`)], { stdio: "ignore" })
    execFileSync("sips", ["-z", String(s * 2), String(s * 2), png, "--out", path.join(set, `icon_${s}x${s}@2x.png`)], { stdio: "ignore" })
  }
  execFileSync("iconutil", ["-c", "icns", set, "-o", out])
  fs.rmSync(set, { recursive: true, force: true })
}

// Closing one render window must not quit the app before the next one is drawn.
app.on("window-all-closed", () => {})

app.whenReady().then(async () => {
  for (const [name, tile] of [["icon", TILES.light], ["icon-dark", TILES.dark]]) {
    const png = path.join(root, `build/${name}.png`)
    await render(tile, png)
    icns(png, path.join(root, `build/${name}.icns`))
  }
  console.log("wrote build/icon(.png|.icns) and build/icon-dark(.png|.icns)")
  app.quit()
})
