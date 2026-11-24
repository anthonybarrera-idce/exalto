import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { studio, type HymnDetail, type HymnSummary } from "@/lib/studio"

type Job = { running: boolean; log: string[]; current?: string; done?: number }
type Ctx = {
  hymns: HymnSummary[]
  slug: string | null
  detail: HymnDetail | null
  select: (slug: string) => void
  refresh: () => Promise<void>
  job: Job
  startJob: (o: { inputs: string[]; engine: string; hymnal: string; tempo: number; correct: boolean }) => Promise<void>
}
const StudioContext = createContext<Ctx>(null!)

export function StudioProvider({ children }: { children: ReactNode }) {
  const [hymns, setHymns] = useState<HymnSummary[]>([])
  const [slug, setSlug] = useState<string | null>(null)
  const [detail, setDetail] = useState<HymnDetail | null>(null)
  const [job, setJob] = useState<Job>({ running: false, log: [] })

  const refresh = useCallback(async () => {
    const list: HymnSummary[] = await studio.listHymns()
    setHymns(list)
    setSlug((s) => s ?? list[0]?.slug ?? null)
  }, [])
  useEffect(() => void refresh(), [refresh])
  useEffect(() => {
    if (slug) studio.getHymn(slug).then(setDetail)
  }, [slug, hymns])

  useEffect(() => studio.onLog((line: string) => setJob((j) => ({ ...j, log: [...j.log, line], current: line }))), [])
  useEffect(
    () =>
      studio.onDone((code: number) => {
        setJob((j) => ({ ...j, running: false, done: code }))
        refresh()
      }),
    [refresh],
  )

  const startJob: Ctx["startJob"] = async (o) => {
    setJob({ running: true, log: [] })
    await studio.convert(o)
  }

  return (
    <StudioContext.Provider value={{ hymns, slug, detail, select: setSlug, refresh, job, startJob }}>
      {children}
    </StudioContext.Provider>
  )
}
export const useStudio = () => useContext(StudioContext)
