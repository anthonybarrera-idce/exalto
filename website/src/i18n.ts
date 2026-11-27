export type Lang = 'es' | 'en'

export const LANG_STORAGE_KEY = 'exalto-lang'

/**
 * Outbound links. Placeholders until the store listings, the Hymn Studio
 * download and the legal/support pages exist. Replace before launch.
 */
export const LINKS = {
  appStore: '/#download', // TODO: App Store listing URL
  googlePlay: '/#download', // TODO: Google Play listing URL
  studioDownload: '/#studio', // TODO: Hymn Studio download URL (Mac and Windows)
  studioHowItWorks: '/studio',
  help: '/support',
  privacy: '/privacy',
  terms: '/terms',
  support: '/support',
  contact: '/contact',
  // The web version of the app (Firebase Hosting site exalto-web-app). `?signin=1` opens its sign-in screen.
  webApp: 'https://web.exalto.app/',
  signIn: 'https://web.exalto.app/?signin=1',
}

type Feature = { icon: string; title: string; body: string }
type Step = { icon: string; title: string; note: string }
type Shot = { img: string; title: string; body: string; alt: string }

export type Copy = {
  meta: { title: string; description: string }
  skip: string
  nav: { features: string; hymnals: string; leaders: string; help: string; cta: string; signIn: string; label: string }
  web: { open: string; note: string }
  langSwitch: { label: string; other: string }
  store: { appleTop: string; googleTop: string; appleLabel: string; googleLabel: string }
  hero: {
    eyebrow: string
    titleLead: string
    titleAccent: string
    body: string
    notes: string[]
    phonesAlt: { list: string; lyrics: string }
  }
  hymnals: { eyebrow: string; title: string; body: string; bullets: string[]; search: string; graphicLabel: string }
  features: { eyebrow: string; title: string; body: string; items: Feature[] }
  listen: { eyebrow: string; title: string; body: string; bullets: string[]; alt: string }
  practice: { eyebrow: string; title: string; body: string; bullets: string[]; alt: string }
  composers: {
    eyebrow: string
    title: string
    body: string
    bullets: string[]
    graphicLabel: string
    card: { name: string; handle: string; role: string; hymns: string; hymnals: string }
  }
  studio: {
    eyebrow: string
    title: string
    body: string
    download: string
    how: string
    platforms: string
    stepsLabel: string
    steps: Step[]
    shotsTitle: string
    shots: Shot[]
  }
  cta: { title: string; body: string }
  footer: { privacy: string; terms: string; support: string; contact: string; label: string }
}

const features = (t: [string, string][]): Feature[] =>
  ['book-open', 'headphones', 'mic', 'file-music', 'search', 'heart'].map((icon, i) => ({
    icon,
    title: t[i][0],
    body: t[i][1],
  }))

export const COPY: Record<Lang, Copy> = {
  es: {
    meta: {
      title: 'Exalto · Himnario digital para toda la iglesia',
      description:
        'Lee la letra, escucha la música y ensaya tu voz con los himnos que canta tu iglesia. En español y en inglés.',
    },
    skip: 'Saltar al contenido',
    nav: {
      features: 'Funciones',
      hymnals: 'Himnarios',
      leaders: 'Para músicos',
      help: 'Ayuda',
      cta: 'Descargar la app',
      signIn: 'Iniciar sesión',
      label: 'Principal',
    },
    langSwitch: { label: 'Idioma', other: 'English' },
    web: { open: 'Abrir en el navegador', note: 'O úsalo en el navegador, sin descargar nada.' },
    store: {
      appleTop: 'Descárgalo en el',
      googleTop: 'Disponible en',
      appleLabel: 'Descargar Exalto en el App Store',
      googleLabel: 'Descargar Exalto en Google Play',
    },
    hero: {
      eyebrow: 'Himnos nuevos de compositores de la iglesia',
      titleLead: 'Descubre himnos nuevos ',
      titleAccent: 'para cantar juntos.',
      body: 'Exalto reúne los himnos de siempre y cantos nuevos de compositores de la iglesia, revisados antes de publicarse. Lee la letra, escúchalos y aprende tu voz. En español y en inglés.',
      notes: ['Gratis', 'Sin necesidad de cuenta', 'iPhone y Android'],
      phonesAlt: {
        list: 'Exalto mostrando la lista de himnos y el selector de himnarios.',
        lyrics: 'Exalto mostrando la letra de «Porque vive él» con las opciones de lectura.',
      },
    },
    hymnals: {
      eyebrow: 'HIMNARIOS',
      title: 'Los himnarios de tu iglesia, en una sola app.',
      body: 'Cambia de himnario con un toque y encuentra cualquier himno por su número, su título o una línea que recuerdes de la letra. En Explorar descubres himnos para ensayar, con grabación y de compositores de la comunidad.',
      bullets: [
        'Todos los himnarios de tu iglesia en un solo lugar',
        'Busca por número, título, letra o compositor',
        'Descarga himnarios para usarlos sin conexión',
        'Himnos nuevos de compositores de la iglesia',
      ],
      search: 'Buscar por número, título o letra',
      graphicLabel: 'Ilustración de varios himnarios dentro de la app',
    },
    features: {
      eyebrow: 'FUNCIONES',
      title: 'Hecho para cantar juntos.',
      body: 'Todo lo que necesitas el domingo en la mañana, en el ensayo del miércoles o en casa con la familia.',
      items: features([
        [
          'Letra fácil de leer',
          'Estrofas y coro bien marcados. Cambia el tamaño y el espaciado del texto para leer desde la última banca.',
        ],
        [
          'Piano o a cappella',
          'Escucha el himno con piano o, si tiene grabación, a cappella, y sigue la letra mientras suena.',
        ],
        [
          'Ensaya tu voz',
          'Pistas de práctica para soprano, contralto, tenor y bajo, para que cada voz aprenda su parte.',
        ],
        ['Partitura', 'Abre la partitura, haz zoom con dos dedos y desliza para cambiar de página.'],
        [
          'Encuéntralo rápido',
          'Busca por número, título, letra o compositor, y filtra por himnario o por los que tienen grabación o notas de práctica.',
        ],
        [
          'Favoritos y listas',
          'Guarda los himnos que más cantas y arma listas para el culto. Con una cuenta, te acompañan en todos tus teléfonos.',
        ],
      ]),
    },
    listen: {
      eyebrow: 'ESCUCHAR',
      title: 'Prepara los himnos del domingo antes de salir de casa.',
      body: 'Arma la lista de himnos del culto y escúchalos en el camino. La cola muestra lo que sigue.',
      bullets: [
        'Arma una lista para cada culto',
        'Reordena la cola arrastrando',
        'Sigue sonando con la pantalla apagada',
      ],
      alt: 'La cola de reproducción de Exalto con los himnos del culto del domingo.',
    },
    practice: {
      eyebrow: 'ENSAYAR',
      title: 'Aprende tu voz, nota por nota.',
      body: 'En los himnos con notas de práctica, abre la partitura y escucha cada voz con piano. Baja el tempo hasta que te salga tu parte.',
      bullets: [
        'Soprano, contralto, tenor y bajo: escucha una voz o todas',
        'Ajusta el tempo más lento o más rápido',
        'Mantén presionada una nota para escucharla sostenida',
        'Notas de figuras para leer la melodía más fácil',
      ],
      alt: 'La pantalla Practicar de Exalto con la partitura, el tempo y las cuatro voces.',
    },
    composers: {
      eyebrow: 'PARA COMPOSITORES',
      title: 'Comparte tus himnos con la iglesia.',
      body: 'Si escribes himnos, pide acceso de compositor desde la app. Un administrador de la iglesia revisa tu solicitud y, cuando la aprueba, tienes tu propio perfil y tus propios himnarios.',
      bullets: [
        'Un perfil de compositor que todos pueden visitar',
        'Crea tus himnarios y escribe la letra desde la app',
        'Sube la partitura y las voces con Hymn Studio',
        'Cada himno aparece con tu nombre',
      ],
      graphicLabel: 'Ilustración de un perfil de compositor en Exalto',
      card: { name: 'Tu nombre', handle: '@tunombre', role: 'Compositor', hymns: 'Himnos', hymnals: 'Himnarios' },
    },
    studio: {
      eyebrow: 'PARA MÚSICOS',
      title: 'Convierte tus diapositivas en himnos con Exalto Hymn Studio.',
      body: 'La app de escritorio lee las diapositivas o el PDF de un himno y crea la partitura para piano, la letra y el audio de práctica para cada voz. Revisa las notas y súbelo a Exalto para que toda la iglesia lo cante.',
      download: 'Descargar Hymn Studio',
      how: 'Cómo funciona',
      platforms: 'Para Mac y Windows. Convierte los himnos en tu computadora, sin conexión.',
      stepsLabel: 'Cómo funciona Hymn Studio',
      steps: [
        { icon: 'presentation', title: 'Diapositivas', note: '.pptx o PDF' },
        { icon: 'file-music', title: 'Partitura', note: 'Notas revisadas' },
        { icon: 'users', title: 'Audio SATB', note: '4 voces' },
      ],
      shotsTitle: 'Así funciona Hymn Studio',
      shots: [
        {
          img: '/img/studio-import.webp',
          title: '1. Importa tus diapositivas',
          body: 'Arrastra archivos .pptx o PDF, o pega un enlace de Google Slides o Drive. Puedes convertir varios himnos a la vez.',
          alt: 'Hymn Studio en la pantalla Importar, con varias presentaciones en la cola.',
        },
        {
          img: '/img/studio-review.webp',
          title: '2. Revisa la partitura',
          body: 'Hymn Studio lee la partitura escaneada y marca lo que no tiene claro. Tú confirmas cada nota antes de seguir.',
          alt: 'Hymn Studio revisando una partitura, con una nota marcada para confirmar.',
        },
        {
          img: '/img/studio-practice.webp',
          title: '3. Escucha cada voz',
          body: 'Reproduce las cuatro voces juntas o una a la vez y cambia el tempo. Luego súbelo a Exalto como borrador para revisión.',
          alt: 'Hymn Studio en la pantalla Practicar, con controles para soprano, contralto, tenor y bajo.',
        },
      ],
    },
    cta: {
      title: 'Canta con tu iglesia, donde estés.',
      body: 'Gratis en iPhone y Android. Empieza a cantar como invitado, o crea una cuenta para guardar tus listas y favoritos.',
    },
    footer: {
      privacy: 'Privacidad',
      terms: 'Términos',
      support: 'Soporte',
      contact: 'Contacto',
      label: 'Pie de página',
    },
  },
  en: {
    meta: {
      title: 'Exalto · A digital hymnal for the whole church',
      description:
        'Read the lyrics, listen along and practice your voice part with the hymns your church sings. In Spanish and English.',
    },
    skip: 'Skip to content',
    nav: {
      features: 'Features',
      hymnals: 'Hymnals',
      leaders: 'For music leaders',
      help: 'Help',
      cta: 'Get the app',
      signIn: 'Sign in',
      label: 'Main',
    },
    langSwitch: { label: 'Language', other: 'Español' },
    web: { open: 'Open the web app', note: 'Or use it in your browser, nothing to download.' },
    store: {
      appleTop: 'Download on the',
      googleTop: 'Get it on',
      appleLabel: 'Download Exalto on the App Store',
      googleLabel: 'Get Exalto on Google Play',
    },
    hero: {
      eyebrow: 'New hymns from composers in the church',
      titleLead: 'Discover new hymns ',
      titleAccent: 'to sing together.',
      body: 'Exalto brings together the hymns you know and new songs from composers in the church, reviewed before they’re published. Read the lyrics, listen and learn your part. In Spanish and English.',
      notes: ['Free', 'Works without an account', 'iPhone and Android'],
      phonesAlt: {
        list: 'Exalto showing the hymn list and the hymnal picker.',
        lyrics: 'Exalto showing the lyrics of “Porque vive él” with the reading options.',
      },
    },
    hymnals: {
      eyebrow: 'HYMNALS',
      title: 'Your church’s hymnals, all in one app.',
      body: 'Switch hymnals with one tap and find any hymn by its number, its title or a line you remember from the lyrics. Discover shows hymns to practice, hymns with recordings and new songs from composers in the community.',
      bullets: [
        'All of your church’s hymnals in one place',
        'Search by number, title, lyrics or composer',
        'Download hymnals to use offline',
        'New hymns from composers in the church',
      ],
      search: 'Search by number, title or lyrics',
      graphicLabel: 'Illustration of several hymnals inside the app',
    },
    features: {
      eyebrow: 'FEATURES',
      title: 'Made for singing together.',
      body: 'Everything you need on Sunday morning, at Wednesday practice, or at home with the family.',
      items: features([
        [
          'Lyrics you can read',
          'Verses and chorus clearly marked. Change the text size and spacing so you can read from the back row.',
        ],
        [
          'Piano or a cappella',
          'Listen with piano or, when there’s a recording, a cappella, and follow the words as it sings.',
        ],
        ['Practice your part', 'Practice tracks for soprano, alto, tenor and bass, so every voice learns its line.'],
        ['Sheet music', 'Open the score, pinch to zoom and swipe between pages.'],
        [
          'Find it fast',
          'Search by number, title, lyrics or composer, and filter by hymnal or by hymns with recordings or practice notes.',
        ],
        [
          'Favorites and playlists',
          'Save the hymns you sing most and build playlists for the service. With an account, they follow you to every phone.',
        ],
      ]),
    },
    listen: {
      eyebrow: 'LISTEN',
      title: 'Get Sunday’s hymns ready before you leave the house.',
      body: 'Line up the hymns for the service and listen through them on the way. The queue shows what plays next.',
      bullets: [
        'Build a playlist for each service',
        'Reorder the queue by dragging',
        'Keeps playing with the screen off',
      ],
      alt: 'The Exalto play queue with the hymns for Sunday’s service.',
    },
    practice: {
      eyebrow: 'PRACTICE',
      title: 'Learn your part, note by note.',
      body: 'On hymns with practice notes, open the score and hear each voice part on piano. Slow the tempo down until your line feels natural.',
      bullets: [
        'Soprano, alto, tenor and bass: hear one voice or all four',
        'Make the tempo slower or faster',
        'Press and hold a note to hear it sustained',
        'Shape notes make the melody easier to read',
      ],
      alt: 'The Exalto Practice screen with the score, tempo and four voice parts.',
    },
    composers: {
      eyebrow: 'FOR COMPOSERS',
      title: 'Share your hymns with the church.',
      body: 'If you write hymns, request composer access from the app. A church admin reviews your request, and once it’s approved you get your own profile and your own hymnals.',
      bullets: [
        'A composer profile anyone can visit',
        'Create your hymnals and write the lyrics in the app',
        'Upload the score and voice parts with Hymn Studio',
        'Every hymn carries your name',
      ],
      graphicLabel: 'Illustration of a composer profile in Exalto',
      card: { name: 'Your name', handle: '@yourname', role: 'Composer', hymns: 'Hymns', hymnals: 'Hymnals' },
    },
    studio: {
      eyebrow: 'FOR MUSIC LEADERS',
      title: 'Turn your slides into hymns with Exalto Hymn Studio.',
      body: 'The desktop app reads a hymn’s slides or PDF and builds the piano score, the lyrics and practice audio for each voice. Check the notes, then send it to Exalto for the whole church to sing.',
      download: 'Download Hymn Studio',
      how: 'How it works',
      platforms: 'For Mac and Windows. Converts hymns on your computer, offline.',
      stepsLabel: 'How Hymn Studio works',
      steps: [
        { icon: 'presentation', title: 'Slides', note: '.pptx or PDF' },
        { icon: 'file-music', title: 'Score', note: 'Notes checked' },
        { icon: 'users', title: 'SATB audio', note: '4 voice parts' },
      ],
      shotsTitle: 'How Hymn Studio works',
      shots: [
        {
          img: '/img/studio-import.webp',
          title: '1. Import your slides',
          body: 'Drop in .pptx or PDF files, or paste a Google Slides or Drive link. Convert several hymns at once.',
          alt: 'Hymn Studio on the Import screen, with several slide decks in the queue.',
        },
        {
          img: '/img/studio-review.webp',
          title: '2. Check the score',
          body: 'Hymn Studio reads the scanned score and flags anything it isn’t sure about. You confirm each note before moving on.',
          alt: 'Hymn Studio reviewing a score, with one note flagged to confirm.',
        },
        {
          img: '/img/studio-practice.webp',
          title: '3. Hear every voice',
          body: 'Play all four voices together or one at a time and change the tempo. Then upload it to Exalto as a draft for review.',
          alt: 'Hymn Studio on the Practice screen, with controls for soprano, alto, tenor and bass.',
        },
      ],
    },
    cta: {
      title: 'Sing with your church, wherever you are.',
      body: 'Free on iPhone and Android. Start singing as a guest, or create an account to keep your playlists and favorites.',
    },
    footer: {
      privacy: 'Privacy',
      terms: 'Terms',
      support: 'Support',
      contact: 'Contact',
      label: 'Footer',
    },
  },
}

export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY)
    if (saved === 'es' || saved === 'en') return saved
  } catch {
    // Storage blocked (private mode, etc.): fall back to Spanish.
  }
  return 'es'
}
