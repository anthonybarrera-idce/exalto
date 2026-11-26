import { ArrowDown, ArrowUp, FileText, Heart } from "lucide-react"
import { useState } from "react"
import type { PageId } from "@/App"
import { Empty, PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useStudio } from "@/hooks/use-studio"
import { useLocale } from "@/hooks/use-locale"
import type { LyricSection } from "@/lib/studio"

/** The Exalto app's colours (exalto/src/constants/theme.ts), so the preview matches the phone. */
const APP = { bg: "#1A120A", text: "#F0E0D1", muted: "#958A7F", cyan: "#04C1FF", pill: "rgba(240,224,209,0.35)" }
const APP_FONT = '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

/** The app's section headings (exalto/src/i18n/strings.ts: lyrics.verse / chorus / bridge). */
const HEADINGS = {
  es: { verse: "Estrofa", chorus: "Coro", bridge: "Puente", none: "La letra de este himno no está disponible.", close: "Cerrar" },
  en: { verse: "Verse", chorus: "Chorus", bridge: "Bridge", none: "Lyrics not available for this hymn.", close: "Close" },
}

/** How the saved lyrics look in the app's Hymnal view (exalto/src/components/player/FullPlayer.tsx). */
export function PreviewPage({ go }: { go: (p: PageId) => void }) {
  const { detail } = useStudio()
  const { t } = useLocale()
  const [size, setSize] = useState(15) // the app starts at 15 pt; A↑/A↓ step by 2 between 11 and 24
  const [lang, setLang] = useState<"es" | "en" | null>(null)
  if (!detail) return <Empty>{t("common.convertFirst")}</Empty>

  const { hymn } = detail
  const ui = HEADINGS[lang ?? hymn.language ?? "es"]
  const heading = (s: LyricSection) =>
    s.type === "chorus" ? ui.chorus : s.type === "bridge" ? ui.bridge : `${ui.verse} ${s.number ?? ""}`.trim()
  const title = hymn.label ? `${hymn.label} ${hymn.title}` : hymn.title

  return (
    <>
      <PageHeader title={t("preview.title")} sub={t("preview.sub")}>
        <Button variant="outline" onClick={() => go("lyrics")}>{t("preview.editLyrics")}</Button>
      </PageHeader>

      <div className="flex flex-wrap items-start gap-8">
        {/* Phone */}
        <div
          className="relative flex h-[760px] w-[372px] shrink-0 flex-col overflow-hidden rounded-[46px] border-[10px] border-neutral-900 shadow-xl"
          style={{ background: APP.bg, color: APP.text, fontFamily: APP_FONT }}
          aria-label={t("preview.phone")}
        >
          <div className="mx-auto mt-2 h-6 w-28 rounded-full bg-black" />
          <div className="flex flex-1 flex-col px-5 pt-5">
            {/* Text size and the right-hand icons */}
            <div className="mb-4 flex items-center gap-4">
              <button className="flex items-center gap-0.5 text-[15px] font-semibold" style={{ color: APP.muted }} onClick={() => setSize((s) => Math.min(s + 2, 24))} aria-label={t("preview.bigger")}>
                A <ArrowUp className="size-3.5" style={{ color: APP.text }} />
              </button>
              <button className="flex items-center gap-0.5 text-[15px] font-semibold" style={{ color: APP.muted }} onClick={() => setSize((s) => Math.max(s - 2, 11))} aria-label={t("preview.smaller")}>
                A <ArrowDown className="size-3.5" style={{ color: APP.text }} />
              </button>
              <div className="flex-1" />
              <Heart className="size-6" style={{ color: APP.cyan }} strokeWidth={1.8} />
              <FileText className="size-6" strokeWidth={1.6} />
            </div>

            {/* Lyrics */}
            <div className="flex-1 overflow-y-auto pb-10 [scrollbar-width:none]">
              {hymn.lyrics?.length ? (
                <div className="flex flex-col gap-6">
                  {hymn.lyrics.map((s, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <div className="text-[15px] font-semibold">{heading(s)}</div>
                      <div className="flex flex-col gap-1">
                        {s.lines.map((line, j) => (
                          <div key={j} style={{ fontSize: size, lineHeight: `${size * 1.6}px` }}>{line}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-12 text-center" style={{ color: APP.muted, fontSize: size }}>{ui.none}</div>
              )}
            </div>

            {/* Bottom bar */}
            <div className="flex items-center gap-3 py-4">
              <div className="size-[52px] shrink-0 rounded-[10px]" style={{ background: `linear-gradient(135deg, ${APP.cyan}, #EDA145)` }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{title}</div>
                <div className="truncate text-xs" style={{ color: APP.muted }}>{hymn.author}</div>
              </div>
              <div className="rounded-full px-4 py-2 text-sm font-medium" style={{ background: APP.pill }}>{ui.close}</div>
            </div>
          </div>
        </div>

        {/* Options and notes */}
        <div className="flex max-w-sm flex-col gap-4 text-sm">
          <div className="flex flex-col gap-1.5">
            <div className="font-medium">{t("preview.appLanguage")}</div>
            <Tabs value={lang ?? hymn.language ?? "es"} onValueChange={(v) => setLang(v as "es" | "en")}>
              <TabsList>
                <TabsTrigger value="es">Español</TabsTrigger>
                <TabsTrigger value="en">English</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="text-xs text-muted-foreground">{t("preview.appLanguageHelp")}</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="font-medium">{t("preview.textSize")}</div>
            <div className="text-xs text-muted-foreground">{t("preview.textSizeHelp", { size })}</div>
          </div>
          <div className="text-xs text-muted-foreground">{t("preview.savedOnly")}</div>
          {hymn.repeatChorus && <div className="text-xs text-muted-foreground">{t("preview.repeatChorus")}</div>}
        </div>
      </div>
    </>
  )
}
