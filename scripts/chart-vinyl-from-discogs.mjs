/**
 * OPTIMAL BREAKS — Retro Vinyl Picks desde Discogs (+ YouTube)
 *
 * Recorre un sello o master en Discogs, abre cada release vinilo, extrae pistas
 * y busca en YouTube el primer vídeo razonable por canción.
 *
 *   node scripts/chart-vinyl-from-discogs.mjs --label 5838 --week 2026-05-18 --write --apply
 *   node scripts/chart-vinyl-from-discogs.mjs --label https://www.discogs.com/label/5838-Against-The-Grain --week 2026-05-18 --limit 15
 *   node scripts/chart-vinyl-from-discogs.mjs --master 19669 --week 2026-05-11 --merge --write
 *
 * Flags:
 *   --master / --label     Master o sello (id numérico o URL Discogs)
 *   --week YYYY-MM-DD      Semana editorial (lunes ISO)
 *   --limit N              Máx. pistas nuevas a generar
 *   --merge                Fusionar con JSON existente de esa semana
 *   --write / --apply      Guardar JSON y/o UPSERT Supabase
 *   --no-youtube           Solo metadatos Discogs (youtube_url vacío)
 *   --allow-no-youtube     Incluir pistas aunque no haya vídeo
 *   --backfill-artwork     Rellena artwork_url vacíos desde Discogs (con --week --write)
 *
 * Env: DISCOGS_TOKEN (opcional, rate limit 60/min)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const USER_AGENT = 'OptimalBreaks/1.0 (+https://www.optimalbreaks.com)'
const DISCOGS_BASE = 'https://api.discogs.com'
const TOKEN = process.env.DISCOGS_TOKEN?.trim() || ''
const PAUSE_MS = TOKEN ? 1100 : 2500

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseArgs(argv) {
  const opts = {
    master: null,
    label: null,
    week: null,
    limit: null,
    merge: false,
    write: false,
    apply: false,
    noYoutube: false,
    allowNoYoutube: false,
    backfillArtwork: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--master') opts.master = argv[++i]
    else if (a === '--label') opts.label = argv[++i]
    else if (a === '--week') opts.week = argv[++i]
    else if (a === '--limit') opts.limit = Number(argv[++i])
    else if (a === '--merge') opts.merge = true
    else if (a === '--write') opts.write = true
    else if (a === '--apply') opts.apply = true
    else if (a === '--no-youtube') opts.noYoutube = true
    else if (a === '--allow-no-youtube') opts.allowNoYoutube = true
    else if (a === '--backfill-artwork') opts.backfillArtwork = true
    else if (a === '--help' || a === '-h') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 22).join('\n'))
      process.exit(0)
    } else {
      console.error('Flag desconocida:', a)
      process.exit(1)
    }
  }
  if (!opts.week || !/^\d{4}-\d{2}-\d{2}$/.test(opts.week)) {
    console.error('Falta --week YYYY-MM-DD')
    process.exit(1)
  }
  if (!opts.master && !opts.label && !opts.backfillArtwork) {
    console.error('Indica --master, --label o --backfill-artwork')
    process.exit(1)
  }
  if (opts.apply && !opts.write) opts.write = true
  return opts
}

function discogsIdFromArg(arg, kind) {
  const s = String(arg || '').trim()
  const m = s.match(new RegExp(`/${kind}/(\\d+)`, 'i')) || s.match(/^(\d+)$/)
  if (!m) throw new Error(`ID Discogs inválido (${kind}): ${arg}`)
  return Number(m[1])
}

async function discogsFetch(path) {
  const url = new URL(`${DISCOGS_BASE}${path}`)
  if (TOKEN) url.searchParams.set('token', TOKEN)
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (res.status === 429) {
    console.warn('  ↳ Discogs 429, esperando 8s…')
    await sleep(8000)
    return discogsFetch(path)
  }
  if (!res.ok) throw new Error(`Discogs ${path}: HTTP ${res.status}`)
  await sleep(PAUSE_MS)
  return res.json()
}

function publicReleaseUrl(release) {
  if (release.uri) {
    const u = String(release.uri).trim()
    if (u.startsWith('http://') || u.startsWith('https://')) return u
    return `https://www.discogs.com${u.startsWith('/') ? u : `/${u}`}`
  }
  return `https://www.discogs.com/release/${release.id}`
}

function isVinylBrief(brief) {
  return /vinyl|12"/i.test(brief.format || '')
}

function isVinylRelease(release) {
  return (release.formats || []).some((f) => /vinyl/i.test(f.name || ''))
}

function pickDiscogsArtwork(release) {
  const imgs = release.images || []
  const primary = imgs.find((i) => i.type === 'primary') || imgs[0]
  return (primary?.uri || primary?.uri150 || '').trim()
}

function formatString(release) {
  const f = release.formats?.[0]
  if (!f) return '12"'
  const bits = [f.name, ...(f.descriptions || [])].filter(Boolean)
  return bits.join(', ').replace(/"/g, '\\"') || '12"'
}

function splitTitleMix(rawTitle) {
  const t = (rawTitle || '').trim()
  const m = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (m) return { title: m[1].trim(), mix_name: m[2].trim() }
  return { title: t, mix_name: '' }
}

function artistsFromRelease(release, track) {
  if (Array.isArray(track?.artists) && track.artists.length) {
    return track.artists
      .map((a) => ({ name: (a.name || a.anv || '').trim() }))
      .filter((a) => a.name)
  }
  const main = (release.artists || [])
    .map((a) => ({ name: (a.name || '').trim() }))
    .filter((a) => a.name)
  return main.length ? main : [{ name: 'Unknown' }]
}

function trackKey(discogsUrl, title, mixName, artists) {
  const t = norm(title)
  const m = norm(mixName)
  const a = (artists || [])
    .map((x) => norm(typeof x === 'string' ? x : x?.name || ''))
    .filter(Boolean)
    .sort()
    .join(',')
  return `${a}::${t}::${m}`
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function scoreYouTubeTitle(ytTitle, artistNames, trackTitle) {
  const y = norm(ytTitle)
  const t = norm(trackTitle)
  const artists = artistNames.map(norm).filter(Boolean)
  let score = 0
  if (t && y.includes(t)) score += 4
  for (const a of artists) {
    if (a.length > 2 && y.includes(a)) score += 2
  }
  if (/remix|mix|edit|version|vip|dub/i.test(trackTitle) && /remix|mix|edit|version/i.test(ytTitle)) {
    score += 1
  }
  if (/topic|djvinylo|vinyl|breakbeat|breaks/i.test(ytTitle)) score += 0.5
  return score
}

async function searchYouTubeBest(artistNames, trackTitle) {
  const primaryArtist = artistNames[0] || ''
  const queries = [
    `${primaryArtist} ${trackTitle}`,
    `${artistNames.join(' ')} ${trackTitle}`,
    `${trackTitle} ${primaryArtist} breaks`,
  ]
  let best = null
  for (const q of queries) {
    let html = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const enc = encodeURIComponent(q.trim())
        const res = await fetch(`https://www.youtube.com/results?search_query=${enc}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' },
        })
        if (!res.ok) throw new Error(`YouTube HTTP ${res.status}`)
        html = await res.text()
        break
      } catch (e) {
        if (attempt === 2) console.warn(`    ⚠ YouTube search: ${e.message}`)
        else await sleep(2000 * (attempt + 1))
      }
    }
    if (!html) continue
    const ids = [...new Set([...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1]))].slice(
      0,
      6,
    )
    for (const id of ids) {
      try {
        const o = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
        )
        if (!o.ok) continue
        const meta = await o.json()
        const score = scoreYouTubeTitle(meta.title, artistNames, trackTitle)
        if (!best || score > best.score) {
          best = { url: `https://www.youtube.com/watch?v=${id}`, title: meta.title, score }
        }
        if (score >= 5) return best
      } catch {
        /* next id */
      }
    }
    await sleep(400)
  }
  return best?.score >= 2 ? best : best
}

function buildNote(release, track, lang) {
  const label = release.labels?.[0]
  const pos = (track.position || '').trim()
  const cat = label?.catno || ''
  const yr = release.year || '?'
  const labelName = label?.name || 'release'
  const side = pos ? (lang === 'es' ? `Cara ${pos}` : `Side ${pos}`) : ''
  const { title, mix_name } = splitTitleMix(track.title)
  const mixBit = mix_name ? ` (${mix_name})` : ''
  if (lang === 'es') {
    return side
      ? `${side} del release ${labelName} ${cat} (${yr}) — ${title}${mixBit}.`
      : `${title}${mixBit} en ${labelName} ${cat} (${yr}).`
  }
  return side
    ? `${side} on ${labelName} ${cat} (${yr}) — ${title}${mixBit}.`
    : `${title}${mixBit} on ${labelName} ${cat} (${yr}).`
}

function buildVinylRow(release, track, sortOrder, youtubeUrl) {
  const { title, mix_name } = splitTitleMix(track.title)
  const label = release.labels?.[0]
  return {
    sort_order: sortOrder,
    title,
    mix_name,
    artists: artistsFromRelease(release, track),
    label: (label?.name || '').trim(),
    catalog_number: (label?.catno || '').trim(),
    year: Number(release.year) || null,
    format: formatString(release),
    discogs_url: publicReleaseUrl(release),
    youtube_url: youtubeUrl || '',
    artwork_url: pickDiscogsArtwork(release),
    note_en: buildNote(release, track, 'en'),
    note_es: buildNote(release, track, 'es'),
  }
}

async function pickVinylReleaseForMaster(masterId) {
  const versions = await discogsFetch(`/masters/${masterId}/versions?per_page=100`)
  const list = (versions.versions || []).filter((v) => /vinyl|12/i.test(v.format || ''))
  list.sort((a, b) => (b.community?.have || 0) - (a.community?.have || 0))
  const pick = list[0]
  if (!pick) throw new Error(`Master ${masterId}: sin vinilo`)
  return discogsFetch(`/releases/${pick.id}`)
}

async function processReleaseTracks(release, opts, sortRef, out, seenKeys) {
  const tracks = (release.tracklist || []).filter((t) => t.type_ === 'track' || !t.type_)
  const discogsUrl = publicReleaseUrl(release)
  console.log(`\n→ ${release.title} (${discogsUrl}) — ${tracks.length} pista(s)`)

  for (const track of tracks) {
    if (opts.limit != null && out.length >= opts.limit) return
    if (!(track.title || '').trim()) continue
    const { title, mix_name } = splitTitleMix(track.title)
    const trackArtists = artistsFromRelease(release, track)
    const k = trackKey(null, title, mix_name, trackArtists)
    if (seenKeys.has(k)) continue

    const artistNames = trackArtists.map((a) => a.name)
    let youtube = ''
    if (!opts.noYoutube) {
      try {
        const hit = await searchYouTubeBest(artistNames, track.title)
        youtube = hit?.url || ''
        if (hit?.title) {
          console.log(`  ✓ ${track.position || '?'} ${track.title}`)
          console.log(`    YouTube: ${hit.title}`)
        } else {
          console.log(`  ✗ ${track.position || '?'} ${track.title} — sin YouTube`)
        }
      } catch (e) {
        console.warn(`  ⚠ ${track.title}: ${e.message}`)
      }
      await sleep(600)
    }

    if (!youtube && !opts.allowNoYoutube && !opts.noYoutube) continue

    out.push(buildVinylRow(release, track, sortRef.v++, youtube))
    seenKeys.add(k)
  }
}

async function tracksFromMaster(masterId, opts, seenKeys) {
  const release = await pickVinylReleaseForMaster(masterId)
  const out = []
  const sortRef = { v: 1 }
  await processReleaseTracks(release, opts, sortRef, out, seenKeys)
  return out
}

async function backfillArtworkInFile(outPath) {
  if (!existsSync(outPath)) throw new Error(`No existe: ${outPath}`)
  const data = JSON.parse(readFileSync(outPath, 'utf8'))
  const releaseCache = new Map()
  let filled = 0
  for (const row of data.vinyl || []) {
    if ((row.artwork_url || '').trim()) continue
    const m = String(row.discogs_url || '').match(/\/release\/(\d+)/)
    if (!m) continue
    const id = m[1]
    if (!releaseCache.has(id)) {
      try {
        releaseCache.set(id, await discogsFetch(`/releases/${id}`))
      } catch (e) {
        console.warn(`  ⚠ release ${id}: ${e.message}`)
        releaseCache.set(id, null)
      }
    }
    const release = releaseCache.get(id)
    if (!release) continue
    const art = pickDiscogsArtwork(release)
    if (art) {
      row.artwork_url = art
      filled++
    }
  }
  writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log(`Backfill artwork: ${filled} fila(s) actualizadas en ${outPath}`)
  return data
}

async function tracksFromLabel(labelId, opts, seenKeys) {
  const out = []
  const sortRef = { v: 1 }
  const seenMasters = new Set()
  let page = 1

  while (opts.limit == null || out.length < opts.limit) {
    const data = await discogsFetch(`/labels/${labelId}/releases?page=${page}&per_page=100`)
    const releases = data.releases || []
    if (!releases.length) break

    console.log(`\nPágina ${page}/${data.pagination?.pages || '?'} (${releases.length} releases)`)

    for (const brief of releases) {
      if (opts.limit != null && out.length >= opts.limit) break
      if (!isVinylBrief(brief)) continue

      const masterKey = brief.master_id ? `m:${brief.master_id}` : `r:${brief.id}`
      if (seenMasters.has(masterKey)) continue

      let release
      try {
        release = await discogsFetch(`/releases/${brief.id}`)
      } catch (e) {
        console.warn(`  ⚠ release ${brief.id}: ${e.message}`)
        continue
      }
      if (!isVinylRelease(release)) continue

      seenMasters.add(masterKey)
      await processReleaseTracks(release, opts, sortRef, out, seenKeys)
    }

    if (!data.pagination?.urls?.next) break
    page++
  }
  return out
}

function mergeVinyl(existing, incoming) {
  const keys = new Set((existing || []).map((r) => trackKey(null, r.title, r.mix_name, r.artists)))
  const merged = [...(existing || [])]
  let nextSort = merged.reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), 0) + 1
  for (const row of incoming) {
    const k = trackKey(null, row.title, row.mix_name, row.artists)
    if (keys.has(k)) continue
    merged.push({ ...row, sort_order: nextSort++ })
    keys.add(k)
  }
  return merged
}

async function main() {
  const opts = parseArgs(process.argv)
  const seenKeys = new Set()
  if (opts.merge) {
    const outPath = join(ROOT, 'data', 'charts', 'vinyl', `${opts.week}.json`)
    if (existsSync(outPath)) {
      const prev = JSON.parse(readFileSync(outPath, 'utf8'))
      for (const r of prev.vinyl || []) seenKeys.add(trackKey(null, r.title, r.mix_name, r.artists))
    }
  }

  let vinyl = []
  const outPath = join(ROOT, 'data', 'charts', 'vinyl', `${opts.week}.json`)

  if (opts.backfillArtwork) {
    if (!opts.write) {
      console.error('--backfill-artwork requiere --write')
      process.exit(1)
    }
    await backfillArtworkInFile(outPath)
    if (opts.apply) {
      const rel = `data/charts/vinyl/${opts.week}.json`
      const r = spawnSync(process.execPath, ['scripts/chart-vinyl-upsert.mjs', rel], {
        cwd: ROOT,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0',
        },
      })
      if (r.status !== 0) process.exit(r.status || 1)
    }
    return
  }

  if (opts.master) {
    const id = discogsIdFromArg(opts.master, 'master')
    console.log(`Master Discogs ${id}`)
    vinyl = await tracksFromMaster(id, opts, seenKeys)
  } else {
    const id = discogsIdFromArg(opts.label, 'label')
    console.log(`Label Discogs ${id} — recorriendo releases vinilo, buscando YouTube…`)
    vinyl = await tracksFromLabel(id, opts, seenKeys)
  }

  console.log(`\n═══ ${vinyl.length} pista(s) nuevas con metadatos (+ YouTube cuando hubo match)`)

  let payload = { week_date: opts.week, vinyl }

  if (opts.merge && existsSync(outPath)) {
    const prev = JSON.parse(readFileSync(outPath, 'utf8'))
    payload.vinyl = mergeVinyl(prev.vinyl, vinyl)
    console.log(`Merge → ${payload.vinyl.length} pistas totales`)
  }

  if (opts.write) {
    writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
    console.log(`Escrito ${outPath}`)
  } else {
    console.log(JSON.stringify(payload, null, 2))
  }

  if (opts.apply) {
    const rel = `data/charts/vinyl/${opts.week}.json`
    const extra = ['--create-edition-if-missing']
    const r = spawnSync(process.execPath, ['scripts/chart-vinyl-upsert.mjs', rel, ...extra], {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0',
      },
    })
    if (r.status !== 0) process.exit(r.status || 1)
  }
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
