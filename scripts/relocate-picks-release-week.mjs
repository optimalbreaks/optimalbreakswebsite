/**
 * Paso único editorial: reclasifica `data/charts/picks/*.json` por fecha de **`release_date`**
 * → **lunes ISO** (misma función que `chartEditionWeekMondayFromPublish` / batch NR).
 *
 * Semanas **`ABOLISHED_MONDAYS`**: cualquier tema cuyo lunes canonical caiga ahí se mudan a **`FIRST_SURVIVAL_MONDAY`**
 * (scraping pobre; ediciones que no queremos conservar como semana editorial).
 *
 *   node scripts/relocate-picks-release-week.mjs
 *   node scripts/relocate-picks-release-week.mjs --dry-run
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PICKS_DIR = path.join(ROOT, 'data/charts/picks')

const ABOLISHED_MONDAYS = new Set(['2026-03-02', '2026-03-09', '2026-03-16'])
const FIRST_SURVIVAL_MONDAY = '2026-03-23'

function chartEditionWeekMondayFromPublish(isoYYYYMMDD) {
  if (isoYYYYMMDD == null || isoYYYYMMDD === '') return null
  const s = String(isoYYYYMMDD).trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [ys, ms, ds] = s.split('-')
  const d = new Date(Number(ys), Number(ms) - 1, Number(ds))
  if (Number.isNaN(d.getTime())) return null
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function dedupeKey(linkUrl) {
  const n = (linkUrl || '').trim().toLowerCase()
  const m = n.match(/\/track\/[^/]+\/(\d+)/)
  return m ? `beatport:${m[1]}` : n
}

function correctedMonday(fileWeek, pick) {
  const rd =
    typeof pick.release_date === 'string' && pick.release_date.trim()
      ? pick.release_date.trim().slice(0, 10)
      : ''
  let w = rd ? chartEditionWeekMondayFromPublish(rd) : null
  if (!w) w = fileWeek
  if (ABOLISHED_MONDAYS.has(w)) return FIRST_SURVIVAL_MONDAY
  return w
}

function pickRichnessScore(p, hasDate) {
  let s = hasDate ? 4 : 0
  const bpm = typeof p.bpm === 'number' && p.bpm > 0
  const art = !!(p.artwork_url && String(p.artwork_url).trim())
  if (art) s += 1
  if (bpm) s += 1
  return s
}

function listPickFiles() {
  if (!fs.existsSync(PICKS_DIR)) throw new Error(`No existe ${PICKS_DIR}`)
  return fs
    .readdirSync(PICKS_DIR)
    .filter((f) => f.endsWith('.json') && !f.toLowerCase().includes('example'))
    .sort()
}

function mergeDuplicate(a, b) {
  const aDate = !!(a.pick.release_date && String(a.pick.release_date).trim())
  const bDate = !!(b.pick.release_date && String(b.pick.release_date).trim())
  if (aDate !== bDate) return aDate ? a : b
  const ds = pickRichnessScore(a.pick, aDate)
  const es = pickRichnessScore(b.pick, bDate)
  if (es > ds) return b
  if (es < ds) return a
  if (b.fileOrdinal < a.fileOrdinal) return b
  if (b.fileOrdinal > a.fileOrdinal) return a
  return b.sortOrdinal < a.sortOrdinal ? b : a
}

async function main() {
  const dry = process.argv.includes('--dry-run')
  const files = listPickFiles()
  const occurrences = []

  for (let fileOrdinal = 0; fileOrdinal < files.length; fileOrdinal++) {
    const basename = files[fileOrdinal]
    const fp = path.join(PICKS_DIR, basename)
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'))
    let fileWeek = String(raw.week_date || '').trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fileWeek)) {
      const fromName = basename.replace(/\.json$/i, '')
      fileWeek = /^\d{4}-\d{2}-\d{2}$/.test(fromName) ? fromName : '1970-01-01'
      console.warn(`  ⚠ ${basename}: week_date raro → uso '${fileWeek}'`)
    }
    const picks = Array.isArray(raw.picks) ? raw.picks : []
    picks.forEach((pick, idx) => {
      const sortOrdinal =
        Number.isFinite(Number(pick.sort_order)) && Number(pick.sort_order) >= 1
          ? Number(pick.sort_order)
          : idx + 1
      occurrences.push({
        dedupeKey: dedupeKey(pick.link_url),
        pick,
        fileWeek,
        fileOrdinal,
        sortOrdinal,
        basename,
      })
    })
  }

  occurrences.sort((a, b) => {
    const c = String(a.fileWeek).localeCompare(String(b.fileWeek))
    if (c !== 0) return c
    if (a.fileOrdinal !== b.fileOrdinal) return a.fileOrdinal - b.fileOrdinal
    return a.sortOrdinal - b.sortOrdinal
  })

  /** @type {Map<string, typeof occurrences[number]>} */
  const uniq = new Map()
  for (const occ of occurrences) {
    const k = occ.dedupeKey
    if (!k) {
      const t = (occ.pick?.title ?? '').slice(0, 80)
      console.warn('  ⚠ pick sin dedupe_key (sin link_url):', t || '(sin título)')
      continue
    }
    if (!uniq.has(k)) uniq.set(k, occ)
    else uniq.set(k, mergeDuplicate(uniq.get(k), occ))
  }

  const movers = []
  /** monday → orden estable de picks */
  const bucketOrder = new Map()

  for (const occ of uniq.values()) {
    const canonicalFromDate = chartEditionWeekMondayFromPublish(String(occ.pick.release_date || '').trim())
    let targetMon = correctedMonday(occ.fileWeek, occ.pick)
    if (targetMon !== occ.fileWeek) {
      movers.push({
        title: (occ.pick.title || '').slice(0, 60),
        link: occ.pick.link_url,
        from: occ.fileWeek,
        to: targetMon,
        release_date: occ.pick.release_date || '',
        abolishedCanon: canonicalFromDate && ABOLISHED_MONDAYS.has(canonicalFromDate),
      })
    }
    if (!bucketOrder.has(targetMon)) bucketOrder.set(targetMon, [])
    bucketOrder.get(targetMon).push(occ.pick)
  }

  console.log('\n=== Reubicación picks por release_week ===')
  console.log(`Semanas abolidas → todas caen en ${FIRST_SURVIVAL_MONDAY}:`, [...ABOLISHED_MONDAYS].sort().join(', '))
  console.log(`Ficheros de entrada (${files.length}):`, files.join(', ') || '(ninguno)')
  console.log(`Picks tras dedupe (global): ${uniq.size}`)
  console.log(`Cambiar semana (${movers.length}):`)
  movers
    .sort((a, b) => `${a.from}→${a.to}`.localeCompare(`${b.from}→${b.to}`) || a.title.localeCompare(b.title))
    .slice(0, 200)
    .forEach((r) =>
      console.log(
        `  · ${r.from} → ${r.to}  (${r.release_date || 'sin release_date'}${r.abolishedCanon ? '; canon abolido' : ''}) «${r.title}»`,
      ),
    )
  if (movers.length > 200) console.log(`  … y ${movers.length - 200} más`)

  if (dry) {
    console.log('\nDry-run: no escribe disco.')
    return
  }

  const written = []
  for (const [monday, picks] of [...bucketOrder.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (let i = 0; i < picks.length; i++) {
      picks[i].sort_order = i + 1
    }
    const outPath = path.join(PICKS_DIR, `${monday}.json`)
    fs.writeFileSync(
      outPath,
      `${JSON.stringify({ week_date: monday, picks }, null, 2)}\n`,
      'utf8',
    )
    written.push(monday)
  }

  /** Borrar ficheros cuya week_date ya no tiene picks (solo JSON `YYYY-MM-DD.json` que existían) */
  const keepNames = new Set(written.map((w) => `${w}.json`))
  const removedPaths = []
  for (const f of files) {
    if (/^\d{4}-\d{2}-\d{2}\.json$/i.test(f) && !keepNames.has(f)) {
      fs.unlinkSync(path.join(PICKS_DIR, f))
      removedPaths.push(f)
    }
  }

  console.log(`\nEscritos ${written.length} semana(s):`, written.sort().join(', '))
  if (removedPaths.length) console.log('Eliminados (vacíos/obsoletos):', removedPaths.join(', '))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
