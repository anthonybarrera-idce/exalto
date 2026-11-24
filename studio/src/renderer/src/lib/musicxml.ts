/** Set the soprano syllables (voice 1 on the top staff, rests skipped) in a MusicXML document. */
export function withSopranoLyrics(xml: string, syllables: { text?: string | null; syllabic?: string | null }[]): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  const notes = [...doc.getElementsByTagName("note")].filter(
    (n) =>
      n.getElementsByTagName("voice")[0]?.textContent === "1" &&
      (n.getElementsByTagName("staff")[0]?.textContent ?? "1") === "1" &&
      !n.getElementsByTagName("rest").length,
  )
  notes.forEach((n, i) => {
    for (const l of [...n.getElementsByTagName("lyric")]) if ((l.getAttribute("number") ?? "1") === "1") l.remove()
    const s = syllables[i]
    if (!s?.text) return
    const lyric = doc.createElement("lyric")
    lyric.setAttribute("number", "1")
    const syl = doc.createElement("syllabic")
    syl.textContent = s.syllabic || "single"
    const text = doc.createElement("text")
    text.textContent = s.text
    lyric.append(syl, text)
    n.appendChild(lyric)
  })
  return new XMLSerializer().serializeToString(doc)
}
