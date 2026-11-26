import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { COPY, LANG_STORAGE_KEY, LINKS, initialLang, type Copy, type Lang } from './i18n.ts'
import { FlowingStaff, LooseNotes } from './music.tsx'
import { StudioPage } from './studio-page.tsx'
import { ContactPage, PAGE_TITLES, PrivacyPage, SupportPage, TermsPage, pageFromPath } from './pages.tsx'

/** Places an absolutely positioned layer inside a fixed-ratio Figma frame, in %. */
function place(frameW: number, frameH: number, x: number, y: number, w: number, h?: number): CSSProperties {
  return {
    left: `${(x / frameW) * 100}%`,
    top: `${(y / frameH) * 100}%`,
    width: `${(w / frameW) * 100}%`,
    height: h === undefined ? 'auto' : `${(h / frameH) * 100}%`,
  }
}

function Icon({ name, size = 24, className = '' }: { name: string; size?: number; className?: string }) {
  return (
    <img
      src={`/icons/${name}.svg`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

function Eyebrow({ children, tone = 'text-cyan' }: { children: ReactNode; tone?: string }) {
  return <p className={`text-[13px] font-bold tracking-[1.56px] ${tone}`}>{children}</p>
}

function Logo({ size }: { size: 'nav' | 'footer' }) {
  const nav = size === 'nav'
  return (
    <span className={`flex items-center ${nav ? 'gap-3' : 'gap-2.5'}`}>
      <img
        src={nav ? '/exalto-mark.svg' : '/img/exalto-mark-footer.svg'}
        alt=""
        aria-hidden="true"
        width={nav ? 25.86 : 20.7}
        height={nav ? 30 : 24}
      />
      <span
        className={`font-bold text-text ${nav ? 'text-[19px] tracking-[4.18px]' : 'text-[15px] tracking-[3.3px]'}`}
      >
        EXALTO
      </span>
    </span>
  )
}

function GradientButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="bg-brand-gradient inline-flex items-center justify-center rounded-full px-5 py-[11px] text-[15px] font-bold whitespace-nowrap text-ink transition-[filter] hover:brightness-110"
    >
      {children}
    </a>
  )
}

function OutlineButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-full border border-pill py-[11px] pr-[18px] pl-5 text-[15px] font-semibold whitespace-nowrap text-text transition-colors hover:bg-surface2"
    >
      {children}
      <Icon name="arrow-right" size={16} />
    </a>
  )
}

function StoreButtons({ t, stack }: { t: Copy; stack?: boolean }) {
  const items = [
    { href: LINKS.appStore, icon: 'apple', top: t.store.appleTop, label: 'App Store', aria: t.store.appleLabel },
    { href: LINKS.googlePlay, icon: 'google-play', top: t.store.googleTop, label: 'Google Play', aria: t.store.googleLabel },
  ]
  return (
    <ul className={`flex gap-3 ${stack ? 'flex-col items-start sm:flex-row' : 'flex-wrap justify-center'}`}>
      {items.map((s) => (
        <li key={s.icon}>
          <a
            href={s.href}
            aria-label={s.aria}
            className="flex items-center gap-3 rounded-[14px] border border-pill bg-ink py-[11px] pr-[22px] pl-[18px] transition-colors hover:border-muted"
          >
            <Icon name={s.icon} size={26} />
            <span className="flex flex-col whitespace-nowrap">
              <span className="text-[11px] font-medium text-muted">{s.top}</span>
              <span className="text-[18px] leading-[22px] font-bold text-text">{s.label}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

function LangToggle({ lang, setLang, t }: { lang: Lang; setLang: (l: Lang) => void; t: Copy }) {
  const option = (l: Lang) => (
    <button
      type="button"
      lang={l}
      aria-pressed={lang === l}
      aria-label={l === 'es' ? 'Español' : 'English'}
      onClick={() => setLang(l)}
      className={`px-1 py-2 text-[13px] ${lang === l ? 'font-bold text-text' : 'font-semibold text-muted hover:text-text'}`}
    >
      {l.toUpperCase()}
    </button>
  )
  return (
    <div role="group" aria-label={t.langSwitch.label} className="flex items-center gap-[2px]">
      {option('en')}
      <span aria-hidden="true" className="text-[13px] font-bold text-muted">
        ·
      </span>
      {option('es')}
    </div>
  )
}

function Nav({ t, lang, setLang }: { t: Copy; lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <header className="site-header mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-4 lg:px-10 lg:py-6 xl:px-[120px]">
      <a href="/" aria-label="Exalto" className="rounded-md">
        <Logo size="nav" />
      </a>
      <nav aria-label={t.nav.label} className="hidden lg:block">
        <ul className="flex gap-9 text-[15px] font-medium whitespace-nowrap text-muted">
          <li>
            <a href="/#features" className="hover:text-text">
              {t.nav.features}
            </a>
          </li>
          <li>
            <a href="/#hymnals" className="hover:text-text">
              {t.nav.hymnals}
            </a>
          </li>
          <li>
            <a href="/studio" className="hover:text-text">
              {t.nav.leaders}
            </a>
          </li>
          <li>
            <a href={LINKS.help} className="hover:text-text">
              {t.nav.help}
            </a>
          </li>
        </ul>
      </nav>
      <div className="flex items-center gap-3 sm:gap-5">
        <LangToggle lang={lang} setLang={setLang} t={t} />
        {/* Phones show the language switch instead; the CTA returns once both fit. */}
        <span className="hidden min-[440px]:inline-flex">
          <GradientButton href="/#download">{t.nav.cta}</GradientButton>
        </span>
      </div>
    </header>
  )
}

/* ---------- Hero ---------- */

// Figma "Phones" frame: 600 × 660. The phone renders are cropped to the phone body, so the
// rounded corners and drop shadow are drawn here (no baked-in background around them).
const PHONE_IMG = 'absolute shadow-[0_16px_41px_-16px_black]'
const PHONE_RADIUS = '10.3% / 4.76%'
// The hero phones lean back and turn toward the copy, like they're standing on a table.
const HERO_TILT = 'rotateY(-22deg) rotateX(8deg) rotateZ(2deg)'
const HERO_W = 600
const HERO_H = 660

function HeroPhones({ t, lang }: { t: Copy; lang: Lang }) {
  return (
    <div style={{ '--i': 3 } as CSSProperties} className="rise relative mx-auto aspect-[600/660] w-full max-w-[600px] shrink-0 [perspective:1800px] [transform-style:preserve-3d] xl:w-[600px]">
      <img
        src="/img/hero-glow-cyan.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute max-w-none"
        style={place(HERO_W, HERO_H, -80, -20, 660, 660)}
      />
      <img
        src="/img/hero-glow-amber.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute max-w-none"
        style={place(HERO_W, HERO_H, 120, 120, 620, 620)}
      />
      <img
        src={`/img/phone-hymns-${lang}.webp`}
        alt={t.hero.phonesAlt.list}
        width={270.5}
        height={585}
        className={`${PHONE_IMG} shadow-[-24px_32px_48px_-20px_black]`}
        style={{ ...place(HERO_W, HERO_H, 30, 70, 270.6), borderRadius: PHONE_RADIUS, transform: `${HERO_TILT} translateZ(-40px)` }}
      />
      <img
        src={`/img/phone-lyrics-${lang}.webp`}
        alt={t.hero.phonesAlt.lyrics}
        width={290}
        height={628}
        fetchPriority="high"
        className={`${PHONE_IMG} shadow-[-28px_36px_56px_-20px_black]`}
        style={{ ...place(HERO_W, HERO_H, 280, 10, 290.4), borderRadius: PHONE_RADIUS, transform: `${HERO_TILT} translateZ(40px)` }}
      />
    </div>
  )
}

function Hero({ t, lang }: { t: Copy; lang: Lang }) {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-x-clip">
      <FlowingStaff id="hero" className="staff-in absolute inset-x-0 -bottom-4 h-[150px] w-full lg:-bottom-10 lg:h-[200px]" opacity={0.3} />
      <div className="relative mx-auto flex max-w-[1440px] flex-col gap-12 px-5 pt-6 pb-16 lg:px-10 xl:flex-row xl:items-center xl:gap-10 xl:pt-10 xl:pr-24 xl:pb-[72px] xl:pl-[120px]">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-6">
          <p className="rise bg-brand-gradient inline-flex rounded-full p-px">
            <span className="flex items-center gap-2 rounded-full bg-bg px-[14px] py-[6px]">
              <img src="/img/eyebrow-dot.svg" alt="" aria-hidden="true" width={6} height={6} />
              <span className="text-[13px] font-semibold text-amber">{t.hero.eyebrow}</span>
            </span>
          </p>
          <h1
            id="hero-title"
            style={{ '--i': 1 } as CSSProperties}
            className="rise text-[44px] leading-[46px] font-extrabold tracking-[-0.88px] text-text sm:text-[56px] sm:leading-[62px] xl:text-[64px] xl:leading-[70px] xl:tracking-[-1.28px]"
          >
            {t.hero.titleLead}
            <span className="text-brand-gradient">{t.hero.titleAccent}</span>
          </h1>
          <p style={{ '--i': 2 } as CSSProperties} className="rise text-[17px] leading-[27px] text-muted xl:text-[19px] xl:leading-[30px]">
            {t.hero.body}
          </p>
          <div style={{ '--i': 3 } as CSSProperties} className="rise">
            <StoreButtons t={t} stack />
          </div>
          <ul style={{ '--i': 4 } as CSSProperties} className="rise flex flex-wrap gap-x-5 gap-y-2">
            {t.hero.notes.map((n) => (
              <li key={n} className="flex items-center gap-1.5 text-[14px] font-medium text-muted">
                <Icon name="check" size={16} />
                {n}
              </li>
            ))}
          </ul>
        </div>
        <HeroPhones t={t} lang={lang} />
      </div>
    </section>
  )
}

/* ---------- Hymnals ---------- */

// Generic hymnal covers — the same gradients the app uses for hymnal tiles, with no hymnal names.
const COVERS = [
  { bg: 'linear-gradient(135deg, #0f6f95 0%, #04c1ff 55%, #eda145 100%)', icon: 'book-open', rotate: -8, x: 6, y: 18 },
  { bg: 'linear-gradient(135deg, #7a2e38 0%, #e0455b 50%, #f5a06b 100%)', icon: 'file-music', rotate: 0, x: 34, y: 6 },
  { bg: 'linear-gradient(135deg, #6e4f2a 0%, #c98a3c 55%, #f5c080 100%)', icon: 'headphones', rotate: 8, x: 62, y: 18 },
]

function HymnalsGraphic({ t }: { t: Copy }) {
  return (
    <div role="img" aria-label={t.hymnals.graphicLabel} className="relative mx-auto w-full max-w-[520px]">
      <div className="relative aspect-[520/400]">
        <div
          aria-hidden="true"
          className="absolute inset-[8%] rounded-full opacity-30 blur-3xl"
          style={{ backgroundImage: 'linear-gradient(90deg, #04c1ff, #eda145)' }}
        />
        {COVERS.map((c, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="absolute flex aspect-[3/4] w-[32%] flex-col justify-between rounded-[18px] p-[5%] shadow-[0_24px_48px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
            style={{ left: `${c.x}%`, top: `${c.y}%`, transform: `rotate(${c.rotate}deg)`, backgroundImage: c.bg, zIndex: i === 1 ? 2 : 1 }}
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-black/25">
              <img src={`/icons/${c.icon}.svg`} alt="" width={22} height={22} className="brightness-0 invert" />
            </span>
            <span className="flex flex-col gap-1.5">
              <span className="h-2 w-3/4 rounded-full bg-white/70" />
              <span className="h-2 w-1/2 rounded-full bg-white/40" />
            </span>
          </div>
        ))}
        <div
          aria-hidden="true"
          className="absolute bottom-[2%] left-1/2 z-10 flex w-[86%] -translate-x-1/2 items-center gap-2.5 rounded-full border border-line bg-bg/95 px-4 py-3 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.9)]"
        >
          <Icon name="search" size={18} />
          <span className="truncate text-[14px] text-muted">{t.hymnals.search}</span>
        </div>
      </div>
    </div>
  )
}

function Hymnals({ t }: { t: Copy }) {
  return (
    <section id="hymnals" aria-labelledby="hymnals-title" className="relative overflow-x-clip bg-surface">
      <LooseNotes
        notes={[
          { glyph: 'clef', left: '2%', top: '14%', size: 54, rotate: -8, drift: 90, tone: 'cyan', opacity: 0.12 },
          { glyph: 'eighth', left: '44%', top: '70%', size: 40, rotate: 10, drift: 50, opacity: 0.14 },
          { glyph: 'beamed', left: '92%', top: '10%', size: 56, rotate: -12, drift: 110, tone: 'orange', opacity: 0.14 },
        ]}
      />
      <div className="mx-auto flex max-w-[1440px] flex-col gap-12 px-5 py-16 lg:flex-row lg:items-center lg:gap-16 lg:px-10 lg:py-[88px] xl:gap-24 xl:px-[120px]">
        <div className="reveal relative flex min-w-0 flex-1 flex-col gap-5">
          <Eyebrow>{t.hymnals.eyebrow}</Eyebrow>
          <h2
            id="hymnals-title"
            className="text-[32px] leading-[38px] font-extrabold tracking-[-0.48px] text-text lg:text-[44px] lg:leading-[52px] lg:tracking-[-0.66px]"
          >
            {t.hymnals.title}
          </h2>
          <p className="text-[17px] leading-[27px] text-muted">{t.hymnals.body}</p>
          <CheckList items={t.hymnals.bullets} />
        </div>
        <div className="reveal relative flex-1">
          <HymnalsGraphic t={t} />
        </div>
      </div>
    </section>
  )
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-[14px] pt-2">
      {items.map((b) => (
        <li key={b} className="flex items-center gap-3 text-[16px] font-medium text-text">
          <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-surface2">
            <Icon name="check" size={14} />
          </span>
          {b}
        </li>
      ))}
    </ul>
  )
}

/* ---------- Features ---------- */

function Features({ t }: { t: Copy }) {
  return (
    <section id="features" aria-labelledby="features-title" className="relative overflow-x-clip">
      <LooseNotes
        notes={[
          { glyph: 'quarter', left: '6%', top: '8%', size: 34, rotate: 12, drift: 70, tone: 'cyan', opacity: 0.16 },
          { glyph: 'beamed', left: '84%', top: '4%', size: 60, rotate: 8, drift: 100, opacity: 0.14 },
          { glyph: 'eighth', left: '3%', top: '62%', size: 44, rotate: -10, drift: 120, tone: 'orange', opacity: 0.12 },
          { glyph: 'eighth', left: '95%', top: '58%', size: 36, rotate: 14, drift: 60, tone: 'cyan', opacity: 0.12 },
        ]}
      />
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-12 px-5 pt-16 pb-10 lg:px-10 lg:pt-28 lg:pb-14 xl:px-[120px]">
        <div className="reveal relative flex max-w-[620px] flex-col items-center gap-[14px] text-center">
          <Eyebrow>{t.features.eyebrow}</Eyebrow>
          <h2
            id="features-title"
            className="text-[32px] leading-[38px] font-extrabold tracking-[-0.48px] text-text lg:text-[44px] lg:leading-[52px] lg:tracking-[-0.66px]"
          >
            {t.features.title}
          </h2>
          <p className="text-[17px] leading-[27px] text-muted">{t.features.body}</p>
        </div>
        <ul className="grid w-full gap-6 md:grid-cols-2 lg:grid-cols-3">
          {t.features.items.map((f) => (
            <li key={f.icon} className="reveal relative flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-7">
              <span className="flex size-11 items-center justify-center rounded-xl bg-surface2">
                <Icon name={f.icon} />
              </span>
              <h3 className="text-[19px] leading-[26px] font-bold text-text">{f.title}</h3>
              <p className="text-[15px] leading-[23px] text-muted">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ---------- Showcases ---------- */

// Figma "Phone" frame: 520 × 620 — panel, glow and a 277 px phone screen.
const SHOW_W = 520
const SHOW_H = 620

function ShowcasePhone({ src, alt, glow, bare }: { src: string; alt: string; glow: string; bare?: boolean }) {
  return (
    <div className="reveal relative mx-auto aspect-[520/620] w-full max-w-[520px] shrink-0 lg:mx-0 lg:w-[520px]">
      <img
        src={glow}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute max-w-none"
        style={place(SHOW_W, SHOW_H, -10, 40, 540, 540)}
      />
      {/* Phone screens are cropped to the phone body; round the corners and add the shadow here. */}
      <img
        src={src}
        alt={alt}
        width={bare ? 330 : 276.5}
        height={bare ? 714.5 : 599.5}
        loading="lazy"
        decoding="async"
        className={PHONE_IMG}
        style={{ ...place(SHOW_W, SHOW_H, 121.4, 10, 277.2), borderRadius: bare ? '12% / 5.6%' : PHONE_RADIUS }}
      />
    </div>
  )
}

function Showcase({
  id,
  copy,
  img,
  glow,
  phoneFirst,
  bare,
}: {
  id: string
  copy: Copy['listen']
  img: string
  glow: string
  phoneFirst: boolean
  bare?: boolean
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="overflow-x-clip">
      <div
        className={`mx-auto flex max-w-[1440px] flex-col gap-10 px-5 py-10 lg:items-center lg:gap-16 lg:px-10 lg:py-14 xl:gap-24 xl:px-[120px] ${
          phoneFirst ? 'lg:flex-row' : 'lg:flex-row-reverse'
        }`}
      >
        <ShowcasePhone src={img} alt={copy.alt} glow={glow} bare={bare} />
        <div className="reveal flex min-w-0 flex-1 flex-col gap-5">
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h2
            id={`${id}-title`}
            className="text-[32px] leading-[38px] font-extrabold tracking-[-0.48px] text-text lg:text-[40px] lg:leading-[48px]"
          >
            {copy.title}
          </h2>
          <p className="text-[17px] leading-[28px] text-muted">{copy.body}</p>
          <CheckList items={copy.bullets} />
        </div>
      </div>
    </section>
  )
}

/* ---------- Hymn Studio ---------- */

function Studio({ t }: { t: Copy }) {
  return (
    <section id="studio" aria-labelledby="studio-title">
      <div className="mx-auto max-w-[1440px] px-5 py-10 lg:px-10 lg:py-14 xl:px-[120px]">
        <div className="reveal rounded-[28px] bg-linear-to-r from-cyan/80 to-orange/80 p-px">
          <div className="flex items-center gap-16 rounded-[27px] bg-surface px-6 py-10 sm:px-14 sm:py-[52px]">
            <div className="flex min-w-0 flex-1 flex-col items-start gap-4">
              <Eyebrow tone="text-amber">{t.studio.eyebrow}</Eyebrow>
              <h2
                id="studio-title"
                className="text-[28px] leading-[35px] font-extrabold tracking-[-0.34px] text-text lg:text-[34px] lg:leading-[42px]"
              >
                {t.studio.title}
              </h2>
              <p className="text-[16px] leading-[26px] text-muted">{t.studio.body}</p>
              <div className="flex flex-col items-start gap-3 pt-2 sm:flex-row sm:flex-wrap">
                <GradientButton href={LINKS.studioDownload}>{t.studio.download}</GradientButton>
                <OutlineButton href={LINKS.studioHowItWorks}>{t.studio.how}</OutlineButton>
              </div>
              <p className="text-[13px] text-muted">{t.studio.platforms}</p>
            </div>
            <ol aria-label={t.studio.stepsLabel} className="hidden shrink-0 items-center gap-3 lg:flex">
              {t.studio.steps.map((s, i) => (
                <li key={s.icon} className="flex items-center gap-3">
                  {i > 0 && <Icon name="arrow-right" size={18} className="opacity-60" />}
                  <div className="flex w-[132px] flex-col items-start gap-2.5 rounded-2xl border border-line bg-bg p-[18px]">
                    <span className="flex size-10 items-center justify-center rounded-[10px] bg-surface2">
                      <Icon name={s.icon} />
                    </span>
                    <span className="text-[15px] font-bold whitespace-nowrap text-text">{s.title}</span>
                    <span className="text-[12px] whitespace-nowrap text-muted">{s.note}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div id="studio-how" className="flex flex-col gap-8 pt-14 lg:pt-16">
          <h3 className="text-[24px] leading-[30px] font-extrabold text-text lg:text-[28px] lg:leading-[34px]">
            {t.studio.shotsTitle}
          </h3>
          <ol className="grid gap-6 md:grid-cols-3">
            {t.studio.shots.map((s) => (
              <li key={s.img} className="reveal flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-4 pb-6">
                <img
                  src={s.img}
                  alt={s.alt}
                  width={1276}
                  height={787}
                  loading="lazy"
                  decoding="async"
                  className="h-auto w-full rounded-[8px] ring-1 ring-white/15"
                />
                <div className="flex flex-col gap-2 px-2">
                  <h4 className="text-[18px] leading-[24px] font-bold text-text">{s.title}</h4>
                  <p className="text-[15px] leading-[23px] text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

/* ---------- Final CTA + footer ---------- */

function FinalCta({ t }: { t: Copy }) {
  return (
    <section id="download" aria-labelledby="cta-title" className="relative overflow-x-clip">
      <div className="relative mx-auto flex max-w-[1440px] flex-col items-center gap-6 px-5 pt-16 pb-20 text-center lg:px-10 lg:pt-24 lg:pb-28 xl:px-[120px]">
        <img
          src="/img/cta-glow.svg"
          alt=""
          aria-hidden="true"
          width={840}
          height={540}
          className="pointer-events-none absolute top-[-50px] left-1/2 max-w-none -translate-x-1/2"
        />
        <FlowingStaff id="cta" className="staff-slide absolute inset-x-0 top-[38%] h-[200px] w-full" opacity={0.18} />
        <img src="/img/exalto-mark-cta.svg" alt="" aria-hidden="true" width={55.2} height={64} className="reveal relative" />
        <h2
          id="cta-title"
          className="relative max-w-[760px] text-[36px] leading-[42px] font-extrabold tracking-[-0.65px] text-text lg:text-[52px] lg:leading-[60px] lg:tracking-[-0.936px]"
        >
          {t.cta.title}
        </h2>
        <p className="relative text-[17px] leading-[27px] text-muted lg:text-[18px] lg:leading-[28px]">{t.cta.body}</p>
        <div className="relative flex justify-center pt-2">
          <StoreButtons t={t} />
        </div>
      </div>
    </section>
  )
}

function Footer({ t, lang, setLang }: { t: Copy; lang: Lang; setLang: (l: Lang) => void }) {
  const other: Lang = lang === 'es' ? 'en' : 'es'
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-5 pt-8 pb-10 lg:flex-row lg:items-center lg:justify-between lg:px-10 xl:px-[120px]">
        <div className="flex items-center gap-4">
          <Logo size="footer" />
          <p className="text-[14px] text-muted">© 2026 Exalto</p>
        </div>
        <nav aria-label={t.footer.label}>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[14px] font-medium text-muted lg:gap-x-7">
            <li>
              <a href={LINKS.privacy} className="hover:text-text">
                {t.footer.privacy}
              </a>
            </li>
            <li>
              <a href={LINKS.terms} className="hover:text-text">
                {t.footer.terms}
              </a>
            </li>
            <li>
              <a href={LINKS.support} className="hover:text-text">
                {t.footer.support}
              </a>
            </li>
            <li>
              <a href={LINKS.contact} className="hover:text-text">
                {t.footer.contact}
              </a>
            </li>
            <li>
              <button type="button" lang={other} onClick={() => setLang(other)} className="hover:text-text">
                {t.langSwitch.other}
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}

export default function App() {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const t = COPY[lang]
  // Subpages (/studio, /privacy, /terms, /support, /contact); everything else shows the landing page.
  const [path, setPath] = useState(() => window.location.pathname)
  const page = pageFromPath(path)

  // Client-side navigation with a view transition between pages. Internal links swap the page
  // in place (no reload); back/forward restore the previous scroll position.
  useEffect(() => {
    history.scrollRestoration = 'manual'
    const focusMain = () => document.getElementById('main')?.focus({ preventScroll: true })

    const go = (url: URL, push: boolean, restoreY?: number) => {
      const update = () => {
        if (push) {
          history.replaceState({ ...history.state, scrollY: window.scrollY }, '')
          history.pushState({ scrollY: 0 }, '', url.pathname + url.search + url.hash)
        }
        flushSync(() => setPath(url.pathname))
        const id = decodeURIComponent(url.hash.slice(1))
        const target = id ? document.getElementById(id) : null
        if (target) target.scrollIntoView({ behavior: 'instant' })
        else window.scrollTo({ top: restoreY ?? 0, behavior: 'instant' })
      }
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!document.startViewTransition || reduce) {
        update()
        focusMain()
        return
      }
      // Move focus to the new page once it's in place, so keyboard and screen-reader users follow.
      document.startViewTransition(update).finished.finally(focusMain)
    }

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest('a')
      if (!a || a.target || a.hasAttribute('download') || !a.href) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      // Same page: let the browser handle #section jumps.
      if (url.pathname === window.location.pathname) return
      e.preventDefault()
      go(url, true)
    }
    const onPop = () => go(new URL(window.location.href), false, history.state?.scrollY ?? 0)

    document.addEventListener('click', onClick)
    window.addEventListener('popstate', onPop)
    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('popstate', onPop)
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = page ? `${PAGE_TITLES[lang][page]} · Exalto` : t.meta.title
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.description)
  }, [lang, t, page])

  // Hymn Studio's page fades into the Studio app's neutral palette (see .theme-studio in index.css).
  useEffect(() => {
    if (page !== 'studio') return
    const root = document.documentElement
    const meta = document.querySelector('meta[name="theme-color"]')
    // Let the page paint in Exalto's colours first, then transition.
    const id = window.setTimeout(() => root.classList.add('theme-studio'), 150)
    meta?.setAttribute('content', '#0a0a0a')
    return () => {
      window.clearTimeout(id)
      root.classList.remove('theme-studio')
      meta?.setAttribute('content', '#1a120a')
    }
  }, [page])

  // Links like /#features from a subpage load the page before React draws the section, so the
  // browser can't jump to it on its own. Scroll there once it exists.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (!id) return
    const go = () => document.getElementById(id)?.scrollIntoView({ behavior: 'instant' })
    requestAnimationFrame(go)
    // Images above the section can still shift it while loading, so jump again once they're in.
    window.addEventListener('load', go, { once: true })
    return () => window.removeEventListener('load', go)
  }, [])

  const setLang = (l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(LANG_STORAGE_KEY, l)
    } catch {
      // Storage blocked: the choice lasts for this visit only.
    }
  }

  return (
    <div id="top">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-text px-4 py-2 font-semibold text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t.skip}
      </a>
      <Nav t={t} lang={lang} setLang={setLang} />
      <main id="main" tabIndex={-1} className="outline-none">
        {page === 'privacy' && <PrivacyPage lang={lang} />}
        {page === 'terms' && <TermsPage lang={lang} />}
        {page === 'support' && <SupportPage lang={lang} />}
        {page === 'contact' && <ContactPage lang={lang} />}
        {page === 'studio' && <StudioPage lang={lang} />}
        {page === null && <Landing t={t} lang={lang} />}
      </main>
      <Footer t={t} lang={lang} setLang={setLang} />
    </div>
  )
}

function Landing({ t, lang }: { t: Copy; lang: Lang }) {
  return (
    <>
        <Hero t={t} lang={lang} />
        <Hymnals t={t} />
        <Features t={t} />
        <Showcase
          id="listen"
          copy={t.listen}
          img={`/img/phone-queue-${lang}.webp`}
          glow="/img/glow-listen.svg"
          phoneFirst
        />
        <Showcase
          id="practice"
          copy={t.practice}
          img={`/img/phone-practice-${lang}.webp`}
          glow="/img/glow-score.svg"
          phoneFirst={false}
          bare
        />
        <Studio t={t} />
        <FinalCta t={t} />
    </>
  )
}
