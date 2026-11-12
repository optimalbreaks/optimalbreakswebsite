/**
 * Dos pases, los dos cada día.
 *   12:05 Madrid — listado de Breaks (y los enlaces del chat). pg_cron, migración 090.
 *   13:00 Madrid — fichas de los 140 primeros, cualquier género. `--artists-only`.
 *     pg_cron, migración 108. Un tema que sale hoy, sin adelanto, entra hoy.
 * El schedule de GitHub es el repuesto: si llega tarde y el pase de ese tipo no está, entra igual.
 *   npx tsx scripts/beatport-daily-import.ts
 *   npx tsx scripts/beatport-daily-import.ts --force
 *   npx tsx scripts/beatport-daily-import.ts --artists-only
 *   npx tsx scripts/beatport-daily-import.ts --artists
 */
import { existsSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const file of ['.env', '.env.local']) {
  const p = join(root, file)
  if (!existsSync(p)) continue
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

async function main() {
  const { hasOkArtistsRunToday, hasOkImportRunToday, madridHour, runBeatportGenreImport } = await import('../src/lib/beatport-genre-import')
  const force = process.argv.includes('--force')
  const idsArgEarly = process.argv.some((a) => a.startsWith('--artist-ids='))
  const artistsOnly = process.argv.includes('--artists-only') || idsArgEarly
  // `--artists` lee las dos vías ahora (listado y fichas). El cron de las 12:05 no lo pone.
  const artists = process.argv.includes('--artists') ? true : undefined
  const sinceArg = process.argv.find((a) => a.startsWith('--artist-since='))
  const artistSince = sinceArg?.split('=')[1]
  const idsArg = process.argv.find((a) => a.startsWith('--artist-ids='))
  const artistIds = idsArg
    ?.split('=')[1]
    ?.split(/[,;]/)
    .map((id) => id.replace(/\D/g, ''))
    .filter(Boolean)
  const hour = madridHour()

  if (artistsOnly) {
    // 13:00 Madrid. El otro aviso UTC (verano/invierno) no repite las fichas.
    // Si llega antes de la 1, sale sin fila. Si llega tarde y hoy no hay pase de fichas, entra.
    if (!force && hour !== 13) {
      const done = await hasOkArtistsRunToday()
      if (done) {
        console.log('Fuera de la 1 en Madrid y las fichas de hoy ya están leídas. No se repite.')
        return
      }
      if (hour < 13) {
        console.log('Aún no es la 1 en Madrid. Las fichas de los 140 se leen a la 1.')
        return
      }
      console.log('El aviso de las fichas ha llegado tarde y hoy no hay pase de artistas. Se lanza ahora.')
    }
    if (!force && hour === 13 && await hasOkArtistsRunToday()) {
      console.log('Las fichas de hoy ya están leídas. No se repite.')
      return
    }
    const result = await runBeatportGenreImport({
      trigger: force ? 'manual' : 'cron',
      artistsOnly: true,
      ...(artistSince ? { artistSince } : {}),
      ...(artistIds?.length ? { artistIds } : {}),
    })
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exit(1)
    return
  }

  // GitHub retrasa el cron (el 9 oct el de las 11:05 UTC arrancó a las 19:25).
  // Si ya no son las 12 y hoy no hay pase de Breaks, se lanza igual: si no, el día se pierde.
  // La otra hora UTC (verano/invierno) no repite el pase cuando el de las 12 ya terminó.
  // Un pase solo de fichas (13:00) no cuenta como el listado de las 12.
  if (!force && hour !== 12) {
    const done = await hasOkImportRunToday()
    if (done) {
      console.log('Fuera de las 12 en Madrid y el pase de hoy ya está hecho. No se repite.')
      return
    }
    console.log('El horario de GitHub ha llegado fuera de las 12 en Madrid y hoy no hay pase. Se lanza ahora.')
  }
  const result = await runBeatportGenreImport({
    trigger: force ? 'manual' : 'cron',
    ...(artistSince ? { artistSince } : {}),
    ...(artists ? { artists } : {}),
  })
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(1)
}

main()
