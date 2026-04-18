#!/usr/bin/env node
/**
 * Rollback de la pasada IA de La Red del Break.
 *
 * La pasada IA metió falsos positivos cruzando países (artistas UK en escenas
 * ES, sellos US en escenas UK, etc.). Este script limpia esas contaminaciones
 * con un filtro objetivo por país y deja `ai_enriched_at = NULL` en las
 * entidades tocadas.
 *
 * Reglas:
 *  - scenes territoriales (country = 'Spain', 'UK', 'USA', ...):
 *    key_artists y key_labels solo pueden contener entidades cuyo country
 *    coincida con el de la escena (case-insensitive, con sinónimos).
 *    Si la escena no tiene country claro (ej. 'Global'), no se filtra.
 *  - labels con country:
 *    key_artists solo puede contener artistas del mismo país.
 *
 * Uso:
 *   node scripts/rollback-red.mjs --dry-run
 *   node scripts/rollback-red.mjs
 *   node scripts/rollback-red.mjs --only scenes
 *   node scripts/rollback-red.mjs --only labels
 */

import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal, supabaseApiCredentials } from './lib/artist-upsert.mjs'

function parseArgs(argv) {
  const out = { dryRun: false, only: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--only') out.only = String(argv[++i] || '').toLowerCase() || null
  }
  return out
}

// Normaliza country a un token comparable (trim, upper, sinónimos).
function normCountry(c) {
  if (!c) return ''
  const s = String(c).trim().toUpperCase()
  const MAP = {
    SPAIN: 'ES',
    ESPAÑA: 'ES',
    'ES': 'ES',
    'ESP': 'ES',
    UK: 'UK',
    'UNITED KINGDOM': 'UK',
    'GREAT BRITAIN': 'UK',
    ENGLAND: 'UK',
    SCOTLAND: 'UK',
    WALES: 'UK',
    GB: 'UK',
    USA: 'US',
    'UNITED STATES': 'US',
    US: 'US',
    AUSTRALIA: 'AU',
    AU: 'AU',
    RUSSIA: 'RU',
    RU: 'RU',
  }
  return MAP[s] || s
}

function normName(n) {
  return String(n || '').trim().toLowerCase()
}

async function main() {
  loadEnvLocal()
  const args = parseArgs(process.argv.slice(2))
  const creds = supabaseApiCredentials()
  if (!creds) throw new Error('Faltan credenciales en .env.local')
  const sb = createClient(creds.url, creds.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(`\n[rollback-red] dry-run=${args.dryRun}  only=${args.only || 'scenes+labels'}`)

  // Catálogo por nombre → país normalizado
  const [aRes, lRes, sRes] = await Promise.all([
    sb.from('artists').select('slug, name, name_display, country'),
    sb.from('labels').select('slug, name, country, key_artists, ai_enriched_at'),
    sb
      .from('scenes')
      .select('id, slug, name_es, name_en, country, key_artists, key_labels, ai_enriched_at'),
  ])
  if (aRes.error || lRes.error || sRes.error) {
    throw new Error(
      `Fetch error: ${aRes.error?.message || lRes.error?.message || sRes.error?.message}`,
    )
  }
  const artists = aRes.data || []
  const labels = lRes.data || []
  const scenes = sRes.data || []

  const artistCountryByName = new Map()
  for (const a of artists) {
    const c = normCountry(a.country)
    if (a.name) artistCountryByName.set(normName(a.name), c)
    if (a.name_display) artistCountryByName.set(normName(a.name_display), c)
  }
  const labelCountryByName = new Map()
  for (const l of labels) {
    const c = normCountry(l.country)
    if (l.name) labelCountryByName.set(normName(l.name), c)
  }

  let sceneUpdates = 0
  let sceneRemoved = 0
  let labelUpdates = 0
  let labelRemoved = 0

  const doScenes = !args.only || args.only === 'scenes'
  const doLabels = !args.only || args.only === 'labels'

  if (doScenes) {
    console.log('\n=== SCENES ===')
    for (const s of scenes) {
      if (!s.ai_enriched_at) continue
      const sceneCountry = normCountry(s.country)
      if (!sceneCountry) {
        console.log(
          `  · ${s.slug}  (country vacío; solo marco ai_enriched_at=NULL, no filtro)`,
        )
        if (!args.dryRun) {
          await sb.from('scenes').update({ ai_enriched_at: null }).eq('id', s.id)
        }
        sceneUpdates++
        continue
      }

      const beforeA = s.key_artists || []
      const beforeL = s.key_labels || []
      const keepA = []
      const dropA = []
      for (const nm of beforeA) {
        const c = artistCountryByName.get(normName(nm))
        if (c === undefined) keepA.push(nm) // nombre no está en catálogo → lo conservo (puede ser legacy)
        else if (c === sceneCountry) keepA.push(nm)
        else dropA.push(nm)
      }
      const keepL = []
      const dropL = []
      for (const nm of beforeL) {
        const c = labelCountryByName.get(normName(nm))
        if (c === undefined) keepL.push(nm)
        else if (c === sceneCountry) keepL.push(nm)
        else dropL.push(nm)
      }
      const changed = dropA.length + dropL.length
      if (changed === 0 && !s.ai_enriched_at) continue
      console.log(
        `  · ${s.slug} [${sceneCountry}]  -${dropA.length} artistas · -${dropL.length} sellos`,
      )
      if (dropA.length) console.log(`      drop artistas: ${dropA.join(' · ')}`)
      if (dropL.length) console.log(`      drop sellos:   ${dropL.join(' · ')}`)
      if (!args.dryRun) {
        await sb
          .from('scenes')
          .update({ key_artists: keepA, key_labels: keepL, ai_enriched_at: null })
          .eq('id', s.id)
      }
      sceneUpdates++
      sceneRemoved += changed
    }
  }

  if (doLabels) {
    console.log('\n=== LABELS ===')
    for (const l of labels) {
      if (!l.ai_enriched_at) continue
      const labelCountry = normCountry(l.country)
      const before = l.key_artists || []

      let keep = before
      let drop = []
      if (labelCountry) {
        keep = []
        for (const nm of before) {
          const c = artistCountryByName.get(normName(nm))
          if (c === undefined) keep.push(nm)
          else if (c === labelCountry) keep.push(nm)
          else drop.push(nm)
        }
      }
      const changed = drop.length
      console.log(
        `  · ${l.slug} [${labelCountry || '—'}]  -${changed} artistas${
          changed ? ` (${drop.slice(0, 8).join(' · ')}${drop.length > 8 ? '…' : ''})` : ''
        }`,
      )
      if (!args.dryRun) {
        const patch = { ai_enriched_at: null }
        if (changed) patch.key_artists = keep
        await sb.from('labels').update(patch).eq('slug', l.slug)
      }
      labelUpdates++
      labelRemoved += changed
    }
  }

  console.log(
    `\n[rollback-red] ✔ fin. scenes tocadas=${sceneUpdates} (−${sceneRemoved}) · labels tocados=${labelUpdates} (−${labelRemoved})`,
  )
}

main().catch((err) => {
  console.error('[rollback-red] FALLO:', err.message || err)
  process.exit(1)
})
