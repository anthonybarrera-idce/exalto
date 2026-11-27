/**
 * How a hymn's number is shown, the same in the mobile app, the admin and Hymn Studio.
 * `label` is an optional display number for numbers that aren't plain ("17B", "120A"); anything else
 * in it (a stray word) is ignored and the plain `number` is shown instead.
 */
const DISPLAY_NUMBER = /^\d{1,4}[A-Za-z]{0,2}$/

export const isDisplayNumber = (label: string) => DISPLAY_NUMBER.test(label.trim())

export function hymnNumberText(h: { number?: number | null; label?: string | null }): string | null {
  const label = (h.label ?? "").trim()
  if (label && DISPLAY_NUMBER.test(label)) return label.toUpperCase()
  return typeof h.number === "number" ? String(h.number) : null
}
