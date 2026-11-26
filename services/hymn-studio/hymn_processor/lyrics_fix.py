"""Offline correction of OCR'd hymn lyrics (Spanish).

OCR mistakes in lyrics are almost all spelling-level: a wrong letter ("letta"), a dropped
letter ("Gloia"), a missing accent ("musica") or two words run together ("tunombre",
"eresRey"). This fixes those with:

  * an offline Spanish dictionary (pyspellchecker), and
  * a hymn vocabulary built from the IDC Himnario lyrics (data/hymn_words.txt), which
    knows church words and verb forms the general list lacks ("traigo", "Reyes").

Every change is reported so an editor can review it; nothing here rewrites meaning.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

WORD = re.compile(r"[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+")
VOWELS = set("aeiouáéíóúü")
STRONG = set("aeoáéíóú")  # (accented i/u also break a diphthong)
INSEPARABLE = {"bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "pl", "pr", "tr", "ch", "ll", "rr", "qu", "gu"}


@lru_cache(maxsize=1)
def _vocab() -> tuple[dict[str, int], object]:
    from spellchecker import SpellChecker

    hymn: dict[str, int] = {}
    path = Path(__file__).resolve().parent / "data" / "hymn_words.txt"
    if path.exists():
        for line in path.read_text().splitlines():
            if line and not line.startswith("#"):
                w, n = line.rsplit(" ", 1)
                hymn[w] = int(n)
    spell = SpellChecker(language="es")
    spell.word_frequency.load_words(hymn.keys())
    return hymn, spell


def is_known(word: str) -> bool:
    hymn, spell = _vocab()
    w = word.lower()
    return w in hymn or w in spell


def _match_case(src: str, new: str) -> str:
    if src.isupper() and len(src) > 1:
        return new.upper()
    if src[:1].isupper():
        return new[:1].upper() + new[1:]
    return new


def _split(word: str) -> str | None:
    """'tunombre' -> 'tu nombre', 'eresRey' -> 'eres Rey' (both halves must be real words)."""
    hymn, spell = _vocab()
    m = re.match(r"^([a-záéíóúñü]+)([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+)$", word)
    if m and is_known(m.group(1)) and is_known(m.group(2)):
        return f"{m.group(1)} {m.group(2)}"
    best = None
    for i in range(1, len(word)):
        a, b = word[:i], word[i:]
        if is_known(a) and is_known(b) and len(b) > 1:
            score = hymn.get(a.lower(), 0) + hymn.get(b.lower(), 0)
            if best is None or score > best[0]:
                best = (score, f"{a} {b}")
    return best[1] if best and best[0] > 0 else None


# Prefixes that make a real word from a known one: "reanima", "renace", "desata". The word lists
# lack many of these forms, and "re" on its own is a word too, so they were split ("re anima").
PREFIXES = ("re", "des", "in", "con", "sobre", "ante")


def correct_word(word: str) -> str:
    """Best correction for one word (may become two words), or the word unchanged."""
    if is_known(word):
        return word
    lower = word.lower()
    # OCR reads some lowercase letters as their capitals, which look the same but bigger
    # ("traZó" for "trazó"). Other capitals mid-word mark two words run together ("eresRey").
    if re.search(r"(?<=[a-záéíóúñü])[COSVWXZÓ]", word):
        fixed = word[0] + re.sub(r"(?<=[a-záéíóúñü])[COSVWXZÓ]", lambda m: m.group(0).lower(), word[1:])
        if not re.search(r"[a-záéíóúñü][A-ZÁÉÍÓÚÑÜ]", fixed):
            return correct_word(fixed)
    # Past tense ("trazó", "venció") isn't in most word lists: keep it when the verb is known.
    m = re.match(r"^(.+?)(i?)ó$", lower)
    if m and any(is_known(m.group(1) + end) for end in (("er", "ir") if m.group(2) else ("ar",))):
        return word
    for p in PREFIXES:
        if lower.startswith(p) and len(lower) - len(p) >= 4 and is_known(lower[len(p):]):
            return word
    # Imperatives like "temed", "adorad", "venid" aren't in most word lists: keep them when the verb is known.
    m = re.match(r"^(.+)([aei])d$", lower)
    if m and is_known(m.group(1) + m.group(2) + "r"):
        return word
    # A verb with its pronoun attached ("honrarle", "amarte", "seguirlo") is one word.
    m = re.match(r"^(.+?[aeiáéí]r)(les|los|las|nos|le|la|lo|me|te|se)$", lower)
    if m and is_known(m.group(1)):
        return word
    # A one-letter word run onto the end ("semejantea" → "semejante a") beats dropping the letter.
    if lower[-1:] in ("a", "y", "o", "e") and len(lower) > 4 and is_known(lower[:-1]):
        return f"{word[:-1]} {word[-1]}"
    # Two common words run together ("deél" → "de él") beat a one-letter change ("del").
    hymn, _ = _vocab()
    for i in range(1, len(word)):
        a, b = word[:i], word[i:]
        if hymn.get(a.lower(), 0) >= 5 and hymn.get(b.lower(), 0) >= 5 and len(b) > 1:
            return f"{a} {b}"
    # Two words run together by OCR keep their spelling and just get the space back ("aTí" -> "a Tí").
    if re.search(r"[a-záéíóúñü][A-ZÁÉÍÓÚÑ]", word):
        return " ".join(re.split(r"(?<=[a-záéíóúñü])(?=[A-ZÁÉÍÓÚÑ])", word))
    hymn, spell = _vocab()
    lower = word.lower()
    split = _split(word)
    candidates = spell.candidates(lower) or set()
    candidates = {c for c in candidates if c != lower}
    if candidates:
        # Prefer words that actually occur in hymns, then the closest and most common.
        def rank(c):
            return (c in hymn, -_distance(lower, c), hymn.get(c, 0), spell.word_usage_frequency(c))

        best = max(candidates, key=rank)
        if split and (best not in hymn or _distance(lower, best) > 1):
            return split
        return _match_case(word, best)
    return split or word


def _distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


LETTER = "A-Za-zÁÉÍÓÚÑÜáéíóúñü"


def fix_digits(text: str) -> str:
    """OCR reads an o inside a word as a zero ("g0zar")."""
    return re.sub(rf"(?<=[{LETTER}])0|0(?=[{LETTER}])", "o", text)


def _should_join(a: str, b: str) -> bool:
    """Whether two neighbouring OCR pieces are one word that lost its hyphen ("sab er", "set é")."""
    joined = a + b
    if is_known(joined) and not (is_known(a) and is_known(b)):
        return True
    fragment = (len(a) <= 2 and not is_known(a)) or (len(b) <= 2 and not is_known(b))
    if fragment:
        fixed = correct_word(joined)
        return " " not in fixed and fixed.lower() != joined.lower() and is_known(fixed) and _distance(joined.lower(), fixed.lower()) <= 1
    return False


def rejoin_fragments(line: str) -> tuple[str, list[tuple[str, str]]]:
    """Join the pieces of a word OCR split apart when it lost the hyphen ("sab er" → "saber",
    "goz ar" → "gozar", "set é" → "seté", which the spell check then makes "seré"). Run before
    correcting: on its own each piece would be "corrected" into a different word ("sabe el").
    Returns the line and the joins made."""
    chunks = fix_digits(line).split(" ")
    changes: list[tuple[str, str]] = []
    i = 0
    while i < len(chunks) - 1:
        a = re.fullmatch(rf"([^{LETTER}]*)([{LETTER}]+)", chunks[i])  # no punctuation after a
        b = re.fullmatch(rf"([{LETTER}]+)([^{LETTER}]*)", chunks[i + 1])  # none before b
        if a and b and _should_join(a.group(2), b.group(1)):
            changes.append((f"{a.group(2)} {b.group(1)}", a.group(2) + b.group(1)))
            chunks[i : i + 2] = [chunks[i] + chunks[i + 1]]
            continue
        i += 1
    return " ".join(chunks), changes


def _fragment(s: str) -> bool:
    """A lone consonant: a piece of a word, never a word itself (unlike "a", "y", "o", "e")."""
    return len(s) == 1 and s.isalpha() and s.lower() not in "aeiouyáéíóú"


def repair_note_syllables(notes: list[dict], line_words: set[str]) -> None:
    """Fix OCR splits on the soprano syllables, using the corrected lyric lines as the reference.

    - A stray letter inside a syllable goes where it belongs: "sa b" / "er," → "sa" / "ber,";
      "d er," → "der,".
    - Neighbouring words that form one word of the lines become one word on the notes
      ("go" "zar" → go-zar, "a-la" "bar" → a-la-bar).
    """
    for n in notes:
        n["syllable"] = fix_digits(n["syllable"])
    for k, n in enumerate(notes):
        parts = n["syllable"].split(" ")
        if len(parts) == 2 and _fragment(parts[1].strip()) and k + 1 < len(notes):
            n["syllable"] = parts[0]
            notes[k + 1]["syllable"] = parts[1].strip() + notes[k + 1]["syllable"].lstrip()
        elif len(parts) == 2 and _fragment(parts[0].strip()):
            n["syllable"] = parts[0].strip() + parts[1]

    # Words on the notes: runs of begin/middle… end, or a single.
    words: list[list[dict]] = []
    for n in notes:
        if words and words[-1][-1].get("syllabic") in ("begin", "middle") and n.get("syllabic") in ("middle", "end"):
            words[-1].append(n)
        else:
            words.append([n])
    text = lambda w: "".join(x["syllable"] for x in w)
    alpha = lambda s: re.fullmatch(rf"[^{LETTER}]*([{LETTER}]+)[^{LETTER}]*", s)
    k = 0
    while k < len(words) - 1:
        a, b = text(words[k]), text(words[k + 1])
        ma, mb = alpha(a), alpha(b)
        ok = ma and mb and re.fullmatch(rf"[^{LETTER}]*[{LETTER}]+", a)  # no punctuation between
        if ok:
            wa, wb = ma.group(1).lower(), mb.group(1).lower()
            if (wa + wb) in line_words and not (wa in line_words and wb in line_words):
                merged = words[k] + words[k + 1]
                for i, x in enumerate(merged):
                    x["syllabic"] = "begin" if i == 0 else "end" if i == len(merged) - 1 else "middle"
                words[k : k + 2] = [merged]
                continue
        k += 1


def correct_line(line: str) -> tuple[str, list[tuple[str, str]]]:
    changes: list[tuple[str, str]] = []
    line = re.sub(r"([,;:!?])(?=[A-Za-zÁÉÍÓÚÑáéíóúñ¡¿])", r"\1 ", line)  # space after punctuation

    def fix(m):
        old = m.group(0)
        new = correct_word(old)
        if new != old:
            changes.append((old, new))
        return new

    return WORD.sub(fix, line), changes


# --------------------------------------------------------------------------- syllables

def syllabify(word: str) -> list[str]:
    """Basic Spanish syllable split ('nombre' -> ['nom', 'bre'], 'melodía' -> ['me', 'lo', 'dí', 'a'])."""
    w = word
    low = w.lower()
    # nuclei: runs of vowels, split on hiatus (two strong vowels or an accented weak vowel)
    groups = []  # (start, end) of vowel nuclei
    i = 0
    while i < len(low):
        if low[i] in VOWELS and not (low[i] == "u" and i > 0 and low[i - 1] in "qg" and i + 1 < len(low) and low[i + 1] in "eiéí"):
            j = i + 1
            while j < len(low) and low[j] in VOWELS:
                a, b = low[j - 1], low[j]
                if (a in STRONG and b in STRONG) or b in "íú" or a in "íú":
                    break
                j += 1
            groups.append((i, j))
            i = j
        else:
            i += 1
    if len(groups) <= 1:
        return [w]
    cuts = []
    for (s1, e1), (s2, _) in zip(groups, groups[1:]):
        cons = low[e1:s2]
        n = len(cons)
        if n == 0:
            cut = e1
        elif n == 1:
            cut = e1
        elif n == 2:
            cut = e1 if cons in INSEPARABLE else e1 + 1
        else:
            cut = s2 - 2 if cons[-2:] in INSEPARABLE else s2 - 1
        cuts.append(cut)
    parts, last = [], 0
    for c in cuts:
        parts.append(w[last:c])
        last = c
    parts.append(w[last:])
    return [p for p in parts if p]


def join_broken_words(pages: list[dict]) -> None:
    """Join words split across systems or pages: a line ending "Evan-" takes the first word of
    the next line ("gelio que…" -> "…Evangelio" / "que…"). Run before correcting, so the spell
    check sees whole words instead of fragments ("Evan" would become "Van")."""
    refs = [(p, i) for p in pages for i in range(len(p.get("lyric_lines") or []))]
    for k, (p, i) in enumerate(refs):
        line = p["lyric_lines"][i].rstrip()
        if not re.search(r"\w-$", line):
            continue
        for q, j in refs[k + 1 :]:
            nxt = q["lyric_lines"][j].strip()
            if not nxt:
                continue
            first, _, rest = nxt.partition(" ")
            p["lyric_lines"][i] = line[:-1] + first
            q["lyric_lines"][j] = rest
            break
        else:
            p["lyric_lines"][i] = line[:-1]
    for p in pages:
        if p.get("lyric_lines"):
            p["lyric_lines"] = [l for l in p["lyric_lines"] if l.strip()]


def join_syllables_across_pages(pages: list[dict]) -> None:
    """A word that runs on from one page to the next ("a-" / "mor") keeps going on the notes:
    the next page's first syllable becomes the word's middle or end, not a new word."""
    prev = None
    for p in pages:
        notes = [n for m in p.get("measures", []) for n in m.get("soprano", []) if n.get("syllable")]
        if notes and prev in ("begin", "middle"):
            first = notes[0]
            first["syllabic"] = {"begin": "middle", "single": "end", None: "end"}.get(first.get("syllabic"), first.get("syllabic"))
        if notes:
            prev = notes[-1].get("syllabic")


def correct_page(page: dict) -> list[tuple[str, str]]:
    """Correct a transcribed page in place: lyric lines and the syllables on soprano notes.

    A corrected word replaces its syllables on the notes only when it still has the same
    number of syllables (so notes and words stay lined up); the text lines are always fixed.
    """
    changes: list[tuple[str, str]] = []
    fixed_lines = []
    for line in page.get("lyric_lines") or []:
        # Join printed syllables first ("Se-ñor" -> "Señor") so whole words are checked.
        line = re.sub(r"(?<=\w)\s*-\s*(?=\w)", "", line).replace("_", " ")
        joined, joins = rejoin_fragments(line)
        new, ch = correct_line(joined)
        fixed_lines.append(new)
        # Report a join that was then corrected once: "set é" → "seré", not "set é" → "seté" → "seré".
        fixed = dict(ch)
        changes += [(old, fixed.pop(mid, mid)) for old, mid in joins]
        changes += [(old, new) for old, new in ch if old in fixed]
    page["lyric_lines"] = fixed_lines

    # Rebuild words from the soprano syllables and fix them on the notes.
    notes = [n for m in page.get("measures", []) for n in m.get("soprano", []) if n.get("syllable")]
    repair_note_syllables(notes, {w.lower() for l in fixed_lines for w in WORD.findall(l)})
    i = 0
    while i < len(notes):
        j = i
        while (notes[j].get("syllabic") in ("begin", "middle") and j + 1 < len(notes)
               and notes[j + 1].get("syllabic") in ("middle", "end")):
            j += 1
        group = notes[i : j + 1]
        complete = (len(group) == 1 and group[0].get("syllabic") in (None, "single")) or (
            group[0].get("syllabic") == "begin" and group[-1].get("syllabic") == "end")
        if not complete:  # a syllable was lost; don't guess the word
            i = j + 1
            continue
        raw = "".join(n["syllable"] for n in group)
        m = re.match(r"^([¡¿\"“(]*)(.*?)([.,;:!?\"”)]*)$", raw)
        pre, word, post = m.groups()
        if word and WORD.fullmatch(word):
            new = correct_word(word)
            if new != word and _distance(word.lower(), new.replace(" ", "").lower()) <= 2:
                sylls = [s for part in new.split() for s in syllabify(part)]
                if len(sylls) == len(group):
                    sylls[0] = pre + sylls[0]
                    sylls[-1] = sylls[-1] + post
                    for n, s in zip(group, sylls):
                        n["syllable"] = s
        i = j + 1
    return changes
