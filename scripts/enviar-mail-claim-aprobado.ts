/**
 * Mail transaccional «ficha verificada».
 *
 *   npx tsx scripts/enviar-mail-claim-aprobado.ts
 *       → borrador a contacto@ (barra BORRADOR).
 *   npx tsx scripts/enviar-mail-claim-aprobado.ts --send --user=<uuid>
 *       → al artista (Cc contacto@). Sin barra BORRADOR.
 *
 * SMTP OVH en .env.local. Guía: docs/GUIA_MAILS.md
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  notifyArtistOfClaimApproved,
  renderClaimApprovedHtml,
} from '../src/lib/transactional-mail'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT_HTML = join(ROOT, 'mailing', 'claim-approved.html')

function parseEnvText(text: string) {
  const out: Record<string, string> = {}
  let t0 = text
  if (t0.charCodeAt(0) === 0xfeff) t0 = t0.slice(1)
  for (const line of t0.split('\n')) {
    let t = line.trim()
    if (t.startsWith('export ')) t = t.slice(7).trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

function loadEnvLocal() {
  const p = join(ROOT, '.env.local')
  if (!existsSync(p)) return
  const parsed = parseEnvText(readFileSync(p, 'utf8'))
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] == null || process.env[k] === '') process.env[k] = v
  }
}

function argValue(flag: string, fallback: string) {
  const i = process.argv.indexOf(flag)
  if (i === -1) return fallback
  return process.argv[i + 1] || fallback
}

loadEnvLocal()

const doSend = process.argv.includes('--send')
const artistName = argValue('--name', 'D-Fast Beats')
const artistSlug = argValue('--slug', 'd-fast-beats')
const userId = argValue('--user', '6983497d-d714-4bf8-89ef-d57f3b6fe0fb')

const html = renderClaimApprovedHtml({ artistName, artistSlug, draft: !doSend })
writeFileSync(OUT_HTML, html, 'utf8')
console.log('HTML preview:', OUT_HTML)

notifyArtistOfClaimApproved({
  userId: doSend ? userId : '',
  artistName,
  artistSlug,
  draft: !doSend,
})
  .then(() => {
    if (doSend) console.log('Enviado al artista', userId, '(Cc', process.env.SMTP_USER, ')')
    else console.log('Borrador enviado a', process.env.SMTP_USER)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
