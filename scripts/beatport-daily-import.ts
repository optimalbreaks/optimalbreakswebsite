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
  const { madridHour, runBeatportGenreImport } = await import('../src/lib/beatport-genre-import')
  const force = process.argv.includes('--force')
  const sinceArg = process.argv.find((a) => a.startsWith('--artist-since='))
  const artistSince = sinceArg?.split('=')[1]
  if (!force && madridHour() !== 12) {
    console.log('Fuera de las 12:00–12:59 en Madrid. El pase es a las 12:05. Usa --force para lanzarlo igual.')
    return
  }
  const result = await runBeatportGenreImport({
    trigger: force ? 'manual' : 'cron',
    ...(artistSince ? { artistSince } : {}),
  })
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(1)
}

main()
