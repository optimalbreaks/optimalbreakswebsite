/**
 * Alta de los eventos de Karmic Waves a partir de los carteles de karmic_waves_events/.
 * Un evento = un slug. Cartel → image_url. Horario → socials.schedule_image + gallery.
 * El resto (story, precios, otra versión) → gallery_urls.
 * Duplicados, tarjetas de artista y HEIC rotos no entran.
 *
 *   node scripts/push-karmic-waves-events.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'karmic_waves_events')

function loadEnvLocal() {
  const p = join(ROOT, '.env.local')
  if (!existsSync(p)) return
  let text = readFileSync(p, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  for (const line of text.split('\n')) {
    let t = line.trim()
    if (t.startsWith('export ')) t = t.slice(7).trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[k] === undefined) process.env[k] = v
  }
}

const KW = ['Karmic Waves', 'Florida']

/** @type {Array<Record<string, unknown>>} */
const EVENTS = [
  {
    slug: 'planet-zuton-zutopia-2026',
    name: 'Zutopia Music and Arts Festival 2026',
    event_type: 'festival',
    date_start: '2026-02-05',
    date_end: '2026-02-07',
    city: 'Ruskin',
    venue: 'Sun City Stables',
    location: 'Sun City Stables, Ruskin, Florida',
    address: 'Sun City Stables, Ruskin, FL',
    lineup: ['Karmic Waves', 'Vincent Antone', 'The Sponges'],
    tags: [...KW, 'Zutopia', 'Planet Zuton', '2026'],
    description_en:
      'Planet Zuton festival, 5–7 February 2026 at Sun City Stables, Ruskin (Florida). Karmic Waves played the weekend. Day timetables (Thursday, Friday and Saturday) sit with the flyer.',
    description_es:
      'Festival de Planet Zuton, del 5 al 7 de febrero de 2026 en Sun City Stables, Ruskin (Florida). Karmic Waves tocó el fin de semana. Los horarios de jueves, viernes y sábado van con el cartel.',
    images: [
      { file: 'FB_IMG_1769231681743.jpg', role: 'cover' },
      { file: 'FB_IMG_1767750653734.jpg', role: 'extra' },
      { file: 'ChatGPT Image Jan 30, 2026, 04_37_59 PM.png', role: 'schedule' },
      { file: 'ChatGPT Image Jan 30, 2026, 04_09_13 PM.png', role: 'schedule' },
      { file: 'ChatGPT Image Jan 30, 2026, 04_14_49 PM.png', role: 'schedule' },
    ],
  },
  {
    slug: 'planet-zuton-zutopia-2025',
    name: 'Zutopia Music and Arts Festival 2025',
    event_type: 'festival',
    date_start: '2025-02-07',
    date_end: '2025-02-09',
    city: 'Ruskin',
    venue: 'Sun City Stables',
    location: 'Sun City Stables, Ruskin, Florida',
    address: 'Sun City Stables, Ruskin, FL',
    lineup: [
      'Karmic Waves',
      'Phuture',
      'Guavatron',
      'Side Trakd',
      'Dose',
      'Dropkick',
      'Rohan Solo',
      'Sauce Pocket',
      'Tamayo',
      'Undercover Rasta',
      'Vibes Farm',
    ],
    tags: [...KW, 'Zutopia', 'Planet Zuton', '2025'],
    description_en:
      'Planet Zuton festival, 7–9 February 2025 at Sun City Stables, Ruskin (Florida). Full 2025 lineup on the flyer, with camping, water slides and a petting zoo. Karmic Waves is on the bill. Tickets were on Eventbrite.',
    description_es:
      'Festival de Planet Zuton, del 7 al 9 de febrero de 2025 en Sun City Stables, Ruskin (Florida). El cartel trae el lineup completo de 2025, con camping, toboganes y zoo de contacto. Karmic Waves está en el cartel. Las entradas estaban en Eventbrite.',
    images: [
      { file: 'FB_IMG_1731162482665.jpg', role: 'cover' },
      { file: 'FB_IMG_1735002591549.jpg', role: 'extra' },
    ],
  },
  {
    slug: 'essential-breaks-season-3-venice-2024',
    name: 'Essential Breaks Season 3',
    event_type: 'festival',
    date_start: '2024-08-23',
    date_end: '2024-08-25',
    city: 'Venice',
    venue: 'Hotel Venezia',
    location: 'Hotel Venezia, Venice, Florida',
    address: 'Hotel Venezia, Venice, FL',
    lineup: ['Karmic Waves', 'Vnssa', 'Space Wizard', 'Black V Neck', 'Artifakts'],
    tags: [...KW, 'Essential Breaks', 'Season 3', '2024'],
    description_en:
      'Essential Breaks presents Season 3, 23–25 August 2024 at Hotel Venezia, Venice (Florida). Karmic Waves played the weekend. The Facebook cover and the artist square sit next to the main flyer.',
    description_es:
      'Essential Breaks presenta Season 3, del 23 al 25 de agosto de 2024 en el Hotel Venezia, Venice (Florida). Karmic Waves tocó el fin de semana. La portada de Facebook y el cuadrado de artista van junto al cartel.',
    images: [
      { file: 'SEASON_3_1080x1920.jpg', role: 'cover' },
      { file: 'SEASON3_FBCOVER (1).jpg', role: 'extra' },
      { file: 'SEASON3_ANNOUNCE_FBEVENT.jpg', role: 'extra' },
      { file: 'KARMIC_WAVES_SQ.jpg', role: 'extra' },
    ],
  },
  {
    slug: 'earthfest-brooksville-2024',
    name: 'Earthfest 2024',
    event_type: 'festival',
    date_start: '2024-04-26',
    date_end: '2024-04-29',
    city: 'Brooksville',
    venue: 'Florida Classic Park',
    location: 'Florida Classic Park, Brooksville, Florida',
    address: '5300 Lockhart Rd, Brooksville, FL',
    website: 'https://artarmy.org/',
    lineup: ['Karmic Waves'],
    tags: [...KW, 'Earthfest', '2024'],
    description_en:
      'Earthfest, 26–29 April 2024 at Florida Classic Park, Brooksville (Florida): several stages (Earth, Fire, Water, Ether and more), art and vendors. Karmic Waves is on the bill. The timetable and the stage flyers are in the gallery.',
    description_es:
      'Earthfest, del 26 al 29 de abril de 2024 en Florida Classic Park, Brooksville (Florida): varios escenarios (Earth, Fire, Water, Ether y más), arte y puestos. Karmic Waves está en el cartel. El horario y los flyers de escenarios van en la galería.',
    images: [
      { file: 'received_1751808311970919.png', role: 'cover' },
      { file: 'received_1623587284843107.jpeg', role: 'extra' },
      { file: 'received_814678773825767.jpeg', role: 'extra' },
      { file: 'received_1771454296709829.jpeg', role: 'extra' },
      { file: 'received_742471434715155.jpeg', role: 'schedule' },
    ],
  },
  {
    slug: 'summer-splash-venice-2023',
    name: 'Summer Splash',
    event_type: 'festival',
    date_start: '2023-08-18',
    date_end: '2023-08-20',
    city: 'Venice',
    venue: 'Hotel Venezia',
    location: 'Hotel Venezia, Venice, Florida',
    address: '425 US 41 Bypass North, Venice, FL 34285',
    lineup: ['Karmic Waves'],
    tags: [...KW, 'Summer Splash', '2023'],
    description_en:
      'Resort takeover at Hotel Venezia, Venice (Florida), Friday 18 to Sunday 20 August 2023. Theme nights on the dress-code flyer; Saturday 19 August timetables and the Karmic Waves square sit with the lineup poster.',
    description_es:
      'Toma del resort en el Hotel Venezia, Venice (Florida), del viernes 18 al domingo 20 de agosto de 2023. Las noches temáticas van en el cartel de dress code; los horarios del sábado 19 de agosto y el cuadrado de Karmic Waves acompañan al cartel de lineup.',
    images: [
      { file: 'IMG_20230708_165505_846.jpg', role: 'cover' },
      { file: 'received_5947083998726646.jpeg', role: 'extra' },
      { file: 'karmic_waves_square.jpg', role: 'extra' },
      { file: 'received_1558201171377098.jpeg', role: 'schedule' },
      { file: 'received_1836537276741011.jpeg', role: 'schedule' },
      { file: 'received_967481957863882.jpeg', role: 'schedule' },
    ],
  },
  {
    slug: 'epiklandia-orlando-2025',
    name: 'Epiklandia',
    event_type: 'festival',
    date_start: '2025-11-07',
    date_end: '2025-11-09',
    city: 'Altamonte Springs',
    venue: 'Opal Hotel and Suites',
    location: 'Opal Hotel and Suites, Altamonte Springs, Florida',
    address: '230 W State Rd 436, Altamonte Springs, FL 32714',
    lineup: ['Karmic Waves'],
    tags: [...KW, 'Epiklandia', 'Orlando', '2025'],
    description_en:
      'Epyk and Fully Loaded hotel takeover in Orlando, 7–9 November 2025 at Opal Hotel and Suites, Altamonte Springs. Karmic Waves is on the bill. Friday, Saturday and Sunday timetables are with the flyer.',
    description_es:
      'Hotel takeover de Epyk y Fully Loaded en Orlando, del 7 al 9 de noviembre de 2025 en Opal Hotel and Suites, Altamonte Springs. Karmic Waves está en el cartel. Los horarios de viernes, sábado y domingo van con el flyer.',
    images: [
      { file: 'FB_IMG_1761673119399.jpg', role: 'cover' },
      { file: 'FB_IMG_1761183758752.jpg', role: 'extra' },
      { file: 'Messenger_creation_9B6B219A-4305-4403-B757-6B7ECD346CF0.jpeg', role: 'extra' },
      { file: 'Messenger_creation_3B9CAD02-EF05-426A-B577-9DA6161C308F.jpeg', role: 'schedule' },
      { file: 'Messenger_creation_BAD29671-C0CD-48EF-B122-29E70921D87D.jpeg', role: 'schedule' },
      { file: 'Messenger_creation_A7A404A4-1B16-4BCE-8859-3F072958A164.jpeg', role: 'schedule' },
    ],
  },
  {
    slug: 'camp-space-astatula-2025',
    name: 'Camp Space: The Bass Castle',
    event_type: 'festival',
    date_start: '2025-01-16',
    date_end: '2025-01-19',
    city: 'Astatula',
    venue: 'Camp Space',
    location: '22500 Robbins Rd, Astatula, Florida',
    address: '22500 Robbins Rd, Astatula, FL',
    lineup: ['Karmic Waves'],
    tags: [...KW, 'Camp Space', '2025'],
    description_en:
      'U&I and Recipe present Camp Space / The Bass Castle, 16–19 January 2025 at 22500 Robbins Rd, Astatula (Florida). Karmic Waves played. The Thursday–Saturday timetable and the tier-1 price sheet are with the flyer.',
    description_es:
      'U&I y Recipe presentan Camp Space / The Bass Castle, del 16 al 19 de enero de 2025 en 22500 Robbins Rd, Astatula (Florida). Tocó Karmic Waves. El horario de jueves a sábado y la hoja de precios del tier 1 van con el cartel.',
    images: [
      { file: 'Messenger_creation_E78C2B92-FE96-4095-9E5D-79B15542B0DC.jpeg', role: 'cover' },
      { file: 'received_536992719079526.jpeg', role: 'extra' },
      { file: 'FB_IMG_1733383258843.jpg', role: 'extra' },
      { file: 'received_542409962078436.jpeg', role: 'extra' },
      { file: 'FB_IMG_1736799425958.jpg', role: 'schedule' },
    ],
  },
  {
    slug: 'dark-moon-ocala-2023',
    name: 'Dark Moon',
    event_type: 'festival',
    date_start: '2023-12-08',
    date_end: '2023-12-10',
    city: 'Ocala',
    venue: 'Secret location',
    location: 'Secret location, Ocala, Florida',
    address: 'Ocala, FL',
    lineup: [
      'Karmic Waves',
      'U4IK',
      'Recipe',
      'J.Roh',
      'Suspence',
      'SphoRix',
      'True Self',
      'Hindorian',
      'Relevent',
      'King Trip',
    ],
    tags: [...KW, 'Dark Moon', '2023'],
    description_en:
      'Planet Zuton and Divine Time campout under the moon, 8–10 December 2023, secret location in Ocala (Florida). Bass music. Karmic Waves is on the bill. The logo flyer and the moon artwork are the two versions of the same weekend.',
    description_es:
      'Campamento de Planet Zuton y Divine Time bajo la luna, del 8 al 10 de diciembre de 2023, ubicación secreta en Ocala (Florida). Bass music. Karmic Waves está en el cartel. El flyer de logos y el de la luna son las dos versiones del mismo fin de semana.',
    images: [
      { file: 'received_1373634606918811.png', role: 'cover' },
      { file: 'FB_IMG_1694847817309.jpg', role: 'extra' },
    ],
  },
  {
    slug: 'rave-til-the-grave-st-pete-2024',
    name: 'Rave til the Grave',
    event_type: 'club_night',
    date_start: '2024-10-19',
    city: 'St. Petersburg',
    venue: 'The Warehouse',
    location: 'The Warehouse, St. Petersburg, Florida',
    address: '2626 Emerson Ave S, St. Petersburg, FL',
    tickets_url: 'https://tinyurl.com/grave2',
    doors_open: '21:00',
    doors_close: '06:00',
    lineup: ['Karmic Waves'],
    tags: [...KW, '2024'],
    description_en:
      '19 October 2024 at The Warehouse, 2626 Emerson Ave S, St. Petersburg. Doors 9pm–6am. Benefit night (Heather Effie and Debbie Santana birthdays, and libraries). Karmic Waves played. Tickets: tinyurl.com/grave2.',
    description_es:
      '19 de octubre de 2024 en The Warehouse, 2626 Emerson Ave S, St. Petersburg. De 21:00 a 06:00. Noche benéfica (cumpleaños de Heather Effie y Debbie Santana, y bibliotecas). Tocó Karmic Waves. Entradas: tinyurl.com/grave2.',
    images: [
      { file: 'FB_IMG_1789612368792.jpg', role: 'cover' },
      { file: 'FB_IMG_1726252404764.jpg', role: 'extra' },
    ],
  },
  {
    slug: 're-genesis-tampa-2023',
    name: 'RE/GENESIS',
    event_type: 'club_night',
    date_start: '2023-09-16',
    city: 'Tampa',
    venue: 'Warehouse Party',
    location: 'Warehouse Party, Tampa, Florida',
    address: '5718 E Adamo Drive, Tampa, FL',
    doors_open: '21:00',
    age_restriction: '21+',
    lineup: [
      'Karmic Waves',
      'Exzakt',
      'Burufunk',
      'Omega',
      'Eternal',
      'Andre Elektro Morales',
      'DJ Pulse',
      'Ms. Chevious',
      'Crudawg',
      'Lady Like P.A.C.',
      'DJ Kinz',
    ],
    tags: [...KW, '2023'],
    description_en:
      'B.O.S.S. Life, Elektro Global and Immersed Music, Saturday 16 September 2023 at Warehouse Party, 5718 E Adamo Drive, Tampa. 9pm, 21+. Karmic Waves is on the bill. A second flyer with artist photos is in the gallery.',
    description_es:
      'B.O.S.S. Life, Elektro Global e Immersed Music, sábado 16 de septiembre de 2023 en Warehouse Party, 5718 E Adamo Drive, Tampa. 21:00, +21. Karmic Waves está en el cartel. Un segundo flyer con fotos va en la galería.',
    images: [
      { file: 'FB_IMG_1756923833558.jpg', role: 'cover' },
      { file: 'Screenshot_20230822_002004_Facebook.jpg', role: 'extra' },
    ],
  },
  {
    slug: 'road-to-crystal-mountain-miami-lakes-2025',
    name: 'Road to Crystal Mountain',
    event_type: 'club_night',
    date_start: '2025-01-11',
    city: 'Miami Lakes',
    venue: 'The Garrison Taproom',
    location: 'The Garrison Taproom, Miami Lakes, Florida',
    address: '6709 Main St, Miami Lakes, FL',
    doors_open: '17:00',
    doors_close: '01:00',
    age_restriction: '21+',
    lineup: ['Karmic Waves', 'Menees', 'Gruv42', 'Huda', 'Orien Quest'],
    tags: [...KW, '2025'],
    description_en:
      'Saturday 11 January 2025, 5pm–1am, at The Garrison Taproom, 6709 Main St, Miami Lakes. Free entry, 21+. Karmic Waves is on the bill with Menees, Gruv42, Huda and Orien Quest. Story and landscape are the same flyer.',
    description_es:
      'Sábado 11 de enero de 2025, de 17:00 a 01:00, en The Garrison Taproom, 6709 Main St, Miami Lakes. Entrada libre, +21. Karmic Waves está en el cartel con Menees, Gruv42, Huda y Orien Quest. El story y el horizontal son el mismo cartel.',
    images: [
      { file: 'RTCM Miami_1080p.png', role: 'cover' },
      { file: 'RTCM Miami_Story Reel.png', role: 'extra' },
    ],
  },
  {
    slug: 'the-road-to-miami-vol-11-orlando-2026',
    name: 'The Road to Miami vol. 11',
    event_type: 'club_night',
    date_start: '2026-03-07',
    city: 'Orlando',
    venue: 'Broken Strings Tap Room',
    location: 'Broken Strings Tap Room, Orlando, Florida',
    address: '1012 W Church St, Orlando, FL',
    lineup: [
      'Karmic Waves',
      'J-Double',
      'DJ Genesis',
      'El Chino Dreadlion',
      'Essential Freaks',
      'James Wolfe',
      'Rob Cokeless',
      'Menees',
      'Akai Seven',
    ],
    tags: [...KW, '2026', 'Orlando'],
    description_en:
      'Fully Loaded, Paradise DJ, Deflo and Fern Ridge Distro. 7 March 2026 at Broken Strings Tap Room, 1012 W Church St, Orlando (Broken Strings Brewery). Karmic Waves is on the bill. The time-slot sheet (Inside, Patio, Psycho Circus) is the timetable.',
    description_es:
      'Fully Loaded, Paradise DJ, Deflo y Fern Ridge Distro. 7 de marzo de 2026 en Broken Strings Tap Room, 1012 W Church St, Orlando (Broken Strings Brewery). Karmic Waves está en el cartel. La hoja de franjas (Inside, Patio, Psycho Circus) es el horario.',
    images: [
      { file: 'received_926369896405840.jpeg', role: 'cover' },
      { file: 'FB_IMG_1772476878108.jpg', role: 'schedule' },
    ],
  },
  {
    slug: 'house-music-movement-massiv-tampa-2023',
    name: 'The House Movement Massiv',
    event_type: 'festival',
    date_start: '2023-12-31',
    date_end: '2024-01-01',
    city: 'Tampa',
    venue: 'The House Movement',
    location: '5305 E Henry Ave, Tampa, Florida',
    address: '5305 E Henry Ave, Tampa, FL 33610',
    doors_open: '16:00',
    doors_close: '08:00',
    lineup: ['Karmic Waves'],
    tags: [...KW, '2023', 'New Year'],
    description_en:
      'New Year ceremony, 31 December 2023 4pm through 1 January 2024 8am, at 5305 E Henry Ave, Tampa. 16 hours, three stages. Karmic Waves is on the set-times sheet.',
    description_es:
      'Ceremonia de Año Nuevo, del 31 de diciembre de 2023 a las 16:00 al 1 de enero de 2024 a las 08:00, en 5305 E Henry Ave, Tampa. 16 horas y tres escenarios. Karmic Waves está en la hoja de set times.',
    images: [
      { file: 'received_24444046405208986.jpeg', role: 'cover' },
      { file: 'received_401522032428823.jpeg', role: 'schedule' },
    ],
  },
  {
    slug: 'midnight-madness-hula-send-off-tampa-2023',
    name: 'Midnight Madness: Hula Send-off Costume Party',
    event_type: 'club_night',
    date_start: '2023-10-21',
    date_end: '2023-10-22',
    city: 'Tampa',
    venue: 'Cinco Soccer',
    location: 'Cinco Soccer, Tampa, Florida',
    address: '5305 E Henry Ave, Tampa, FL 33610',
    doors_open: '00:00',
    doors_close: '08:45',
    website: 'https://ticketdancers.com/',
    lineup: [
      'Tech Ezzy',
      'Cyber Oni',
      'Elevata',
      'Biotechnick',
      'Damion',
      'Soy Pasha',
      'GeeCee',
      'Lextacy',
      'Rynocerous',
      'Scronxs',
      'Svavge',
      'Kanobe',
      'Ccspinz',
    ],
    tags: ['Florida', 'Midnight Madness', '2023', 'Halloween'],
    description_en:
      'Costume party at Cinco Soccer, 5305 E Henry Ave, Tampa, 21–22 October 2023 (midnight to 8:45am). Two sound stages. The outside-stage sheet is billed Midnight Mass, same address and same dates. Karmic Waves does not appear on either flyer.',
    description_es:
      'Fiesta de disfraces en Cinco Soccer, 5305 E Henry Ave, Tampa, 21 y 22 de octubre de 2023 (de medianoche a las 08:45). Dos escenarios. La hoja del escenario exterior va como Midnight Mass, misma dirección y mismas fechas. Karmic Waves no sale en ninguno de los dos flyers.',
    images: [
      { file: 'IMG_20231021_184503_358.jpg', role: 'cover' },
      { file: 'received_1565799897534960.jpeg', role: 'schedule' },
    ],
  },
  {
    slug: 'midnight-madness-halloween-tampa-2024',
    name: 'Midnight Madness: Halloween Costume Party',
    event_type: 'club_night',
    date_start: '2024-10-26',
    city: 'Tampa',
    venue: null,
    location: '5305 E Henry Ave, Tampa, Florida',
    address: '5305 E Henry Ave, Tampa, FL 33610',
    doors_open: '00:00',
    doors_close: '08:00',
    website: 'https://ticketdancers.com/',
    lineup: ['Karmic Waves'],
    tags: [...KW, 'Midnight Madness', '2024', 'Halloween'],
    description_en:
      'Midnight Madness Halloween costume party, Saturday 26 October 2024, midnight to 8am, at 5305 E Henry Ave, Tampa. Costume contest. Tickets were on Ticketdancers. Another night from the Hula Send-off the year before.',
    description_es:
      'Fiesta de disfraces de Halloween de Midnight Madness, sábado 26 de octubre de 2024, de medianoche a las 08:00, en 5305 E Henry Ave, Tampa. Concurso de disfraces. Las entradas estaban en Ticketdancers. Es otra noche, distinta del Hula Send-off del año anterior.',
    images: [{ file: 'received_1682699925918709.jpeg', role: 'cover' }],
  },
  {
    slug: 'midnight-madness-labor-day-glo-tampa-2024',
    name: 'Midnight Madness: Labor Day Glo Party',
    event_type: 'club_night',
    date_start: '2024-08-31',
    city: 'Tampa',
    venue: null,
    location: '5305 E Henry Ave, Tampa, Florida',
    address: '5305 E Henry Ave, Tampa, FL 33610',
    doors_open: '00:00',
    doors_close: '08:00',
    website: 'https://ticketdancers.com/',
    lineup: ['Karmic Waves', 'Exzakt'],
    tags: [...KW, 'Midnight Madness', '2024'],
    description_en:
      'Midnight Madness Labor Day Glo Party, Saturday 31 August 2024, midnight to 8am, at 5305 E Henry Ave, Tampa. Karmic Waves is on the inside-stage timetable. Tickets were on Ticketdancers.',
    description_es:
      'Labor Day Glo Party de Midnight Madness, sábado 31 de agosto de 2024, de medianoche a las 08:00, en 5305 E Henry Ave, Tampa. Karmic Waves está en el horario del escenario interior. Las entradas estaban en Ticketdancers.',
    images: [
      { file: 'received_3783004671958313.jpeg', role: 'cover' },
      { file: 'received_8279000822166857.jpeg', role: 'schedule' },
    ],
  },
  {
    slug: 'project-mayhem-industry-social-miami-lakes-2024',
    name: "Project Mayhem's Industry Social",
    event_type: 'club_night',
    date_start: '2024-03-23',
    city: 'Miami Lakes',
    venue: 'The Garrison Taproom',
    location: 'The Garrison Taproom, Miami Lakes, Florida',
    address: '6709 Main St, Miami Lakes, FL 33014',
    doors_open: '13:00',
    doors_close: '02:00',
    lineup: ['Karmic Waves', 'Monk', 'Infiniti', 'Essential Freaks', 'Menees', 'Gruv42'],
    tags: [...KW, 'Project Mayhem', 'Industry Social', '2024'],
    description_en:
      "Project Mayhem's Industry Social, Saturday 23 March 2024, 1pm–2am, at The Garrison Taproom, 6709 Main St, Miami Lakes. Free. Karmic Waves is on the bill.",
    description_es:
      'Industry Social de Project Mayhem, sábado 23 de marzo de 2024, de 13:00 a 02:00, en The Garrison Taproom, 6709 Main St, Miami Lakes. Gratis. Karmic Waves está en el cartel.',
    images: [{ file: 'FB_IMG_1710957919985.jpg', role: 'cover' }],
  },
  {
    slug: 'project-mayhem-industry-social-20-years-2025',
    name: "Project Mayhem's Industry Social — 20 Year Anniversary",
    event_type: 'club_night',
    date_start: '2025-03-29',
    city: 'Miami Lakes',
    venue: 'The Garrison Taproom',
    location: 'The Garrison Taproom, Miami Lakes, Florida',
    address: '6709 Main St, Miami Lakes, FL 33014',
    doors_open: '14:00',
    doors_close: '02:00',
    lineup: [
      'Karmic Waves',
      'Deejay Shaxlin',
      'Mike Nice',
      'J-Break',
      'Sweet Charlie',
      'Mimo',
      'Menees',
      'Gruv42',
      'DJ Genesis',
      'Amber Jane',
      'Berto',
      'Orien Quest',
    ],
    tags: [...KW, 'Project Mayhem', 'Industry Social', '2025'],
    description_en:
      "Project Mayhem in association with Gigabeat Records. 20th anniversary Industry Social, Saturday 29 March 2025, 2pm–2am, at The Garrison Taproom, 6709 Main St, Miami Lakes. Karmic Waves is on the bill.",
    description_es:
      'Project Mayhem con Gigabeat Records. Industry Social del 20.º aniversario, sábado 29 de marzo de 2025, de 14:00 a 02:00, en The Garrison Taproom, 6709 Main St, Miami Lakes. Karmic Waves está en el cartel.',
    images: [{ file: 'FB_IMG_1737818898794.jpg', role: 'cover' }],
  },
  {
    slug: 'project-mayhem-industry-social-mmw-2026',
    name: "Project Mayhem's Industry Social — Miami Music Week 2026",
    event_type: 'club_night',
    date_start: '2026-03-28',
    city: 'Miami Lakes',
    venue: 'The Garrison Taproom',
    location: 'The Garrison Taproom, Miami Lakes, Florida',
    address: '6709 Main St, Miami Lakes, FL',
    doors_open: '12:00',
    doors_close: '03:00',
    lineup: ['Karmic Waves'],
    tags: [...KW, 'Project Mayhem', 'Industry Social', 'Miami Music Week', '2026'],
    description_en:
      "Project Mayhem's Industry Social during Miami Music Week, Saturday 28 March 2026, noon–3am. Karmic Waves played. The Red Room / Green Room timetable and the photo flyer are with the main poster.",
    description_es:
      'Industry Social de Project Mayhem durante la Miami Music Week, sábado 28 de marzo de 2026, de 12:00 a 03:00. Tocó Karmic Waves. El horario de Red Room / Green Room y el flyer con foto van con el cartel.',
    images: [
      { file: 'FB_IMG_1769481489669.jpg', role: 'cover' },
      { file: 'FB_IMG_1769558553368~2.jpg', role: 'extra' },
      { file: 'PM SOCIAL-TIMESLOTS.jpg', role: 'schedule' },
    ],
  },
  {
    slug: 'karmic-sessions-vol-1-st-pete-2024',
    name: 'Karmic Sessions Volume 001',
    event_type: 'club_night',
    date_start: '2024-04-20',
    city: 'St. Petersburg',
    venue: 'The Warehouse',
    location: '2626 Emerson Ave S, St. Petersburg, Florida',
    address: '2626 Emerson Ave S, St. Petersburg, FL',
    doors_open: '21:00',
    doors_close: '06:00',
    age_restriction: '18+',
    lineup: ['Karmic Waves', 'Freelance', 'Slay', 'Suspence', 'Trueself', 'Why Zzz'],
    tags: [...KW, 'Karmic Sessions', '2024'],
    description_en:
      'Karmic Sessions volume 001, 20 April 2024, 9pm–6am, 18+, at 2626 Emerson Ave S, St. Petersburg. Karmic Waves with Freelance, Slay, Suspence, Trueself and Why Zzz.',
    description_es:
      'Karmic Sessions volumen 001, 20 de abril de 2024, de 21:00 a 06:00, +18, en 2626 Emerson Ave S, St. Petersburg. Karmic Waves con Freelance, Slay, Suspence, Trueself y Why Zzz.',
    images: [{ file: 'IMG_20240221_190252.jpg', role: 'cover' }],
  },
  {
    slug: 'karmic-sessions-vol-2-st-pete-2025',
    name: 'Karmic Sessions Volume 002',
    event_type: 'club_night',
    date_start: '2025-09-06',
    city: 'St. Petersburg',
    venue: 'The Warehouse',
    location: 'The Warehouse, St. Petersburg, Florida',
    address: '2626 Emerson Ave S, St. Petersburg, FL',
    doors_open: '21:00',
    doors_close: '06:00',
    age_restriction: '18+',
    lineup: ['Karmic Waves', 'Freelance', 'Amber Jane', 'DJ Rok B', 'DJ Genesis', 'DJ Glair'],
    tags: [...KW, 'Karmic Sessions', '2025'],
    description_en:
      'Karmic Sessions volume 002, 6 September 2025, 9pm–6am, 18+, at The Warehouse, 2626 Emerson Ave S, St. Petersburg. Karmic Waves with Freelance, Amber Jane, DJ Rok B, DJ Genesis and DJ Glair.',
    description_es:
      'Karmic Sessions volumen 002, 6 de septiembre de 2025, de 21:00 a 06:00, +18, en The Warehouse, 2626 Emerson Ave S, St. Petersburg. Karmic Waves con Freelance, Amber Jane, DJ Rok B, DJ Genesis y DJ Glair.',
    images: [{ file: 'Messenger_creation_DA646413-9863-4E7D-AFCD-E75B2F16CBE8.jpeg', role: 'cover' }],
  },
  {
    slug: 'equinox-warehouse-st-pete-2023',
    name: 'Equinox',
    event_type: 'club_night',
    date_start: '2023-09-23',
    city: 'St. Petersburg',
    venue: 'The Warehouse',
    location: 'The Warehouse, St. Petersburg, Florida',
    address: '2626 Emerson Ave S, St. Petersburg, FL 33712',
    doors_open: '21:00',
    lineup: ['Karmic Waves', 'DJ Phenom', 'DJ Str8', 'Splizziff', 'Kinz', 'Spinzy', 'Empire X', 'Avalanche'],
    schedule: [
      { time: '21:00', artist: 'DJ Phenom' },
      { time: '22:00', artist: 'DJ Str8' },
      { time: '23:00', artist: 'Splizziff' },
      { time: '00:00', artist: 'Kinz' },
      { time: '01:00', artist: 'Spinzy' },
      { time: '02:00', artist: 'Empire X' },
      { time: '03:00', artist: 'Karmic Waves' },
      { time: '04:00', artist: 'Avalanche' },
    ],
    tags: [...KW, '2023'],
    description_en:
      'Saturday 23 September 2023 at The Warehouse, 2626 Emerson Ave S, St. Petersburg. N2iT and Avalanche Productions. Karmic Waves 3–4am. The flyer is the timetable, through sunrise.',
    description_es:
      'Sábado 23 de septiembre de 2023 en The Warehouse, 2626 Emerson Ave S, St. Petersburg. N2iT y Avalanche Productions. Karmic Waves de 03:00 a 04:00. El cartel es el horario, hasta el amanecer.',
    images: [{ file: 'received_864640591727311.jpeg', role: 'cover' }],
  },
  {
    slug: 'penny-and-beezie-birthday-bash-siesta-key-2024',
    name: "Penny and Beezie's Birthday Bash",
    event_type: 'festival',
    date_start: '2024-11-23',
    city: 'Siesta Key',
    venue: 'Sea Turtle Pavilion',
    location: 'Sea Turtle Pavilion, Siesta Key Beach, Florida',
    address: '948 Beach Rd, Siesta Key, FL 34242',
    doors_open: '10:00',
    lineup: [
      'Karmic Waves',
      'Rob Cokeless',
      'Michael Kean',
      'Yost',
      'Kinz',
      'Mike Diesel',
      'Amber Jane',
      'Danny Mac',
      'Juicy Junglist',
      'Berto',
      'Axel V',
      'Beezie',
      'James Wolfe',
    ],
    schedule: [
      { time: '10:00', artist: 'Rob Cokeless' },
      { time: '10:37', artist: 'Michael Kean' },
      { time: '11:14', artist: 'Yost' },
      { time: '11:51', artist: 'Karmic Waves' },
      { time: '12:28', artist: 'Kinz' },
      { time: '13:05', artist: 'Mike Diesel' },
      { time: '13:42', artist: 'Amber Jane' },
      { time: '14:19', artist: 'Danny Mac' },
      { time: '14:56', artist: 'Juicy Junglist' },
      { time: '15:33', artist: 'Berto' },
      { time: '16:10', artist: 'Axel V' },
      { time: '16:47', artist: 'Beezie' },
      { time: '17:24', artist: 'James Wolfe' },
    ],
    tags: [...KW, '2024', 'Siesta Key'],
    description_en:
      "Saturday 23 November 2024, 10am till sundown, at Sea Turtle Pavilion, Siesta Key Beach (948 Beach Rd). BYOB, no glass bottles. Karmic Waves at 11:51am. The flyer is the set-times sheet.",
    description_es:
      'Sábado 23 de noviembre de 2024, de las 10:00 hasta el anochecer, en Sea Turtle Pavilion, Siesta Key Beach (948 Beach Rd). Trae tu bebida, sin botellas de cristal. Karmic Waves a las 11:51. El cartel es la hoja de horarios.',
    images: [{ file: 'FB_IMG_1732314254466.jpg', role: 'cover' }],
  },
  {
    slug: 'united-we-mix-fort-myers',
    name: 'United We Mix',
    event_type: 'club_night',
    date_start: null,
    city: 'Fort Myers',
    venue: "Stet's Bar",
    location: "Stet's Bar, Fort Myers, Florida",
    address: '1926 Winkler Ave, Fort Myers, FL 33901',
    doors_open: '17:00',
    doors_close: '22:00',
    age_restriction: '21+',
    lineup: ['Karmic Waves', 'Iridescent', 'Sanchez Brothers', 'Calcast'],
    tags: [...KW, 'Fort Myers'],
    description_en:
      "Mad Rhythm presents United We Mix at Stet's Bar, 1926 Winkler Ave, Fort Myers. 26 January, 5pm–10pm, 21+, $10. The flyer does not print the year. Karmic Waves with Iridescent; support Sanchez Brothers and Calcast. VJ Nystagmus.",
    description_es:
      "Mad Rhythm presenta United We Mix en Stet's Bar, 1926 Winkler Ave, Fort Myers. 26 de enero, de 17:00 a 22:00, +21, 10 $. El cartel no pone el año. Karmic Waves con Iridescent; support Sanchez Brothers y Calcast. VJ Nystagmus.",
    images: [{ file: 'received_1112154430399469.jpeg', role: 'cover' }],
  },
  {
    slug: 'warehouse-party-empire-x-st-pete',
    name: 'Warehouse Party',
    event_type: 'club_night',
    date_start: null,
    city: 'St. Petersburg',
    venue: null,
    location: 'St. Petersburg, Florida',
    lineup: ['Karmic Waves', 'Empire X', 'Kinz', 'Spinzy', 'Avalanche', 'Splizziff', 'DJ Str8'],
    tags: [...KW, '2023'],
    description_en:
      'Warehouse Party hosted by N2iT and Avalanche Productions. Empire X birthday set. Karmic Waves (N2iT, St. Pete) is on the flyer. The artwork does not print a date; the photo is from 14 August 2023.',
    description_es:
      'Warehouse Party de N2iT y Avalanche Productions. Set de cumpleaños de Empire X. Karmic Waves (N2iT, St. Pete) está en el cartel. El diseño no lleva fecha; la foto es del 14 de agosto de 2023.',
    images: [{ file: 'IMG_20230814_232120.png', role: 'cover' }],
  },
  {
    slug: 'happy-birthday-katie-warehouse-st-pete',
    name: 'Happy Birthday Katie',
    event_type: 'club_night',
    date_start: null,
    city: 'St. Petersburg',
    venue: 'The Warehouse',
    location: 'The Warehouse, St. Petersburg, Florida',
    address: '2626 Emerson Ave S, St. Petersburg, FL',
    doors_open: '00:00',
    doors_close: '06:00',
    lineup: ['Karmic Waves', 'DJ Glair'],
    tags: [...KW],
    description_en:
      "80s and 90s night for Katie's birthday at The Warehouse, 2626 Emerson Ave S, St. Petersburg. Noon start, late set through 6am. Karmic Waves and DJ Glair. The flyer does not print the day.",
    description_es:
      'Noche de 80s y 90s por el cumpleaños de Katie en The Warehouse, 2626 Emerson Ave S, St. Petersburg. Empieza a las 12:00 y el late set llega hasta las 06:00. Karmic Waves y DJ Glair. El cartel no pone el día.',
    images: [{ file: 'Messenger_creation_33B4BDDC-73DC-4B5D-9399-F62B642C6E45.jpeg', role: 'cover' }],
  },
  {
    slug: 'a-night-of-mischief-tampa-2023',
    name: 'A Night of Mischief',
    event_type: 'club_night',
    date_start: '2023-10-28',
    city: 'Tampa',
    venue: 'Outpost',
    location: 'Outpost, Tampa, Florida',
    lineup: ['Karmic Waves'],
    tags: [...KW, '2023'],
    description_en:
      'Saturday 28 October 2023 in Tampa (Privé / Outpost). Karmic Waves is on the bill. The photo of the flyer is from 23 October 2023.',
    description_es:
      'Sábado 28 de octubre de 2023 en Tampa (Privé / Outpost). Karmic Waves está en el cartel. La foto del flyer es del 23 de octubre de 2023.',
    images: [{ file: 'IMG_20231023_161728_007.jpg', role: 'cover' }],
  },
]

async function toWebp(absPath) {
  return sharp(absPath, { failOn: 'none' })
    .rotate()
    .resize({ width: 1800, height: 2600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer()
}

async function main() {
  loadEnvLocal()
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim() || ''
  if (!baseUrl || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const sb = createClient(baseUrl, key)

  const slugs = EVENTS.map((e) => e.slug)
  const { data: existing, error: exErr } = await sb.from('events').select('slug, name').in('slug', slugs)
  if (exErr) throw exErr
  if (existing?.length) {
    console.log('Ya existían (se actualizan):', existing.map((r) => r.slug).join(', '))
  }

  let ok = 0
  for (const event of EVENTS) {
    const images = event.images
    const gallery = []
    let coverUrl = null
    let scheduleUrl = null
    let scheduleN = 0
    let extraN = 0
    for (const img of images) {
      const abs = join(SRC, img.file)
      if (!existsSync(abs)) throw new Error(`No está el archivo: ${img.file}`)
      const buf = await toWebp(abs)
      let name = 'poster.webp'
      if (img.role === 'schedule') {
        scheduleN += 1
        name = scheduleN === 1 ? 'schedule.webp' : `schedule-${scheduleN}.webp`
      } else if (img.role === 'extra') {
        extraN += 1
        name = `extra-${extraN}.webp`
      }
      const storagePath = `events/${event.slug}/${name}`
      const { error: upErr } = await sb.storage.from('media').upload(storagePath, buf, {
        contentType: 'image/webp',
        upsert: true,
      })
      if (upErr) throw new Error(`${event.slug} ${name}: ${upErr.message}`)
      const url = `${baseUrl}/storage/v1/object/public/media/${storagePath}`
      if (img.role === 'cover') coverUrl = url
      else gallery.push(url)
      if (img.role === 'schedule' && !scheduleUrl) scheduleUrl = url
    }

    const socials = scheduleUrl ? { schedule_image: scheduleUrl } : {}
    const row = {
      slug: event.slug,
      name: event.name,
      description_en: event.description_en,
      description_es: event.description_es,
      event_type: event.event_type,
      date_start: event.date_start,
      date_end: event.date_end ?? null,
      location: event.location,
      city: event.city,
      country: 'United States',
      venue: event.venue,
      address: event.address ?? null,
      image_url: coverUrl,
      gallery_urls: gallery,
      website: event.website ?? null,
      tickets_url: event.tickets_url ?? null,
      lineup: event.lineup,
      is_featured: false,
      promoter_organization_id: null,
      stages: [],
      schedule: event.schedule ?? [],
      socials,
      capacity: null,
      age_restriction: event.age_restriction ?? null,
      tags: event.tags,
      doors_open: event.doors_open ?? null,
      doors_close: event.doors_close ?? null,
      coords: null,
    }
    const { error } = await sb.from('events').upsert(row, { onConflict: 'slug' })
    if (error) throw new Error(`${event.slug}: ${error.message}`)
    ok += 1
    console.log(`OK ${ok}/${EVENTS.length} ${event.slug}  cover=${Boolean(coverUrl)} gallery=${gallery.length}`)
  }
  console.log(`Listo: ${ok} eventos.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
