/**
 * Mismo pase que el cron de las 12:05 (Madrid).
 *   npx tsx scripts/beatport-daily-import.ts
 *   npx tsx scripts/beatport-daily-import.ts --force
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
  const { hasOkImportRunToday, madridHour, runBeatportGenreImport } = await import('../src/lib/beatport-genre-import')
  const force = process.argv.includes('--force')
  const sinceArg = process.argv.find((a) => a.startsWith('--artist-since='))
  const artistSince = sinceArg?.split('=')[1]
  // GitHub retrasa el cron (el 9 oct el de las 11:05 UTC arrancó a las 19:25).
  // Si ya no son las 12 y hoy no hay pase correcto, se lanza igual: si no, el día se pierde.
  // La otra hora UTC (verano/invierno) no repite el pase cuando el de las 12 ya terminó.
  if (!force && madridHour() !== 12) {
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
  })
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(1)
}

main()
