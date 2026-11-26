/**
 * "Needs a look": noteheads whose shape didn't match their pitch, kept per page in the draft
 * (page.review). Same rules as the converter's resolve_flags (hymn_processor/deck_batch.py), so
 * the list here matches what Save writes to review.json:
 * - a flag is fixed once a note under it (any voice on that head) has a different pitch;
 * - "Looks right" removes a flag whose reading was correct (an undoable draft edit).
 */
import { VOICES, type Voice } from "@/lib/notes"
import type { Flag, Head, Page } from "@/lib/studio"

const TOL = 6 // pixels: a head's centre may sit just outside its note's box

export type NoteAt = { pi: number; mi: number; voice: Voice; i: number }
export type OpenFlag = Flag & { pi: number; fi: number; notes: NoteAt[] }

export function notesAt(pages: Page[], pi: number, x: number, y: number): NoteAt[] {
  const out: NoteAt[] = []
  pages[pi]?.measures.forEach((m, mi) =>
    VOICES.forEach((voice) =>
      m[voice].forEach((n, i) => {
        const b = n.box
        if (b && b[0] - TOL <= x && x <= b[2] + TOL && b[1] - TOL <= y && y <= b[3] + TOL) out.push({ pi, mi, voice, i })
      }),
    ),
  )
  return out
}

/** Flags still to check: not dismissed, and the note under them still reads the flagged pitch. */
export function openFlags(pages: Page[]): OpenFlag[] {
  return pages.flatMap((p, pi) =>
    (p.review ?? []).flatMap((f, fi) => {
      const notes = notesAt(pages, pi, f.x, f.y)
      // Any voice on that head changed counts: a unison head is two voices, and the reviewer edits one.
      const fixed = notes.some((n) => pages[n.pi].measures[n.mi][n.voice][n.i].pitch !== f.pitch)
      return fixed ? [] : [{ ...f, pi, fi, notes }]
    }),
  )
}

const holds = (h: Head, f: Flag) => h.x0 <= f.x && f.x <= h.x1 && h.y0 <= f.y && f.y <= h.y1

/** The page's heads with resolved flags drawn as checked (green) instead of red. */
export function displayHeads(page: Page, open: OpenFlag[], pi: number): Head[] {
  const still = open.filter((f) => f.pi === pi)
  const fixed = (page.review ?? []).filter((f) => !still.some((o) => o.x === f.x && o.y === f.y))
  return (page.heads ?? []).map((h) => (!h.ok && fixed.some((f) => holds(h, f)) ? { ...h, ok: true } : h))
}

/** "Looks right": drop the flag and mark its head checked (mutates a draft copy). */
export function dismissFlag(pages: Page[], pi: number, fi: number) {
  const p = pages[pi]
  const f = p.review?.[fi]
  if (!f) return
  p.review = p.review!.filter((_, i) => i !== fi)
  for (const h of p.heads ?? []) if (holds(h, f)) h.ok = true
}
