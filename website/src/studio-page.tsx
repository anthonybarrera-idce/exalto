import type { CSSProperties } from 'react'
import type { Lang } from './i18n.ts'
import { LINKS } from './i18n.ts'
import { FlowingStaff, LooseNotes } from './music.tsx'

type Step = { img: string; eyebrow: string; title: string; body: string; bullets: string[]; alt: string }
type Card = { icon: string; title: string; body: string }

type StudioCopy = {
  title: string
  eyebrow: string
  lead: string
  accent: string
  body: string
  download: string
  access: string
  platforms: string
  heroAlt: string
  stepsTitle: string
  steps: Step[]
  filesTitle: string
  filesBody: string
  files: Card[]
  infoTitle: string
  info: Card[]
  ctaTitle: string
  ctaBody: string
  ctaButton: string
}

export const STUDIO_COPY: Record<Lang, StudioCopy> = {
  es: {
    title: 'Hymn Studio',
    eyebrow: 'PARA MÚSICOS',
    lead: 'De las diapositivas del culto ',
    accent: 'a un himno listo para cantar.',
    body: 'Exalto Hymn Studio es la app de escritorio del equipo de música. Lee las diapositivas o el PDF de un himno y crea la partitura para piano, la letra y el audio de práctica para cada voz. Tú revisas cada paso y, cuando está listo, lo envías a Exalto para que toda la iglesia lo cante.',
    download: 'Descargar Hymn Studio',
    access: 'Pedir acceso de editor',
    platforms: 'Para Mac y Windows · en español y en inglés',
    heroAlt: 'La pantalla de inicio de Hymn Studio, con los himnos recientes y el estado del convertidor.',
    stepsTitle: 'Cómo funciona',
    steps: [
      {
        img: '/img/studio-import.webp',
        eyebrow: 'PASO 1',
        title: 'Importa las diapositivas',
        body: 'Arrastra archivos .pptx o PDF, o pega un enlace de Google Slides o Drive. Cada diapositiva es una página escaneada del himno.',
        bullets: [
          'Convierte varias presentaciones a la vez',
          'Elige el himnario y el tempo antes de empezar',
          'Sigue el progreso de cada una en la cola',
        ],
        alt: 'Hymn Studio en la pantalla Importar, con varias presentaciones en la cola.',
      },
      {
        img: '/img/studio-review.webp',
        eyebrow: 'PASO 2',
        title: 'Revisa la partitura',
        body: 'Hymn Studio lee las notas escaneadas y te muestra lo que encontró: tonalidad, compás, voces y cada compás revisado.',
        bullets: [
          'Marca con «Por revisar» las notas que no tiene claras',
          'Corriges con un clic y la marca desaparece',
          'Un asistente sugiere arreglos que tú aceptas o rechazas',
        ],
        alt: 'Hymn Studio revisando una partitura, con una nota marcada para confirmar.',
      },
      {
        img: '/img/studio-lyrics.webp',
        eyebrow: 'PASO 3',
        title: 'Corrige la letra',
        body: 'La letra se lee de las diapositivas y un revisor con IA corrige la ortografía y los acentos. Cada cambio queda a la vista para que lo aceptes o lo deshagas.',
        bullets: [
          'Ortografía y acentos en español',
          'Cada corrección se puede deshacer',
          'Las sílabas se colocan sobre sus notas',
        ],
        alt: 'Hymn Studio en la pantalla Letra, con las correcciones de ortografía a un lado.',
      },
      {
        img: '/img/studio-practice.webp',
        eyebrow: 'PASO 4',
        title: 'Escucha cada voz',
        body: 'Un piano integrado toca las cuatro voces juntas o una a la vez, para que confirmes que el himno suena bien antes de publicarlo.',
        bullets: [
          'Soprano, contralto, tenor y bajo',
          'Mezclas rápidas para ensayar una voz',
          'Cambia el tempo',
        ],
        alt: 'Hymn Studio en la pantalla Practicar, con controles para cada voz.',
      },
      {
        img: '/img/studio-export.webp',
        eyebrow: 'PASO 5',
        title: 'Envíalo a Exalto',
        body: 'Guarda los archivos o envía el himno a Exalto como borrador. Un editor lo revisa antes de que aparezca en la app.',
        bullets: [
          'Elige el himnario, el número y el autor',
          'Se envía como borrador para revisión',
          'Guarda también todos los archivos en tu computadora',
        ],
        alt: 'Hymn Studio en la pantalla Exportar, con los archivos y el envío a Exalto.',
      },
    ],
    filesTitle: 'Lo que obtienes de cada himno',
    filesBody: 'Además de publicarlo en Exalto, puedes guardar estos archivos para el equipo de música.',
    files: [
      { icon: 'file-music', title: 'Partitura MusicXML', body: 'Se abre en MuseScore, Finale y Sibelius.' },
      { icon: 'presentation', title: 'Archivo MIDI', body: 'El piano del himno para cualquier reproductor.' },
      { icon: 'headphones', title: 'Audio de práctica', body: 'Un archivo .m4a con todas las voces y uno por cada voz.' },
      { icon: 'book-open', title: 'Letra lista', body: 'Corregida y lista para el editor de Exalto.' },
    ],
    infoTitle: 'Bueno saber',
    info: [
      {
        icon: 'check',
        title: 'Convierte sin conexión',
        body: 'La conversión se hace en tu computadora. El asistente y el revisor de ortografía necesitan internet. Solo se envía a Exalto lo que decides subir.',
      },
      {
        icon: 'users',
        title: 'Para editores y compositores',
        body: 'Inicias sesión con tu cuenta de Google. Los editores suben a los himnarios de la iglesia y los compositores, a sus propios himnarios.',
      },
      {
        icon: 'search',
        title: 'Nada se publica sin revisión',
        body: 'Los himnos llegan como borradores y un editor los aprueba antes de que la iglesia los vea.',
      },
    ],
    ctaTitle: '¿Eres músico en tu iglesia?',
    ctaBody: 'Escríbenos para recibir Hymn Studio y tu acceso. Si eres compositor, pide el acceso de compositor desde la app Exalto.',
    ctaButton: 'Contáctanos',
  },
  en: {
    title: 'Hymn Studio',
    eyebrow: 'FOR MUSIC LEADERS',
    lead: 'From the slides on Sunday ',
    accent: 'to a hymn ready to sing.',
    body: 'Exalto Hymn Studio is the music team’s desktop app. It reads a hymn’s slides or PDF and builds the piano score, the lyrics and practice audio for each voice. You check every step and, when it’s ready, send it to Exalto for the whole church to sing.',
    download: 'Download Hymn Studio',
    access: 'Request editor access',
    platforms: 'For Mac and Windows · in Spanish and English',
    heroAlt: 'The Hymn Studio home screen, with recent hymns and the converter status.',
    stepsTitle: 'How it works',
    steps: [
      {
        img: '/img/studio-import.webp',
        eyebrow: 'STEP 1',
        title: 'Import the slides',
        body: 'Drop in .pptx or PDF files, or paste a Google Slides or Drive link. Each slide is one scanned page of the hymn.',
        bullets: [
          'Convert several decks at once',
          'Pick the hymnal and tempo before you start',
          'Follow each deck’s progress in the queue',
        ],
        alt: 'Hymn Studio on the Import screen, with several slide decks in the queue.',
      },
      {
        img: '/img/studio-review.webp',
        eyebrow: 'STEP 2',
        title: 'Check the score',
        body: 'Hymn Studio reads the scanned notes and shows what it found: key, time signature, voices and every measure checked.',
        bullets: [
          'Marks the notes it isn’t sure about with “Needs a look”',
          'Fix them with one click and the flag clears',
          'An assistant suggests fixes you accept or reject',
        ],
        alt: 'Hymn Studio reviewing a score, with one note flagged to confirm.',
      },
      {
        img: '/img/studio-lyrics.webp',
        eyebrow: 'STEP 3',
        title: 'Correct the lyrics',
        body: 'The lyrics are read from the slides and an AI checker fixes their spelling and accents. Every change is shown so you can accept or undo it.',
        bullets: [
          'Spanish spelling and accents',
          'Every correction can be undone',
          'Syllables are placed on their notes',
        ],
        alt: 'Hymn Studio on the Lyrics screen, with spelling corrections listed beside the text.',
      },
      {
        img: '/img/studio-practice.webp',
        eyebrow: 'STEP 4',
        title: 'Hear every voice',
        body: 'A built-in piano plays all four voices together or one at a time, so you can confirm the hymn sounds right before it’s published.',
        bullets: ['Soprano, alto, tenor and bass', 'Quick mixes for practicing one part', 'Change the tempo'],
        alt: 'Hymn Studio on the Practice screen, with controls for each voice.',
      },
      {
        img: '/img/studio-export.webp',
        eyebrow: 'STEP 5',
        title: 'Send it to Exalto',
        body: 'Save the files, or send the hymn to Exalto as a draft. An editor reviews it before it appears in the app.',
        bullets: [
          'Choose the hymnal, number and author',
          'Sent as a draft for review',
          'Save every file to your computer too',
        ],
        alt: 'Hymn Studio on the Export screen, with the files and sending to Exalto.',
      },
    ],
    filesTitle: 'What you get for each hymn',
    filesBody: 'Besides publishing it in Exalto, you can save these files for the music team.',
    files: [
      { icon: 'file-music', title: 'MusicXML score', body: 'Opens in MuseScore, Finale and Sibelius.' },
      { icon: 'presentation', title: 'MIDI file', body: 'The hymn’s piano for any player.' },
      { icon: 'headphones', title: 'Practice audio', body: 'An .m4a with all voices, plus one for each voice.' },
      { icon: 'book-open', title: 'Ready lyrics', body: 'Corrected and ready for the Exalto editor.' },
    ],
    infoTitle: 'Good to know',
    info: [
      {
        icon: 'check',
        title: 'Converts offline',
        body: 'Conversion happens on your computer. Only what you choose to upload is sent to Exalto.',
      },
      {
        icon: 'users',
        title: 'For editors and composers',
        body: 'You sign in with your Google account. Editors upload to the church’s hymnals, and composers to their own.',
      },
      {
        icon: 'search',
        title: 'Nothing goes live unreviewed',
        body: 'Hymns arrive as drafts, and an editor approves them before the church sees them.',
      },
    ],
    ctaTitle: 'Are you a music leader in your church?',
    ctaBody: 'Write to us to get Hymn Studio and your access. Composers can request composer access in the Exalto app.',
    ctaButton: 'Contact us',
  },
}

// The icon files are drawn in amber; on this page they're shown in neutral grey.
const Icon = ({ name, size = 24 }: { name: string; size?: number }) => (
  <img
    src={`/icons/${name}.svg`}
    alt=""
    aria-hidden="true"
    width={size}
    height={size}
    className="grayscale brightness-[1.9]"
    style={{ width: size, height: size }}
  />
)

/** A desktop window screenshot, cropped to the window: round it and give it a shadow. */
function Shot({ src, alt, eager }: { src: string; alt: string; eager?: boolean }) {
  return (
    <img
      src={src}
      alt={alt}
      width={1276}
      height={787}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className="h-auto w-full rounded-[10px] shadow-[0_30px_60px_-24px_black] ring-1 ring-white/15"
    />
  )
}

export function StudioPage({ lang }: { lang: Lang }) {
  const c = STUDIO_COPY[lang]
  return (
    <div className="overflow-x-clip">
      {/* Hero */}
      <section aria-labelledby="page-title" className="relative">
        <LooseNotes
          notes={[
            { glyph: 'clef', left: '3%', top: '8%', size: 46, rotate: -8, drift: 70, tone: 'grey', opacity: 0.12 },
            { glyph: 'beamed', left: '88%', top: '6%', size: 56, rotate: 10, drift: 90, tone: 'grey', opacity: 0.14 },
          ]}
        />
        <div className="relative mx-auto flex max-w-[1100px] flex-col items-center gap-6 px-5 pt-10 text-center lg:pt-16">
          <p className="rise text-[13px] font-bold tracking-[1.56px] text-muted">{c.eyebrow}</p>
          <h1
            id="page-title"
            style={{ '--i': 1 } as CSSProperties}
            className="rise max-w-[900px] text-[40px] leading-[44px] font-extrabold tracking-[-0.8px] text-text sm:text-[52px] sm:leading-[58px] lg:text-[60px] lg:leading-[66px]"
          >
            {c.lead}
            <span className="text-mono-gradient">{c.accent}</span>
          </h1>
          <p
            style={{ '--i': 2 } as CSSProperties}
            className="rise max-w-[720px] text-[17px] leading-[28px] text-muted lg:text-[19px] lg:leading-[31px]"
          >
            {c.body}
          </p>
          <div
            style={{ '--i': 3 } as CSSProperties}
            className="rise flex flex-col items-center gap-3 pt-2 sm:flex-row"
          >
            <a
              href={LINKS.studioDownload}
              className="inline-flex rounded-full bg-text px-6 py-3 text-[15px] font-bold whitespace-nowrap text-bg hover:opacity-90"
            >
              {c.download}
            </a>
            <a
              href="/contact"
              className="inline-flex rounded-full border border-pill px-6 py-3 text-[15px] font-semibold whitespace-nowrap text-text hover:bg-surface2"
            >
              {c.access}
            </a>
          </div>
          <p style={{ '--i': 4 } as CSSProperties} className="rise text-[13px] text-muted">
            {c.platforms}
          </p>
        </div>
        <div className="relative mx-auto mt-12 max-w-[1100px] px-5 lg:mt-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[10%] top-[10%] bottom-0 rounded-full opacity-30 blur-3xl"
            style={{ backgroundImage: 'radial-gradient(closest-side, rgba(255,255,255,0.35), transparent)' }}
          />
          <div style={{ '--i': 4 } as CSSProperties} className="rise relative [perspective:2000px]">
            <div className="[transform:rotateX(8deg)] [transform-origin:50%_100%]">
              <Shot src="/img/studio-home.webp" alt={c.heroAlt} eager />
            </div>
          </div>
        </div>
        <FlowingStaff id="studio-hero" mono wave className="absolute inset-x-0 bottom-[-40px] h-[180px] w-full lg:h-[240px]" opacity={0.14} />
      </section>

      {/* Steps */}
      <section aria-labelledby="studio-steps" className="mx-auto max-w-[1200px] px-5 pt-24 pb-10 lg:px-10 lg:pt-32">
        <h2
          id="studio-steps"
          className="reveal text-center text-[32px] leading-[38px] font-extrabold tracking-[-0.48px] text-text lg:text-[44px] lg:leading-[52px]"
        >
          {c.stepsTitle}
        </h2>
        <ol className="mt-14 flex flex-col gap-20 lg:mt-20 lg:gap-28">
          {c.steps.map((s, i) => (
            <li
              key={s.img}
              className={`flex flex-col gap-8 lg:items-center lg:gap-16 ${i % 2 ? 'lg:flex-row-reverse' : 'lg:flex-row'}`}
            >
              <div className="reveal lg:w-[58%]">
                <Shot src={s.img} alt={s.alt} />
              </div>
              <div className="reveal flex flex-1 flex-col gap-4">
                <p className="text-[13px] font-bold tracking-[1.56px] text-muted">{s.eyebrow}</p>
                <h3 className="text-[28px] leading-[34px] font-extrabold tracking-[-0.3px] text-text lg:text-[32px] lg:leading-[38px]">
                  {s.title}
                </h3>
                <p className="text-[17px] leading-[28px] text-muted">{s.body}</p>
                <ul className="flex flex-col gap-3 pt-2">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-3 text-[16px] font-medium text-text">
                      <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-surface2">
                        <Icon name="check" size={14} />
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Files */}
      <section aria-labelledby="studio-files" className="relative mt-16 bg-surface">
        <LooseNotes
          notes={[
            { glyph: 'eighth', left: '5%', top: '20%', size: 40, rotate: -10, drift: 80, tone: 'grey', opacity: 0.12 },
            { glyph: 'quarter', left: '93%', top: '60%', size: 34, rotate: 12, drift: 60, tone: 'grey', opacity: 0.14 },
          ]}
        />
        <div className="relative mx-auto max-w-[1200px] px-5 py-16 lg:px-10 lg:py-24">
          <div className="reveal flex max-w-[640px] flex-col gap-3">
            <h2
              id="studio-files"
              className="text-[32px] leading-[38px] font-extrabold tracking-[-0.48px] text-text lg:text-[40px] lg:leading-[48px]"
            >
              {c.filesTitle}
            </h2>
            <p className="text-[17px] leading-[27px] text-muted">{c.filesBody}</p>
          </div>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {c.files.map((f) => (
              <li key={f.title} className="reveal flex flex-col gap-3 rounded-[20px] border border-line bg-bg p-6">
                <span className="flex size-11 items-center justify-center rounded-xl bg-surface2">
                  <Icon name={f.icon} />
                </span>
                <h3 className="text-[18px] font-bold text-text">{f.title}</h3>
                <p className="text-[15px] leading-[23px] text-muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Good to know */}
      <section aria-labelledby="studio-info" className="mx-auto max-w-[1200px] px-5 py-16 lg:px-10 lg:py-24">
        <h2
          id="studio-info"
          className="reveal text-[32px] leading-[38px] font-extrabold tracking-[-0.48px] text-text lg:text-[40px] lg:leading-[48px]"
        >
          {c.infoTitle}
        </h2>
        <ul className="mt-10 grid gap-5 md:grid-cols-3">
          {c.info.map((f) => (
            <li key={f.title} className="reveal flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-7">
              <span className="flex size-11 items-center justify-center rounded-xl bg-surface2">
                <Icon name={f.icon} />
              </span>
              <h3 className="text-[19px] font-bold text-text">{f.title}</h3>
              <p className="text-[15px] leading-[23px] text-muted">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* CTA */}
      <section aria-labelledby="studio-cta" className="relative">
        <FlowingStaff id="studio-cta" mono wave className="absolute inset-x-0 top-[20%] h-[200px] w-full" opacity={0.12} />
        <div className="reveal relative mx-auto flex max-w-[760px] flex-col items-center gap-5 px-5 pt-8 pb-24 text-center lg:pb-32">
          <h2
            id="studio-cta"
            className="text-[34px] leading-[40px] font-extrabold tracking-[-0.6px] text-text lg:text-[44px] lg:leading-[52px]"
          >
            {c.ctaTitle}
          </h2>
          <p className="text-[17px] leading-[27px] text-muted">{c.ctaBody}</p>
          <a
            href="/contact"
            className="inline-flex rounded-full bg-text px-6 py-3 text-[15px] font-bold text-bg hover:opacity-90"
          >
            {c.ctaButton}
          </a>
        </div>
      </section>
    </div>
  )
}
