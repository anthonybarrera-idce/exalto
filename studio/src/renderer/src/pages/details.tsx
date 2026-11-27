import { Info, Save } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { PageId } from "@/App"
import { Empty, PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useStudio } from "@/hooks/use-studio"
import { studio, type HymnDoc } from "@/lib/studio"
import { useHymnals } from "@/lib/hymnals"
import { useLocale } from "@/hooks/use-locale"

type Form = {
  title: string
  hymnalId: string
  number: string
  label: string
  author: string
  language: "es" | "en"
  tags: string
  repeatChorus: boolean
}
const toForm = (h: HymnDoc): Form => ({
  title: h.title ?? "",
  hymnalId: h.hymnalId || "community",
  number: h.number != null ? String(h.number) : "",
  label: h.label ?? "",
  author: h.author ?? "",
  language: h.language ?? "es",
  tags: (h.tags ?? []).join(", "),
  repeatChorus: !!h.repeatChorus,
})

/** Where the hymn goes in Exalto: hymnal, number and the details shown in the app. */
export function DetailsPage({ go }: { go: (p: PageId) => void }) {
  const { detail, refresh } = useStudio()
  const { t, rich, hymnal: hymnalLabel } = useLocale()
  const HYMNALS = useHymnals()
  const [form, setForm] = useState<Form | null>(null)
  useEffect(() => setForm(detail ? toForm(detail.hymn) : null), [detail?.slug, detail?.hymn])
  if (!detail || !form) return <Empty>{t("common.convertFirst")}</Empty>

  const saved = toForm(detail.hymn)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v })
  const code = detail.hymn.source?.hymnalCode

  const save = async () => {
    const number = form.number ? Number(form.number) : null
    await studio.saveDetails(detail.slug, {
      title: form.title.trim(),
      hymnalId: form.hymnalId,
      number,
      label: form.label.trim() && form.label.trim() !== form.number ? form.label.trim().toUpperCase() : null,
      author: form.author.trim(),
      language: form.language,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      repeatChorus: form.repeatChorus,
    })
    toast.success(t("details.saved"))
    refresh()
  }

  return (
    <>
      <PageHeader title={t("details.title")} sub={t("details.sub")}>
        <Button variant="outline" disabled={!dirty} onClick={() => setForm(saved)}>{t("common.discard")}</Button>
        <Button disabled={!dirty || !form.title.trim()} onClick={save}><Save />{t("details.save")}</Button>
        <Button variant="secondary" onClick={() => go("export")}>{t("details.continue")}</Button>
      </PageHeader>

      {code && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-sm">
          <Info className="mt-0.5 size-4 text-sky-600" />
          <div>
            {rich("details.fromSlides", { number: <b>{detail.hymn.number ?? "?"}</b>, code: <b>“{code}”</b> })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        <Card className="gap-4 p-5">
          <div className="text-sm font-semibold">{t("details.placement")}</div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hymnal">{t("details.hymnal")}</Label>
            <select id="hymnal" value={form.hymnalId} onChange={(e) => set("hymnalId", e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
              {!HYMNALS.some((h) => h.id === form.hymnalId) && <option value={form.hymnalId} disabled>{t("details.pickHymnal")}</option>}
              {HYMNALS.map((h) => <option key={h.id} value={h.id}>{hymnalLabel(h.id)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="number">{t("details.number")}</Label>
              <Input id="number" inputMode="numeric" placeholder={t("details.none")} value={form.number} onChange={(e) => set("number", e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="label">{t("details.shownAs")}</Label>
              <Input id="label" placeholder={form.number || t("details.shownAsExample")} value={form.label} onChange={(e) => set("label", e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("details.shownAsHelp")}</p>
        </Card>

        <Card className="gap-4 p-5">
          <div className="text-sm font-semibold">{t("details.listing")}</div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">{t("details.titleLabel")}</Label>
            <Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="author">{t("details.author")}</Label>
            <Input id="author" placeholder={t("details.authorPlaceholder")} value={form.author} onChange={(e) => set("author", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="language">{t("details.language")}</Label>
              <select id="language" value={form.language} onChange={(e) => set("language", e.target.value as "es" | "en")} className="h-9 rounded-md border bg-background px-3 text-sm">
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tags">{t("details.tags")}</Label>
              <Input id="tags" placeholder={t("details.tagsPlaceholder")} value={form.tags} onChange={(e) => set("tags", e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.repeatChorus} onCheckedChange={(v) => set("repeatChorus", v)} />
            {t("details.repeatChorus")}
          </label>
        </Card>
      </div>
    </>
  )
}
