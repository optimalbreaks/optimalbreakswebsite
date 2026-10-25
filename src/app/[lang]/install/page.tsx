// ============================================
// OPTIMAL BREAKS — Guía para instalar la web como app (PWA)
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { staticPageMetadata } from '@/lib/seo'
import InstallPwaButton from '@/components/InstallPwaButton'

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/install', 'install')
}

const mono = { fontFamily: "'Courier Prime', monospace" }
const display = { fontFamily: "'Unbounded', sans-serif", fontWeight: 900, textTransform: 'uppercase' as const }

/* ---------- Piezas de las maquetas ---------- */

function Phone({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <div className="mx-auto w-[210px] shrink-0 rounded-[30px] border-[6px] border-[var(--ink)] bg-[var(--ink)] shadow-[6px_6px_0_var(--red)]">
      <div
        className={`relative flex h-[400px] flex-col overflow-hidden rounded-[24px] ${dark ? 'bg-[#1c1c1e] text-white' : 'bg-white text-[#1a1a1a]'}`}
        style={{ fontFamily: 'system-ui, -apple-system, Roboto, sans-serif' }}
      >
        <div className="flex h-5 shrink-0 items-center justify-between px-4 text-[9px] font-semibold opacity-70">
          <span>18:08</span>
          <span className="h-3 w-12 rounded-full bg-[var(--ink)]" />
          <span>▮▮▮ ■</span>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Anillo rojo que marca dónde tocar. */
function Tap({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`relative inline-flex items-center justify-center rounded-md ring-[3px] ring-[var(--red)] ring-offset-1 ${className}`}>
      {children}
      <span className="pointer-events-none absolute -inset-1 animate-ping rounded-md ring-2 ring-[var(--red)] opacity-40" />
    </span>
  )
}

function FakePage() {
  return (
    <div className="flex flex-1 flex-col gap-2 bg-[#e8dcc8] p-3">
      <div className="bg-[#d62828] px-2 py-1.5 text-[10px] font-black uppercase tracking-tight text-white">Optimal Breaks</div>
      <div className="h-14 border-2 border-[#1a1a1a] bg-[#f7e733]" />
      <div className="h-2 w-3/4 bg-[#1a1a1a]/70" />
      <div className="h-2 w-1/2 bg-[#1a1a1a]/40" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-12 border-2 border-[#1a1a1a] bg-white" />
        <div className="h-12 border-2 border-[#1a1a1a] bg-white" />
      </div>
      <div className="h-2 w-2/3 bg-[#1a1a1a]/40" />
    </div>
  )
}

function ShareIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  )
}

function AppIcon({ size = 44 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/icon-192.png" alt="" width={size} height={size} className="rounded-[22%] shadow" style={{ width: size, height: size }} />
}

function HomeScreen({ label, dark = false }: { label: string; dark?: boolean }) {
  const ghost = dark ? 'bg-white/15' : 'bg-[#1a1a1a]/10'
  return (
    <div className={`grid flex-1 grid-cols-4 content-start gap-x-2 gap-y-4 p-4 ${dark ? 'bg-gradient-to-b from-[#3a2d5c] to-[#1c1c1e]' : 'bg-gradient-to-b from-[#cfe3d6] to-[#f1f1f1]'}`}>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div className={`h-9 w-9 rounded-[22%] ${ghost}`} />
          <div className={`h-1 w-7 rounded ${ghost}`} />
        </div>
      ))}
      <div className="flex flex-col items-center gap-1">
        <Tap className="rounded-[22%]">
          <AppIcon size={36} />
        </Tap>
        <span className="max-w-[48px] truncate text-[7px] font-semibold">{label}</span>
      </div>
    </div>
  )
}

/* ---------- Pantallas Android (Chrome) ---------- */

function ChromeBar({ highlightMenu }: { highlightMenu?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-black/10 bg-[#f1f3f4] px-2 py-1.5">
      <span className="text-[10px]">⌂</span>
      <div className="flex-1 truncate rounded-full bg-white px-2 py-1 text-[9px] text-black/70">🔒 optimalbreaks.com</div>
      <span className="text-[10px]">⧉</span>
      {highlightMenu ? (
        <Tap className="px-1 text-[13px] font-bold leading-none">⋮</Tap>
      ) : (
        <span className="px-1 text-[13px] font-bold leading-none">⋮</span>
      )}
    </div>
  )
}

function AndroidMenu({ items, highlight }: { items: string[]; highlight: number }) {
  return (
    <div className="absolute right-1.5 top-0.5 z-10 w-[150px] rounded-lg bg-white py-1 text-[9px] shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
      <div className="flex justify-around border-b border-black/10 pb-1 text-[11px] text-black/60">
        <span>→</span>
        <span>☆</span>
        <span>⬇</span>
        <span>ⓘ</span>
        <span>↻</span>
      </div>
      {items.map((it, i) =>
        i === highlight ? (
          <div key={it} className="px-1 py-0.5">
            <Tap className="w-full justify-start px-2 py-1 font-bold">
              <span className="mr-1.5">📲</span>
              {it}
            </Tap>
          </div>
        ) : (
          <div key={it} className="px-3 py-1.5 text-black/75">
            {it}
          </div>
        ),
      )}
    </div>
  )
}

function AndroidDialog({ es }: { es: boolean }) {
  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/45">
      <div className="w-full rounded-t-2xl bg-white p-3 text-[10px]">
        <div className="mb-2 font-bold">{es ? '¿Instalar aplicación?' : 'Install app?'}</div>
        <div className="mb-3 flex items-center gap-2">
          <AppIcon size={32} />
          <div>
            <div className="font-semibold">Optimal Breaks</div>
            <div className="text-[8px] text-black/55">www.optimalbreaks.com</div>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <span className="px-2 py-1 font-semibold text-[#1a73e8]">{es ? 'Cancelar' : 'Cancel'}</span>
          <Tap className="rounded-full bg-[#1a73e8] px-3 py-1 font-semibold text-white">{es ? 'Instalar' : 'Install'}</Tap>
        </div>
      </div>
    </div>
  )
}

/* ---------- Pantallas iPhone (Safari) ---------- */

function SafariBar({ highlight }: { highlight?: 'more' | 'share' }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-t border-black/10 bg-[#f6f6f6] px-2 py-2 text-[#007aff]">
      <span className="text-[13px] leading-none">‹</span>
      {highlight === 'share' ? (
        <Tap className="p-0.5">
          <ShareIcon />
        </Tap>
      ) : null}
      <div className="flex-1 truncate rounded-xl bg-white px-2 py-1 text-center text-[9px] text-black/70 shadow-sm">optimalbreaks.com</div>
      {highlight === 'more' ? (
        <Tap className="px-1 text-[12px] font-bold leading-none">···</Tap>
      ) : (
        <span className="px-1 text-[12px] font-bold leading-none">···</span>
      )}
    </div>
  )
}

function SafariMoreMenu({ es }: { es: boolean }) {
  const rows = es
    ? ['Añadir a favoritos', 'Nueva pestaña', 'Buscar en la página']
    : ['Add Bookmark', 'New Tab', 'Find on Page']
  return (
    <div className="absolute bottom-10 right-1.5 z-10 w-[150px] overflow-hidden rounded-xl bg-white/95 text-[9px] shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
      <div className="px-1 py-1">
        <Tap className="w-full justify-between px-2 py-1.5 font-bold">
          {es ? 'Compartir' : 'Share'}
          <ShareIcon className="h-3.5 w-3.5 text-[#007aff]" />
        </Tap>
      </div>
      {rows.map((r) => (
        <div key={r} className="border-t border-black/10 px-3 py-1.5 text-black/75">
          {r}
        </div>
      ))}
    </div>
  )
}

function IosShareSheet({ es }: { es: boolean }) {
  const rows = es ? ['Copiar', 'Añadir a la lista de lectura'] : ['Copy', 'Add to Reading List']
  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/35">
      <div className="w-full rounded-t-2xl bg-[#f2f2f7] p-2 text-[9px]">
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-white p-1.5">
          <AppIcon size={24} />
          <div className="min-w-0">
            <div className="truncate font-semibold">Optimal Breaks</div>
            <div className="text-[7px] text-black/50">optimalbreaks.com</div>
          </div>
        </div>
        <div className="mb-2 flex justify-around">
          {['AirDrop', 'Mensajes', 'Mail', 'WhatsApp'].map((a) => (
            <div key={a} className="flex flex-col items-center gap-0.5">
              <div className="h-7 w-7 rounded-full bg-black/15" />
              <span className="text-[6px] text-black/60">{a}</span>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-lg bg-white">
          {rows.map((r) => (
            <div key={r} className="border-b border-black/10 px-2 py-1.5 text-black/75">
              {r}
            </div>
          ))}
          <div className="px-1 py-1">
            <Tap className="w-full justify-between px-1.5 py-1 font-bold">
              {es ? 'Añadir a pantalla de inicio' : 'Add to Home Screen'}
              <span className="text-[11px] leading-none">⊞</span>
            </Tap>
          </div>
        </div>
      </div>
    </div>
  )
}

function IosAddDialog({ es }: { es: boolean }) {
  return (
    <div className="flex flex-1 flex-col bg-[#f2f2f7] text-[9px]">
      <div className="flex items-center justify-between border-b border-black/10 bg-[#f9f9f9] px-2 py-2">
        <span className="text-[#007aff]">{es ? 'Cancelar' : 'Cancel'}</span>
        <span className="font-semibold">{es ? 'Añadir a inicio' : 'Add to Home Screen'}</span>
        <Tap className="px-1.5 py-0.5 font-bold text-[#007aff]">{es ? 'Añadir' : 'Add'}</Tap>
      </div>
      <div className="m-2 flex items-center gap-2 rounded-lg bg-white p-2">
        <AppIcon size={40} />
        <div className="min-w-0 flex-1">
          <div className="border-b border-black/10 pb-1 font-semibold">OptimalBreaks</div>
          <div className="pt-1 text-[7px] text-black/50">https://www.optimalbreaks.com/es</div>
        </div>
      </div>
      <div className="mx-2 flex items-center justify-between rounded-lg bg-white px-2 py-2">
        <span>{es ? 'Abrir como app web' : 'Open as Web App'}</span>
        <span className="relative h-4 w-7 rounded-full bg-[#34c759]">
          <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full bg-white" />
        </span>
      </div>
      <p className="mx-3 mt-2 text-[7px] leading-snug text-black/50">
        {es
          ? 'Se añadirá un icono a tu pantalla de inicio para acceder rápidamente a esta web.'
          : 'An icon will be added to your Home Screen so you can quickly access this website.'}
      </p>
    </div>
  )
}

/* ---------- Página ---------- */

type Step = { title: string; body: ReactNode; screen: ReactNode }

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="m-0 list-none space-y-12 p-0">
      {steps.map((s, i) => (
        <li key={s.title} className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-10">
          {s.screen}
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-block bg-[var(--ink)] px-2 py-0.5 text-[var(--yellow)]" style={{ ...mono, fontWeight: 700, fontSize: '12px', letterSpacing: '2px' }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            <h3 className="mb-3 text-[17px] leading-tight" style={display}>
              {s.title}
            </h3>
            <div className="space-y-3" style={{ ...mono, fontSize: '15px', lineHeight: 1.7 }}>
              {s.body}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

export default async function InstallPage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  const es = lang === 'es'
  const label = 'OptimalBreaks'

  const android: Step[] = [
    {
      title: es ? 'Abre la web en Chrome' : 'Open the site in Chrome',
      body: (
        <>
          <p>
            {es ? 'Entra en ' : 'Go to '}
            <strong>www.optimalbreaks.com</strong>
            {es
              ? ' con Google Chrome (el navegador que viene en casi todos los Android).'
              : ' with Google Chrome (the browser that ships with almost every Android phone).'}
          </p>
          <p>
            {es
              ? 'Toca los tres puntos ⋮ de arriba a la derecha.'
              : 'Tap the three dots ⋮ in the top right corner.'}
          </p>
        </>
      ),
      screen: (
        <Phone>
          <ChromeBar highlightMenu />
          <FakePage />
        </Phone>
      ),
    },
    {
      title: es ? 'Toca «Instalar aplicación»' : 'Tap “Install app”',
      body: (
        <>
          <p>
            {es
              ? 'En el menú, busca «Instalar aplicación». En algunas versiones de Chrome se llama «Añadir a pantalla de inicio»: es lo mismo.'
              : 'In the menu, look for “Install app”. Some Chrome versions call it “Add to Home screen”: it does the same thing.'}
          </p>
          <p className="text-[var(--text-muted)]">
            {es
              ? 'A veces Chrome enseña abajo un aviso «Instalar Optimal Breaks» sin abrir el menú. Si te sale, tócalo y salta al paso 3.'
              : 'Sometimes Chrome shows an “Install Optimal Breaks” banner at the bottom without opening the menu. If you see it, tap it and skip to step 3.'}
          </p>
        </>
      ),
      screen: (
        <Phone>
          <ChromeBar />
          <div className="relative flex flex-1 flex-col">
            <FakePage />
            <AndroidMenu
              highlight={3}
              items={
                es
                  ? ['Nueva pestaña', 'Historial', 'Descargas', 'Instalar aplicación', 'Compartir…', 'Configuración']
                  : ['New tab', 'History', 'Downloads', 'Install app', 'Share…', 'Settings']
              }
            />
          </div>
        </Phone>
      ),
    },
    {
      title: es ? 'Confirma con «Instalar»' : 'Confirm with “Install”',
      body: (
        <p>
          {es
            ? 'Sale una ventana con el icono de Optimal Breaks. Toca «Instalar». Tarda un par de segundos: Android te avisa cuando está lista.'
            : 'A window with the Optimal Breaks icon pops up. Tap “Install”. It takes a couple of seconds: Android tells you when it’s ready.'}
        </p>
      ),
      screen: (
        <Phone>
          <ChromeBar />
          <div className="relative flex flex-1 flex-col">
            <FakePage />
            <AndroidDialog es={es} />
          </div>
        </Phone>
      ),
    },
    {
      title: es ? 'Ábrela desde el icono' : 'Open it from the icon',
      body: (
        <>
          <p>
            {es
              ? 'El icono rojo aparece en la pantalla de inicio o en el cajón de aplicaciones. Ábrela siempre desde ahí: se ve a pantalla completa, sin la barra del navegador.'
              : 'The red icon shows up on your home screen or in the app drawer. Always open it from there: it runs full screen, without the browser bar.'}
          </p>
        </>
      ),
      screen: (
        <Phone>
          <HomeScreen label={label} />
        </Phone>
      ),
    },
  ]

  const iphone: Step[] = [
    {
      title: es ? 'Abre la web en Safari' : 'Open the site in Safari',
      body: (
        <>
          <p>
            {es ? 'Entra en ' : 'Go to '}
            <strong>www.optimalbreaks.com</strong>
            {es ? ' con Safari, la brújula azul.' : ' with Safari, the blue compass.'}
          </p>
          <p>
            {es
              ? 'Toca el botón ··· de la barra de abajo, a la derecha de la dirección.'
              : 'Tap the ··· button in the bottom bar, to the right of the address.'}
          </p>
          <p className="text-[var(--text-muted)]">
            {es ? 'En iOS 18 o anterior, el botón Compartir ' : 'On iOS 18 or earlier, the Share button '}
            <ShareIcon className="inline h-4 w-4 align-[-3px]" />
            {es
              ? ' está directamente en la barra de abajo: tócalo y salta al paso 3.'
              : ' sits right in the bottom bar: tap it and skip to step 3.'}
          </p>
        </>
      ),
      screen: (
        <Phone>
          <FakePage />
          <SafariBar highlight="more" />
        </Phone>
      ),
    },
    {
      title: es ? 'Toca «Compartir»' : 'Tap “Share”',
      body: (
        <p>
          {es ? 'En el menú, toca «Compartir» ' : 'In the menu, tap “Share” '}
          <ShareIcon className="inline h-4 w-4 align-[-3px]" />
          {es ? ' (el cuadrado con la flecha hacia arriba).' : ' (the square with an arrow pointing up).'}
        </p>
      ),
      screen: (
        <Phone>
          <div className="relative flex flex-1 flex-col">
            <FakePage />
            <SafariMoreMenu es={es} />
          </div>
          <SafariBar />
        </Phone>
      ),
    },
    {
      title: es ? '«Añadir a pantalla de inicio»' : '“Add to Home Screen”',
      body: (
        <>
          <p>
            {es
              ? 'Desliza hacia arriba la hoja que se abre y toca «Añadir a pantalla de inicio».'
              : 'Swipe up on the sheet that opens and tap “Add to Home Screen”.'}
          </p>
          <p className="text-[var(--text-muted)]">
            {es
              ? '¿No aparece? Toca «Ver más» o «Editar acciones» al final de la lista y actívalo.'
              : 'Not there? Tap “View More” or “Edit Actions” at the bottom of the list and turn it on.'}
          </p>
        </>
      ),
      screen: (
        <Phone>
          <div className="relative flex flex-1 flex-col">
            <FakePage />
            <IosShareSheet es={es} />
          </div>
        </Phone>
      ),
    },
    {
      title: es ? 'Deja activado «Abrir como app web» y toca «Añadir»' : 'Keep “Open as Web App” on and tap “Add”',
      body: (
        <>
          <p>
            {es
              ? 'Puedes cambiar el nombre si quieres. Comprueba que el interruptor «Abrir como app web» está en verde (si tu iPhone lo enseña) y toca «Añadir» arriba a la derecha.'
              : 'You can rename it if you like. Check that the “Open as Web App” switch is green (if your iPhone shows it) and tap “Add” in the top right.'}
          </p>
          <p className="text-[var(--text-muted)]">
            {es
              ? 'En iPhone también se puede desde Chrome o Edge (iOS 16.4 o posterior): botón Compartir de la barra de direcciones → «Añadir a pantalla de inicio».'
              : 'On iPhone you can also do it from Chrome or Edge (iOS 16.4 or later): Share button in the address bar → “Add to Home Screen”.'}
          </p>
        </>
      ),
      screen: (
        <Phone>
          <IosAddDialog es={es} />
        </Phone>
      ),
    },
    {
      title: es ? 'Ábrela desde el icono' : 'Open it from the icon',
      body: (
        <p>
          {es
            ? 'El icono aparece en tu pantalla de inicio. Ábrela siempre desde ahí y no desde Safari: así suena con la pantalla bloqueada y tienes los controles en la pantalla de bloqueo.'
            : 'The icon appears on your Home Screen. Always open it from there, not from Safari: that way it keeps playing with the screen locked and you get lock-screen controls.'}
        </p>
      ),
      screen: (
        <Phone dark>
          <HomeScreen label={label} dark />
        </Phone>
      ),
    },
  ]

  const perks = es
    ? [
        ['Pantalla completa', 'Sin barra del navegador: más espacio para las listas y el reproductor.'],
        ['Suena en segundo plano', 'Pon una lista, bloquea el móvil y cambia de tema desde la pantalla de bloqueo.'],
        ['Un toque y dentro', 'Optimal Breaks junto al resto de tus apps, sin buscarla en el navegador.'],
        ['Sin tienda ni descargas', 'No pasa por Google Play ni App Store, casi no ocupa y siempre está al día.'],
      ]
    : [
        ['Full screen', 'No browser bar: more room for the lists and the player.'],
        ['Plays in the background', 'Start a list, lock your phone and skip tracks from the lock screen.'],
        ['One tap away', 'Optimal Breaks sits with the rest of your apps, no need to find it in the browser.'],
        ['No store, no download', 'It skips Google Play and the App Store, takes almost no space and is always up to date.'],
      ]

  const faq = es
    ? [
        ['¿Es gratis? ¿Necesito cuenta?', 'Gratis y sin cuenta. Si ya tienes cuenta, entra desde la app para guardar tus «+» en Mis Tracks.'],
        [
          'En iPhone, ¿por qué me pide entrar otra vez?',
          'iOS guarda la app instalada separada de Safari. Inicia sesión una vez dentro de la app y se queda recordada.',
        ],
        [
          'No se actualiza o algo va raro',
          'Ciérrala del todo: abre la multitarea (desliza desde abajo) y desliza Optimal Breaks hacia arriba. Al abrirla otra vez carga la última versión.',
        ],
        [
          'Uso Samsung Internet o Firefox',
          'Samsung Internet: menú ≡ → «Añadir página a» → «Pantalla de inicio». Firefox: menú ⋮ → «Instalar». El resultado es el mismo.',
        ],
        [
          '¿Cómo la quito?',
          'Mantén pulsado el icono. Android: «Desinstalar». iPhone: «Eliminar app» → «Eliminar de la pantalla de inicio».',
        ],
      ]
    : [
        ['Is it free? Do I need an account?', 'Free and no account needed. If you have one, sign in from the app to save your “+” in My Tracks.'],
        [
          'On iPhone, why do I have to sign in again?',
          'iOS keeps the installed app separate from Safari. Sign in once inside the app and it stays remembered.',
        ],
        [
          "It doesn't update or something feels off",
          'Close it fully: open the app switcher (swipe up from the bottom) and swipe Optimal Breaks away. Next time it opens, it loads the latest version.',
        ],
        [
          'I use Samsung Internet or Firefox',
          'Samsung Internet: menu ≡ → “Add page to” → “Home screen”. Firefox: menu ⋮ → “Install”. Same result.',
        ],
        [
          'How do I remove it?',
          'Long-press the icon. Android: “Uninstall”. iPhone: “Remove App” → “Remove from Home Screen”.',
        ],
      ]

  const h2 = 'mb-6 text-[clamp(20px,3.5vw,30px)] leading-tight'

  return (
    <div className="lined mx-auto min-h-screen max-w-[900px] px-4 py-14 sm:px-6 sm:py-20">
      <div className="sec-tag">PWA</div>
      <h1 className="sec-title text-[clamp(28px,5vw,50px)]">
        <span className="hl">{es ? 'INSTALA LA APP' : 'INSTALL THE APP'}</span>
      </h1>
      <p className="mb-8 max-w-[640px]" style={{ ...mono, fontSize: '16px', lineHeight: 1.7 }}>
        {es
          ? 'Optimal Breaks se instala en el móvil como una app más, directamente desde el navegador. Un minuto, sin tienda y sin descargar nada pesado.'
          : 'Optimal Breaks installs on your phone like any other app, straight from the browser. One minute, no store and nothing heavy to download.'}
      </p>

      <InstallPwaButton es={es} />

      <nav className="mt-8 flex flex-wrap gap-3" aria-label={es ? 'Elige tu móvil' : 'Pick your phone'}>
        <a
          href="#android"
          className="inline-flex min-h-11 items-center border-[3px] border-[var(--ink)] bg-[var(--acid)] px-5 text-[var(--ink)] no-underline shadow-[3px_3px_0_var(--ink)] hover:bg-[var(--paper)]"
          style={{ ...display, fontSize: '13px' }}
        >
          Android
        </a>
        <a
          href="#iphone"
          className="inline-flex min-h-11 items-center border-[3px] border-[var(--ink)] bg-[var(--paper)] px-5 text-[var(--ink)] no-underline shadow-[3px_3px_0_var(--ink)] hover:bg-[var(--yellow)]"
          style={{ ...display, fontSize: '13px' }}
        >
          iPhone / iPad
        </a>
      </nav>

      <section className="mt-14">
        <h2 className={h2} style={display}>
          {es ? 'Por qué instalarla' : 'Why install it'}
        </h2>
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
          {perks.map(([t, d]) => (
            <li key={t} className="border-[3px] border-[var(--ink)] bg-[var(--paper)] p-4">
              <div className="mb-1 text-[14px]" style={display}>
                {t}
              </div>
              <p className="m-0" style={{ ...mono, fontSize: '14px', lineHeight: 1.6 }}>
                {d}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section id="android" className="mt-16 scroll-mt-24">
        <h2 className={h2} style={display}>
          <span className="mr-2 inline-block bg-[var(--acid)] px-2">Android</span>
          {es ? 'con Chrome' : 'with Chrome'}
        </h2>
        <StepList steps={android} />
      </section>

      <section id="iphone" className="mt-20 scroll-mt-24">
        <h2 className={h2} style={display}>
          <span className="mr-2 inline-block bg-[var(--yellow)] px-2">iPhone / iPad</span>
          {es ? 'con Safari' : 'with Safari'}
        </h2>
        <StepList steps={iphone} />
      </section>

      <section className="mt-20">
        <h2 className={h2} style={display}>
          {es ? 'Preguntas rápidas' : 'Quick questions'}
        </h2>
        <div className="space-y-3">
          {faq.map(([q, a]) => (
            <details key={q} className="group border-[3px] border-[var(--ink)] bg-[var(--paper)]">
              <summary className="cursor-pointer list-none px-4 py-3 text-[14px]" style={display}>
                <span className="mr-2 inline-block transition-transform group-open:rotate-90">▸</span>
                {q}
              </summary>
              <p className="m-0 px-4 pb-4" style={{ ...mono, fontSize: '15px', lineHeight: 1.7 }}>
                {a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
