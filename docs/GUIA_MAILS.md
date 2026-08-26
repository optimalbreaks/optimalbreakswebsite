# Guía de correos — campañas y Auth

Punto de partida para **cualquier mail que mandemos** desde Optimal Breaks. Dos canales distintos; no mezclarlos.

| Canal | Quién envía | Para qué | Dónde vive |
|--------|-------------|----------|------------|
| **Auth** | Supabase (plantillas del dashboard; SMTP propio opcional) | Confirmar cuenta, recuperar contraseña, magic link, invite | [`mailing/supabase/`](../mailing/supabase/) + [`mailing/supabase/README.md`](../mailing/supabase/README.md) |
| **Campaña / producto** | Script local + **SMTP OVH** (`contacto@optimalbreaks.com`) | Avisos puntuales a usuarios registrados (Mis Tracks, bookings, etc.) | [`scripts/enviar-campana-mail.mjs`](../scripts/enviar-campana-mail.mjs) + HTML de salida en [`mailing/`](../mailing/) |

**No hay** Resend, Mailchimp ni panel de campañas. Con ~40 cuentas no hace falta. Un envío masivo = el script, **uno a uno**, tras un `--test` que solo vea `contacto@`.

---

## 1. SMTP (OVH)

Credenciales **solo** en `.env.local` (nunca `NEXT_PUBLIC_`, nunca Git). Plantilla: [`.env.local.example`](../.env.local.example).

```
SMTP_HOST=ssl0.ovh.net
SMTP_PORT=465
SMTP_SECURE=1
SMTP_USER=contacto@optimalbreaks.com
SMTP_PASS=
SMTP_FROM=Optimal Breaks <contacto@optimalbreaks.com>
```

- Host/puerto oficiales OVH Europa: `ssl0.ovh.net` **o** `smtp.mail.ovh.net`, **465 SSL**.
- En redes con inspección TLS (Acttax): `NODE_TLS_REJECT_UNAUTHORIZED=0` solo en esa sesión PowerShell, igual que el resto de scripts.
- `From:` = la misma cuenta OVH. No inventar otro remitente (acaba en spam o rechazo).
- Desactivar **tracking de enlaces** del proveedor si se usa el mismo SMTP en Supabase Auth: reescribe URLs y rompe `token_hash`.

Dependencia: **`nodemailer`** (dev). El script no corre en Vercel.

---

## 2. Cómo se manda (invariantes)

Script: `scripts/enviar-campana-mail.mjs` · npm: `npm run mail:campaign`.

| Flag | Qué hace |
|------|----------|
| `--dry-run` | Lista audiencia + escribe HTML. **Cero envíos.** |
| *(sin flag = `--test`)* | Manda **un** correo a `SMTP_USER` con barra **BORRADOR**. |
| `--send` | Uno a uno a la audiencia. **Solo cuando el editor lo pida explícitamente.** |

Reglas que no se negocian:

1. **Nunca** `--send` en el mismo turno en que se diseña. Primero `--test` a `contacto@`, el editor mira Outlook/Gmail, luego «mándalo».
2. **Uno a uno**, no CCO. Pausa **1,5 s** (`SEND_GAP_MS`) entre envíos (OVH y spam).
3. **Solo emails confirmados** (`email_confirmed_at`). Sin confirmar = no hay destinatario.
4. **Excluir** `SMTP_USER`, `contacto@optimalbreaks.com`, `contacto@eskaladigital.com`.
5. Saludo y cifras **por persona** (`display_name` / primer nombre + recuento suyo). El resto del HTML (listas, portadas) se reutiliza.
6. Pie: aviso de producto, no newsletter. Baja en un clic (`mailto:contacto@…?subject=Baja`) + cabecera `List-Unsubscribe`.
7. **No destapar vergüenzas de la comunidad:** no decir cuántos usuarios sostienen el Top, ni «el nº 1 tiene 7 votos». Sí se puede decir **cuántos ha guardado esa persona** y una referencia suave a «unas 50» como perfil que usa la lista.

Primera campaña (26 ago 2026): **Mis Tracks / Top 100**. Audiencia = confirmados con **&lt; 100** canciones únicas. 35 enviados, 0 fallos; 7 sin confirmar fuera; editorial fuera.

---

## 3. Diseño (reutilizar)

Estética **fanzine / papel**: misma paleta que Auth y firmas (`mailing/firma-v11-outlook-native.html`, `mailing/supabase/01-confirm-sign-up.html`).

| Token | Hex | Uso |
|-------|-----|-----|
| Papel de fondo | `#d4c9b8` | `body` |
| Tarjeta | `#e8dcc8` | Bloque principal |
| Tinta | `#1a1a1a` | Bordes 3–4 px, cabeceras |
| Rojo OB | `#d62828` | Marca, botones `+` |
| Amarillo cinta | `#f7e733` | Franja, número de ranking |
| Texto secundario | `#4a4238` | Metadatos |

**Outlook-first:** tablas `role="presentation"`, estilos **inline**, sin flex/grid, sin `rgba` en fondos de bloque (Outlook los tira). Ancho **600 px**. Franja superior negra/amarilla a celdas, no CSS `repeating-linear`. Botón = `td` con `bgcolor` + `<a>` con padding (no `border-radius`).

**Estructura de una campaña tipo:**

1. Franja advertencia + cinta amarilla.
2. Marca `OPTIMAL` + `BREAKS` en rojo.
3. **Selector de idioma** (barra negra: `Español · English` → anclas `#mail-es` / `#mail-en`). No es un toggle: el correo no ejecuta JS. En Gmail/Outlook el ancla **a veces** no salta; por eso los **dos** textos van uno debajo del otro (ES primero, EN en fondo `#ddd3c2`).
4. Cuerpo: 2 párrafos por idioma. Tono de **colega cercano**, no marketing ni limosna. Sin «tienes que», sin «herramienta más potente» en bucle.
5. Listas (si aplica): fila con **nº amarillo | portada | título+artistas | botón**.
6. CTA final + pie negro.

HTML de referencia generado: [`mailing/save-tracks-top100.html`](../mailing/save-tracks-top100.html) (se sobrescribe en cada `--test` / `--send`; no editar a mano como fuente de verdad — la fuente es el script).

---

## 4. Portadas e imágenes (Outlook + Beatport)

**Problema:** Beatport (`geo-media.beatport.com`) sirve **WebP**. Outlook de escritorio **no lo pinta** (icono roto). YouTube (`i.ytimg.com`) sí: JPEG.

**Solución de campaña (no negociable para mails con portadas):**

1. Bajar la imagen (URL local `public/` o remota; Beatport/YouTube vía **`/api/og/image-proxy`**).
2. **`sharp`** → JPEG cuadrado (p. ej. 128 / 96 px, quality ~82).
3. Incrustar como **CID** (`cid:ob-t1@optimalbreaks.com`) en `nodemailer` `attachments` (`contentDisposition: 'inline'`).
4. En el HTML del correo: `<img src="cid:…">`. En el HTML de disco (preview): `data:image/jpeg;base64,…`.

**Prohibido** en el mail: `<img src="https://geo-media.beatport.com/…">` o WebP. Tampoco depender de que Outlook descargue el proxy: CID no pide red.

Proxy existente (web / OG): [`src/app/api/og/image-proxy/route.ts`](../src/app/api/og/image-proxy/route.ts) — hosts: Beatport, Discogs, `i.ytimg.com`, `img.youtube.com`. El mail lo usa solo para **bajar** y convertir; el usuario final no lo ve.

---

## 5. Idioma (ES / EN, 50/50)

No hay `preferred_lang` en `profiles`. No adivinar por país ni por `/es` vs `/en` de la última visita.

**Campaña actual:** un solo correo **bilingüe**.

- Asunto corto en los dos: `Tus 10 breaks / Your 10 tracks`.
- Texto ES + texto EN (mismos hechos, no traducción palabra a palabra).
- Listas **una vez** (títulos/artistas ya en inglés de Beatport). Botones `+ / Save`, `Ficha / Page`.
- Enlaces de charts: `/es/…` y `/en/…` en el pie.

**Más adelante (mejor):** columna `profiles.locale` o último idioma de sesión → un idioma por persona y el mail se acorta. Hasta entonces, no mandar dos campañas distintas «por si acaso».

Un **language switcher** de web **no existe** en email. Lo más cercano: anclas `#mail-es` / `#mail-en`. Tratarlas como atajo, no como ocultar el otro idioma.

---

## 6. Enlaces y «guardar desde el mail»

Gmail/Outlook **no pueden** pulsar el `+` de la web. El botón `+ / Save` abre el **deep-link** del tema:

- chart / featured → `https://www.optimalbreaks.com/es/charts?play=chart|featured:<uuid>&week=…`
- vinyl → `…/es/charts?play=vinyl:<uuid>`
- beatport_top → ficha `…/es/artists|labels/<slug>?play=beatport:<id>`

Si el usuario **está logueado**, el `+` está en la fila. Si no, el flujo de login. No prometas «un clic y ya está votado».

Helpers de paths: [`src/lib/share-track.ts`](../src/lib/share-track.ts). Ranking vivo: `GET /api/public/charts/community-monthly?limit=10`.

---

## 7. Audiencia (esta campaña y cómo clonar)

Hoy, en `listAudience()`:

- `profiles` + `auth.admin.listUsers`
- recuento **único** `track_source:track_id` en `saved_chart_tracks` (paginar de 1000)
- entra si: email confirmado, **&lt; `SAVE_CAP` (100)**, no está en `SKIP_EMAILS`

Para la **siguiente** campaña: cambiar el filtro (p. ej. 0 saves, sin login en 30 días, artistas sin claim). No reenviar el mismo HTML a quien ya lo recibió sin un criterio nuevo. Si hace falta no repetir: tabla `mail_sends` (user_id, campaign_id, sent_at) — aún no existe; montarla cuando haya segunda tanda.

Bookings ([`docs/GUIA_IMPLEMENTACION_BOOKINGS.md`](./GUIA_IMPLEMENTACION_BOOKINGS.md) §8): avisos transaccionales y el anuncio de launch **pueden usar este mismo SMTP + diseño**. No montar Resend solo para uno de esos usos. Una bala de «anuncio a toda la base»: no gastarlas en drips.

---

## 8. Nueva campaña (checklist)

1. Copiar funciones de diseño del script (`warnStripe`, `ctaBtn`, `thumbImg`, `sectionHead`, `jpegThumb` + CID). No empezar un HTML suelto en Word.
2. Redactar **ES y EN** (2 párrafos). Tono cercano. Cero cifras de comunidad.
3. Si hay portadas: pipeline JPEG/CID. Probar **Outlook escritorio** (WebP se ve bien en Gmail y engaña).
4. `--dry-run` → revisar lista impresa.
5. `--test` → solo `contacto@optimalbreaks.com`. Asunto con `[BORRADOR]`.
6. El editor dice «mándalo». Entonces `--send`.
7. Anotar en esta guía: fecha, asunto, N enviados, criterio de audiencia, fallos.

En redes Acttax:

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'
npm run mail:campaign -- --dry-run
npm run mail:campaign -- --test
npm run mail:campaign -- --send
```

---

## 9. Qué no es esto

- **No** es el canal de Auth. Las plantillas Go de Supabase (`{{ .TokenHash }}`) no se generan aquí.
- **No** hay cron ni envío desde Vercel.
- **No** secuencias semanales. Cada mail es un producto o un favor puntual.
- Las firmas `mailing/firma-*.html` son para el cliente de correo del editor, no para campañas.

---

## 10. Archivos

| Ruta | Rol |
|------|-----|
| `scripts/enviar-campana-mail.mjs` | Fuente: HTML + audiencia + SMTP |
| `mailing/save-tracks-top100.html` | Último HTML generado (preview) |
| `mailing/supabase/*.html` | Auth (pegar en dashboard) |
| `mailing/firma-*.html` | Firmas Outlook |
| `.env.local` / `.env.local.example` | `SMTP_*` |
| `src/app/api/og/image-proxy/route.ts` | Proxy de portadas (descarga) |
| `src/lib/share-track.ts` | Deep-links `?play=` |

---

*English:* Campaign mail is **local nodemailer + OVH SMTP**, not Supabase Auth. Design = paper/ink tables, bilingual ES then EN with `#mail-es` / `#mail-en` anchors (no JS switcher). Artwork = download → **sharp JPEG → CID** (Beatport WebP breaks Outlook). Always `--test` to `contacto@` before `--send`. Never publish community vote totals. First send: 26 Aug 2026, My Tracks / Top 100, 35 confirmed users with &lt; 100 unique saves.
