import { useState, type FormEvent, type ReactNode } from 'react'
import type { Lang } from './i18n.ts'

export const CONTACT_EMAIL = 'contact@exalto.app'

export type PageKey = 'privacy' | 'terms' | 'support' | 'contact' | 'studio'

export const PAGE_PATHS: Record<PageKey, string> = {
  privacy: '/privacy',
  terms: '/terms',
  support: '/support',
  contact: '/contact',
  studio: '/studio',
}

export function pageFromPath(path: string): PageKey | null {
  const clean = path.replace(/\/+$/, '') || '/'
  const hit = (Object.keys(PAGE_PATHS) as PageKey[]).find((k) => PAGE_PATHS[k] === clean)
  return hit ?? null
}

// Shown on the legal pages. Update it whenever the text changes.
const UPDATED = { es: '26 de noviembre de 2026', en: 'November 26, 2026' }

type Section = { h: string; p: ReactNode[] }

const Mail = () => (
  <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-cyan underline-offset-4 hover:underline">
    {CONTACT_EMAIL}
  </a>
)

/* ---------- Privacy ---------- */

const PRIVACY: Record<Lang, { title: string; intro: string; sections: Section[] }> = {
  es: {
    title: 'Política de privacidad',
    intro:
      'Exalto es un himnario digital creado por la Iglesia de Cristo en Elgin. Esta política explica qué información usan la app Exalto, la app de escritorio Exalto Hymn Studio y este sitio web, y para qué.',
    sections: [
      {
        h: 'La app Exalto',
        p: [
          'Puedes usar la app sin crear una cuenta. No usamos publicidad ni herramientas de análisis o seguimiento.',
          'La app guarda en tu teléfono tus himnos favoritos, el idioma que elijas y una copia de los himnos que has cargado, para que abran más rápido. Esa información se queda en tu dispositivo y no la recibimos.',
          'Para mostrar los himnos, la letra, las partituras y el audio, la app los descarga de nuestros servidores en Google Firebase. Como cualquier servicio en internet, Google procesa datos técnicos de esas conexiones (por ejemplo, tu dirección IP) para entregar el contenido.',
        ],
      },
      {
        h: 'Exalto Hymn Studio',
        p: [
          'Hymn Studio es para los músicos y editores de Exalto. Para subir himnos inicias sesión con tu cuenta de Google; usamos tu nombre y correo para identificarte como editor y registrar quién subió o revisó cada himno.',
          'Las diapositivas y los archivos que conviertes se procesan en tu computadora. Solo se envían a Exalto los himnos que decides subir.',
        ],
      },
      {
        h: 'Este sitio web',
        p: [
          'exalto.app no usa cookies, publicidad ni herramientas de análisis. Solo guarda en tu navegador el idioma que eliges.',
          'El sitio se aloja en Firebase Hosting de Google, que registra datos técnicos de las visitas (como la dirección IP) para entregar y proteger el servicio.',
          'Si nos escribes desde la página de contacto, el mensaje se envía desde tu propia app de correo. Usamos tu correo y lo que nos cuentes solo para responderte.',
        ],
      },
      {
        h: 'Con quién compartimos información',
        p: [
          'No vendemos ni compartimos tu información con terceros para publicidad. Usamos Google (Firebase y Google Workspace) para alojar el contenido y recibir correos.',
        ],
      },
      {
        h: 'Niños',
        p: [
          'La app no pide datos personales para usarse. Hymn Studio está pensado para adultos del equipo de música.',
        ],
      },
      {
        h: 'Tus opciones',
        p: [
          'Puedes borrar los datos guardados en tu teléfono desinstalando la app o borrando sus datos. Si eres editor y quieres que eliminemos tu cuenta de Hymn Studio, o tienes cualquier pregunta sobre tu información, escríbenos a ',
        ],
      },
      {
        h: 'Cambios',
        p: ['Si cambiamos esta política, actualizaremos esta página y la fecha de abajo.'],
      },
    ],
  },
  en: {
    title: 'Privacy policy',
    intro:
      'Exalto is a digital hymnal made by Iglesia de Cristo en Elgin. This policy explains what information the Exalto app, the Exalto Hymn Studio desktop app and this website use, and why.',
    sections: [
      {
        h: 'The Exalto app',
        p: [
          'You can use the app without creating an account. We don’t use advertising, analytics or tracking tools.',
          'The app stores your favorite hymns, the language you choose and a copy of the hymns you’ve loaded on your phone, so they open faster. That information stays on your device and isn’t sent to us.',
          'To show hymns, lyrics, sheet music and audio, the app downloads them from our servers on Google Firebase. Like any internet service, Google processes technical data from those connections (such as your IP address) to deliver the content.',
        ],
      },
      {
        h: 'Exalto Hymn Studio',
        p: [
          'Hymn Studio is for Exalto’s music leaders and editors. To upload hymns you sign in with your Google account; we use your name and email to identify you as an editor and to record who uploaded or reviewed each hymn.',
          'The slides and files you convert are processed on your computer. Only the hymns you choose to upload are sent to Exalto.',
        ],
      },
      {
        h: 'This website',
        p: [
          'exalto.app doesn’t use cookies, advertising or analytics. It only stores the language you choose in your browser.',
          'The site is hosted on Google’s Firebase Hosting, which logs technical data about visits (such as IP addresses) to deliver and protect the service.',
          'If you write to us from the contact page, the message is sent from your own email app. We use your email and what you tell us only to reply.',
        ],
      },
      {
        h: 'Who we share information with',
        p: [
          'We don’t sell your information or share it with third parties for advertising. We use Google (Firebase and Google Workspace) to host content and receive email.',
        ],
      },
      {
        h: 'Children',
        p: ['The app doesn’t ask for personal information to be used. Hymn Studio is meant for adults on the music team.'],
      },
      {
        h: 'Your choices',
        p: [
          'You can erase the data stored on your phone by uninstalling the app or clearing its data. If you’re an editor and want us to delete your Hymn Studio account, or you have any question about your information, write to ',
        ],
      },
      {
        h: 'Changes',
        p: ['If we change this policy, we’ll update this page and the date below.'],
      },
    ],
  },
}

/* ---------- Terms ---------- */

const TERMS: Record<Lang, { title: string; intro: string; sections: Section[] }> = {
  es: {
    title: 'Términos de uso',
    intro:
      'Estos términos se aplican a la app Exalto, a Exalto Hymn Studio y a este sitio web, creados por la Iglesia de Cristo en Elgin. Al usarlos, aceptas estos términos.',
    sections: [
      {
        h: 'Uso de Exalto',
        p: [
          'Exalto es gratis y está hecho para la adoración, el estudio y el ensayo, en la iglesia y en casa. Úsalo de forma respetuosa y no intentes dañar, copiar en masa ni interrumpir el servicio.',
        ],
      },
      {
        h: 'Himnos y derechos de autor',
        p: [
          'Muchos himnos son de dominio público; otros pertenecen a sus autores, traductores o editores. Los himnos se ofrecen para uso personal y congregacional. No los vendas ni los publiques en otro lugar sin permiso de quien tenga los derechos.',
          'Si crees que un himno se publicó sin permiso, escríbenos y lo revisaremos.',
        ],
      },
      {
        h: 'Himnos de la comunidad y Hymn Studio',
        p: [
          'Si subes un himno con Hymn Studio, confirmas que tienes derecho a compartirlo y nos permites mostrarlo en Exalto. Revisamos los himnos antes de publicarlos y podemos editarlos o no publicarlos.',
        ],
      },
      {
        h: 'Sin garantías',
        p: [
          'Hacemos lo posible por que la letra, las partituras y el audio sean correctos, pero Exalto se ofrece tal como está, sin garantías. Puede haber errores o interrupciones del servicio.',
        ],
      },
      {
        h: 'Cambios',
        p: [
          'Podemos cambiar Exalto o estos términos. Si los cambiamos, actualizaremos esta página y la fecha de abajo.',
        ],
      },
      {
        h: 'Contacto',
        p: ['Si tienes preguntas sobre estos términos, escríbenos a '],
      },
    ],
  },
  en: {
    title: 'Terms of use',
    intro:
      'These terms apply to the Exalto app, Exalto Hymn Studio and this website, made by Iglesia de Cristo en Elgin. By using them, you agree to these terms.',
    sections: [
      {
        h: 'Using Exalto',
        p: [
          'Exalto is free and made for worship, study and practice, at church and at home. Use it respectfully, and don’t try to harm, bulk-copy or disrupt the service.',
        ],
      },
      {
        h: 'Hymns and copyright',
        p: [
          'Many hymns are in the public domain; others belong to their authors, translators or publishers. Hymns are offered for personal and congregational use. Don’t sell them or publish them elsewhere without permission from whoever holds the rights.',
          'If you believe a hymn was published without permission, write to us and we’ll look into it.',
        ],
      },
      {
        h: 'Community hymns and Hymn Studio',
        p: [
          'If you upload a hymn with Hymn Studio, you confirm you have the right to share it and allow us to show it in Exalto. We review hymns before publishing them and may edit them or choose not to publish them.',
        ],
      },
      {
        h: 'No warranty',
        p: [
          'We do our best to keep lyrics, sheet music and audio accurate, but Exalto is provided as is, without warranties. There may be mistakes or interruptions in the service.',
        ],
      },
      {
        h: 'Changes',
        p: ['We may change Exalto or these terms. If we change them, we’ll update this page and the date below.'],
      },
      {
        h: 'Contact',
        p: ['If you have questions about these terms, write to '],
      },
    ],
  },
}

/* ---------- Support ---------- */

const SUPPORT: Record<
  Lang,
  { title: string; intro: string; faqs: { q: string; a: string }[]; moreTitle: string; moreBody: string; cta: string }
> = {
  es: {
    title: 'Soporte',
    intro: 'Respuestas a las preguntas más comunes sobre Exalto y Hymn Studio.',
    faqs: [
      {
        q: '¿Necesito crear una cuenta?',
        a: 'No. Abre la app y empieza a cantar. Las cuentas solo son para los editores que suben himnos con Hymn Studio.',
      },
      {
        q: '¿Cuánto cuesta?',
        a: 'Exalto es gratis en iPhone y Android.',
      },
      {
        q: '¿Puedo usar la app sin internet?',
        a: 'La app guarda en tu teléfono los himnos que ya cargaste, así que puedes leer su letra sin conexión. Para escuchar el audio y ver himnos nuevos necesitas internet.',
      },
      {
        q: '¿En qué idiomas está?',
        a: 'En español y en inglés. La app usa el idioma de tu teléfono.',
      },
      {
        q: '¿Por qué un himno no tiene la opción Practicar?',
        a: 'La práctica por voces solo aparece en los himnos que ya tienen notas de práctica. El equipo de música las va agregando con Hymn Studio.',
      },
      {
        q: 'Encontré un error en la letra o en la música.',
        a: 'Gracias por avisarnos. Escríbenos desde la página de contacto con el nombre o número del himno y lo que hay que corregir.',
      },
      {
        q: '¿Cómo consigo Hymn Studio?',
        a: 'Hymn Studio es para los músicos y editores de Exalto, en Mac y Windows. Escríbenos para pedir acceso.',
      },
    ],
    moreTitle: '¿No encontraste tu respuesta?',
    moreBody: 'Escríbenos y te responderemos lo antes posible.',
    cta: 'Contáctanos',
  },
  en: {
    title: 'Support',
    intro: 'Answers to the most common questions about Exalto and Hymn Studio.',
    faqs: [
      {
        q: 'Do I need an account?',
        a: 'No. Open the app and start singing. Accounts are only for editors who upload hymns with Hymn Studio.',
      },
      { q: 'How much does it cost?', a: 'Exalto is free on iPhone and Android.' },
      {
        q: 'Can I use the app without internet?',
        a: 'The app keeps the hymns you’ve already loaded on your phone, so you can read their lyrics offline. You need internet to play audio and see new hymns.',
      },
      {
        q: 'What languages is it in?',
        a: 'Spanish and English. The app uses your phone’s language.',
      },
      {
        q: 'Why doesn’t a hymn have the Practice option?',
        a: 'Practice by voice part only appears on hymns that already have practice notes. The music team adds them with Hymn Studio.',
      },
      {
        q: 'I found a mistake in the lyrics or the music.',
        a: 'Thanks for letting us know. Write to us from the contact page with the hymn’s name or number and what needs fixing.',
      },
      {
        q: 'How do I get Hymn Studio?',
        a: 'Hymn Studio is for Exalto’s music leaders and editors, on Mac and Windows. Write to us to ask for access.',
      },
    ],
    moreTitle: 'Didn’t find your answer?',
    moreBody: 'Write to us and we’ll get back to you as soon as we can.',
    cta: 'Contact us',
  },
}

/* ---------- Contact ---------- */

const CONTACT: Record<
  Lang,
  {
    title: string
    intro: string
    name: string
    topic: string
    topics: string[]
    message: string
    placeholder: string
    send: string
    note: string
    direct: string
    required: string
  }
> = {
  es: {
    title: 'Contacto',
    intro: 'Cuéntanos qué necesitas: preguntas, correcciones de himnos, acceso a Hymn Studio o ideas para Exalto.',
    name: 'Tu nombre',
    topic: 'Tema',
    topics: ['Pregunta general', 'Corrección de un himno', 'Acceso a Hymn Studio', 'Problema con la app', 'Otro'],
    message: 'Mensaje',
    placeholder: 'Escribe tu mensaje aquí…',
    send: 'Abrir en mi correo',
    note: 'Al enviar, se abrirá tu app de correo con el mensaje listo para mandar a',
    direct: 'También puedes escribirnos directamente a',
    required: 'Escribe un mensaje antes de continuar.',
  },
  en: {
    title: 'Contact',
    intro: 'Tell us what you need: questions, hymn corrections, Hymn Studio access or ideas for Exalto.',
    name: 'Your name',
    topic: 'Topic',
    topics: ['General question', 'Hymn correction', 'Hymn Studio access', 'Problem with the app', 'Other'],
    message: 'Message',
    placeholder: 'Write your message here…',
    send: 'Open in my email',
    note: 'When you send, your email app opens with the message ready to go to',
    direct: 'You can also write to us directly at',
    required: 'Write a message before continuing.',
  },
}

export const PAGE_TITLES: Record<Lang, Record<PageKey, string>> = {
  es: { privacy: PRIVACY.es.title, terms: TERMS.es.title, support: SUPPORT.es.title, contact: CONTACT.es.title, studio: 'Hymn Studio' },
  en: { privacy: PRIVACY.en.title, terms: TERMS.en.title, support: SUPPORT.en.title, contact: CONTACT.en.title, studio: 'Hymn Studio' },
}

/* ---------- Layout ---------- */

function PageShell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-[760px] px-5 pt-10 pb-20 lg:pt-16 lg:pb-28">
      <h1
        id="page-title"
        className="text-[36px] leading-[42px] font-extrabold tracking-[-0.65px] text-text lg:text-[48px] lg:leading-[56px]"
      >
        {title}
      </h1>
      <p className="mt-4 text-[17px] leading-[28px] text-muted">{intro}</p>
      <div className="mt-10">{children}</div>
    </section>
  )
}

function LegalBody({ sections, lang }: { sections: Section[]; lang: Lang }) {
  return (
    <>
      <div className="flex flex-col gap-9">
        {sections.map((s) => (
          <div key={s.h} className="flex flex-col gap-3">
            <h2 className="text-[20px] leading-[28px] font-bold text-text">{s.h}</h2>
            {s.p.map((para, i) => {
              const text = String(para)
              // Paragraphs that end mid-sentence ("… write to ") get the contact address appended.
              const withMail = text.endsWith(' ')
              return (
                <p key={i} className="text-[16px] leading-[27px] text-muted">
                  {text}
                  {withMail && (
                    <>
                      <Mail />.
                    </>
                  )}
                </p>
              )
            })}
          </div>
        ))}
      </div>
      <p className="mt-12 border-t border-line pt-6 text-[14px] text-muted">
        {lang === 'es' ? 'Última actualización: ' : 'Last updated: '}
        {UPDATED[lang]}
      </p>
    </>
  )
}

export function PrivacyPage({ lang }: { lang: Lang }) {
  const c = PRIVACY[lang]
  return (
    <PageShell title={c.title} intro={c.intro}>
      <LegalBody sections={c.sections} lang={lang} />
    </PageShell>
  )
}

export function TermsPage({ lang }: { lang: Lang }) {
  const c = TERMS[lang]
  return (
    <PageShell title={c.title} intro={c.intro}>
      <LegalBody sections={c.sections} lang={lang} />
    </PageShell>
  )
}

export function SupportPage({ lang }: { lang: Lang }) {
  const c = SUPPORT[lang]
  return (
    <PageShell title={c.title} intro={c.intro}>
      <div className="flex flex-col gap-3">
        {c.faqs.map((f) => (
          <details
            key={f.q}
            className="group rounded-2xl border border-line bg-surface px-5 py-4 open:bg-surface2/60"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold text-text [&::-webkit-details-marker]:hidden">
              {f.q}
              <span
                aria-hidden="true"
                className="text-[22px] leading-none text-muted transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-[16px] leading-[26px] text-muted">{f.a}</p>
          </details>
        ))}
      </div>
      <div className="mt-12 flex flex-col items-start gap-4 rounded-[20px] border border-line bg-surface p-7">
        <h2 className="text-[22px] font-bold text-text">{c.moreTitle}</h2>
        <p className="text-[16px] leading-[26px] text-muted">{c.moreBody}</p>
        <a
          href={PAGE_PATHS.contact}
          className="bg-brand-gradient inline-flex rounded-full px-5 py-[11px] text-[15px] font-bold text-ink hover:brightness-110"
        >
          {c.cta}
        </a>
      </div>
    </PageShell>
  )
}

const fieldClass =
  'w-full rounded-xl border border-line bg-surface px-4 py-3 text-[16px] text-text placeholder:text-muted/70 focus:border-cyan focus:outline-none'

export function ContactPage({ lang }: { lang: Lang }) {
  const c = CONTACT[lang]
  const [error, setError] = useState('')

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const topic = String(data.get('topic') ?? '').trim()
    const message = String(data.get('message') ?? '').trim()
    if (!message) {
      setError(c.required)
      return
    }
    setError('')
    // Nothing is sent to a server: the visitor's own email app opens with the message filled in.
    const subject = `Exalto · ${topic}`
    const body = name ? `${message}\n\n— ${name}` : message
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  return (
    <PageShell title={c.title} intro={c.intro}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="contact-name" className="text-[14px] font-semibold text-text">
            {c.name}
          </label>
          <input id="contact-name" name="name" type="text" autoComplete="name" className={fieldClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="contact-topic" className="text-[14px] font-semibold text-text">
            {c.topic}
          </label>
          <select id="contact-topic" name="topic" className={fieldClass} defaultValue={c.topics[0]}>
            {c.topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="contact-message" className="text-[14px] font-semibold text-text">
            {c.message}
          </label>
          <textarea
            id="contact-message"
            name="message"
            rows={7}
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'contact-error' : 'contact-note'}
            placeholder={c.placeholder}
            className={`${fieldClass} resize-y`}
          />
          {error && (
            <p id="contact-error" role="alert" className="text-[14px] font-medium text-amber">
              {error}
            </p>
          )}
        </div>
        <div className="flex flex-col items-start gap-3 pt-2">
          <button
            type="submit"
            className="bg-brand-gradient inline-flex rounded-full px-6 py-3 text-[15px] font-bold text-ink hover:brightness-110"
          >
            {c.send}
          </button>
          <p id="contact-note" className="text-[14px] leading-[22px] text-muted">
            {c.note} <Mail />.
          </p>
        </div>
      </form>
      <p className="mt-10 border-t border-line pt-6 text-[15px] text-muted">
        {c.direct} <Mail />.
      </p>
    </PageShell>
  )
}
