import type { Hymnal } from "@/lib/types"

/** Hymnals are fixed for now; move to a `hymnals` collection when churches can add their own. */
export const HYMNALS: Hymnal[] = [
  { id: "idc-himnario", name: "IDC Himnario", kind: "official", visible: true, offline: true },
  { id: "community", name: "Community", kind: "community", visible: true, offline: false },
]

export function hymnalName(id: string) {
  return HYMNALS.find((h) => h.id === id)?.name ?? id
}
