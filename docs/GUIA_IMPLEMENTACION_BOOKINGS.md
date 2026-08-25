# Guía de implementación — Artistas verificados + Solicitudes de booking

> **Estado: IMPLEMENTADO (MVP, agosto 2026).** El sistema está construido según esta guía.
> Este documento se conserva como especificación de referencia.
>
> **Piezas entregadas:**
> - **Migración** `supabase/migrations/068_artist_claims_bookings.sql` — tablas `artist_claims`,
>   `booking_requests`, `booking_sender_bans` + columnas `artists.claimed_by` / `artists.accepts_bookings`,
>   índices anti-abuso y RLS.
> - **Migración** `supabase/migrations/069_artist_claims_contact.sql` — columnas
>   `artist_claims.contact_phone` (obligatorio en la API) y `artist_claims.contact_email` (opcional),
>   para verificar la identidad por llamada.
> - **Migración** `supabase/migrations/070_editorial_artist_marks.sql` — fichaje editorial
>   (fase 2 del Top de artistas: no auto-voto). **No** es un claim y **no** abre bookings.
>   Ver `docs/USER_ENGAGEMENT.md` (*Three account levels*).
> - **Tipos** en `src/types/database.ts` (`ArtistClaimRow`, `BookingRequestRow`, `BookingSenderBanRow`,
>   columnas nuevas de `Artist`) y constantes compartidas en `src/lib/bookings.ts`.
> - **APIs**: `api/artist-claims` (+`[id]`), `api/booking-requests` (+`[id]`),
>   `api/artist-bookings/settings`, `api/admin/claims`, `api/admin/bookings` (listado + ban).
> - **UI usuario**: check "Soy artista" en el registro (`LoginForm`), pestaña **Artista** en Mi cuenta
>   (`components/user/ArtistSection.tsx` + `mi-cuenta/artista`), con reclamación de ficha (pidiendo
>   **teléfono de contacto obligatorio** + email prefijado con el de la cuenta), estado de
>   verificación, toggle de recepción, bandeja de bookings y solicitudes enviadas.
> - **UI pública**: `components/BookingRequestButton.tsx` en la ficha de artista (solo si
>   `accepts_bookings = TRUE`; `claimed_by` nunca llega al cliente).
> - **Admin**: `/administrator/claims` (muestra teléfono `tel:` pulsable y email de contacto de cada
>   reclamación) y `/administrator/bookings` + enlaces en el sidebar.
>
> **Desviaciones respecto al diseño original:**
> - El ban de remitentes (§2.21) vive en su **propia tabla** `booking_sender_bans`, no en una columna
>   `profiles.booking_banned`. Motivo: la política existente *"Users update own profile"* permitiría a
>   un usuario auto-desbanearse. La tabla no tiene políticas RLS (solo service role) y el ban se
>   comprueba en la API del POST de bookings.
> - **Emails transaccionales (§8) NO incluidos** en el MVP (sin proveedor de email decidido). El
>   descubrimiento se apoya en el check de registro + la pestaña Artista siempre visible en Mi cuenta.
> - Decisiones §9 por defecto en el MVP: categorías no reclamables `pioneer`/`uk_legend`; 1 ficha
>   verificada por cuenta; presupuesto por rangos; una fecha opcional; rechazo silencioso.

---

## 1. Qué es (y qué NO es)

**Es:** un puente de trabajo entre la gente que ya está en la base — DJs/productores con ficha
en el catálogo y usuarios/promotores que montan fiestas. El artista **reclama su identidad**
(no su ficha editorial) y a partir de ahí puede **recibir solicitudes de booking** estructuradas.

Tres niveles de cuenta (detalle del ranking en `docs/USER_ENGAGEMENT.md` → *Three account levels*):
usuario normal → **marcado editorial** (no auto-voto en Top artistas, sin bookings) →
**claim aprobado** (mismo skip + puede abrir `accepts_bookings`). El fichaje editorial
**nunca** sustituye a un claim.

**No es:**

- Un CMS para artistas. **La bio y la ficha siguen siendo editoriales** (flujo actual:
  `artists_docs/` → revisión → `run agent --revise` / UPSERT). El artista verificado NO edita nada.
- Un marketplace con tarifas, agenda, contratos ni comisión. Eso sería otro producto.
  Aquí solo se construye el **registro** que haría posible fiscalizarlo/monetizarlo más adelante.
- Una mensajería/chat. Una solicitud de booking es **una fila con ciclo de vida**, no un hilo.
  La negociación real se va a email/teléfono.

---

## 2. Decisiones de producto tomadas (con su porqué)

| # | Decisión | Motivo |
|---|----------|--------|
| 1 | El claim da **solo** derecho a recibir bookings, nunca a editar la ficha | Mantener el tono enciclopédico del archivo; evitar «DM for bookings 🔥» en las bios |
| 2 | La puerta de entrada es el **registro** («¿Eres artista de break?») + el mismo bloque en **Mi cuenta → Perfil** | Descubrible por cualquier artista sin que administración tenga que «detectar» o invitar a nadie; y no señala ninguna ficha concreta como «libre» |
| 3 | **NO** hay línea/CTA «¿Eres X? / Reclama tu perfil» en las fichas públicas | Objeción del usuario: demasiado visible, invita a reclamos oportunistas. Descartado |
| 4 | No existe un «tipo de cuenta artista» en Auth. Sigue siendo `profiles.role = user`; el artista es un **vínculo verificado** `profiles ↔ artists` | Hasta el OK de admin es un usuario normal con un ticket pendiente. Menos superficie de permisos |
| 5 | Verificación **manual por administración** (contacto, foto, videollamada, «te conocemos de la escena») | A la escala de Optimal Breaks es más creíble y barato que OAuth de Beatport/KYC. La verificación humana ES el producto de confianza |
| 6 | Si el artista **no está** en el catálogo: solicitud de alta con URLs (Beatport, YouTube, SoundCloud, Instagram) que **no publica sola** | La solicitud abre el flujo editorial de siempre (`run agent`, Beatport Top 10, foto). Admin decide si merece ficha completa o stub. Protege la barra editorial (nada de DJs con un tema en DistroKid) |
| 7 | El signup se mantiene **corto** (nombre, email, contraseña). El check «soy artista» solo redirige, tras confirmar email, a la sección de Mi cuenta | Un abandono a mitad no deja cuentas a medias; una sola implementación con dos puertas |
| 8 | Botón **SOLICITAR BOOKING** visible para todos en la ficha del artista verificado (y que acepte solicitudes), pero **enviar exige login** | Escaparate público + identidad del remitente, trazabilidad y palanca anti-spam |
| 9 | Formulario **estructurado** (fecha, ciudad/sala, tipo, presupuesto orientativo, mensaje, contacto), no texto libre a pelo | Filtra no-serios, hace las solicitudes comparables y fiscalizables |
| 10 | **Entrega directa** al artista + visibilidad total de admin (no pre-moderación) | La pre-moderación convierte a admin en cuello de botella. Si aparece spam, activar moderación previa es apretar un tornillo, no rediseñar |
| 11 | Admin ve **todo** en `/administrator` → sección Bookings: revisar, intervenir, medir | «Fiscalizar» sale gratis por diseño porque todo pasa por una tabla propia |
| 12 | Pioneros / leyendas / fichas históricas **no reclamables** desde el buscador interno (o cola especial) | Un claim falso de The Prodigy quema la credibilidad del archivo entero |
| 13 | El claim puede ser «este usuario **recibe** las solicitudes de esta ficha» (el DJ, su manager o su agencia), no rígidamente «yo soy el DJ» | Muchos artistas los bookea una agencia (p. ej. Raveart). Evita pelearse con la realidad el día 1 |
| 14 | Transparencia: avisar al enviar que Optimal Breaks puede revisar solicitudes para prevenir abusos | Es correspondencia con datos personales; mejor decirlo que descubrirlo |
| 15 | **NO** se monta un sistema de reservas tipo Booking.com ni gestión de agenda. La unidad es la **solicitud** (el promotor propone, el artista dispone); la bandeja con estados ES la gestión | Un bolo es una negociación (precio según sala/fecha/viaje/cartel), no inventario con confirmación instantánea. Reservas instantáneas sobre algo que se negocia → disponibilidad falsa y precios inflados «por si acaso». El calendario real del artista vive donde ya viva |
| 16 | Único extra «de calendario» permitido: **aviso de colisión** en la bandeja (dos solicitudes el mismo día / ya aceptó una esa fecha) | Sale gratis de la propia tabla `booking_requests`; es señal, no gestión |
| 17 | Descubrimiento para el que pasó de largo en el registro: **tarjeta descartable en el dashboard** («¿Eres DJ o productor? Reclama tu ficha…») durante las primeras semanas de cuenta | Gratis, sin riesgo de spam, y toca al usuario cuando está activo (mejor momento que un email frío) |
| 18 | Emails: **nunca** secuencias ni monotema «¿eres artista?» recurrente. Como mucho: (a) avisos transaccionales de booking, (b) **un** anuncio de lanzamiento a la base existente, (c) **una** bienvenida a nuevos que incluya el gancho de artista entre otras cosas | Puntería: la mayoría de registros son fans; email irrelevante temprano = bajas y marcas de spam que dañan la entregabilidad de los emails que sí importan. LSSI/RGPD: anuncio puntual de nueva funcionalidad del servicio es lo más defendible; siempre con baja en un click y solo a emails confirmados |
| 19 | Orden de lanzamiento: construir → probar con 2-3 artistas de confianza → **entonces** email-anuncio a toda la base | Un email que lleva a un callejón sin salida quema la única bala con los usuarios viejos |
| 20 | El remitente tiene una lista **«Solicitudes enviadas»** en Mi cuenta (solo lectura + cancelar mientras esté en `new`) | Sin ella (y sin email garantizado en el MVP) el promotor envía a un agujero negro: nunca sabría si le aceptaron |
| 21 | Moderación de remitentes: **ban global** (`profiles.booking_banned`), no bloqueos por-artista | Quien abusa con un artista abusará con todos; una tabla de bloqueos por-artista es sobreingeniería para el MVP |
| 22 | `artists` **no** recibe ninguna política de UPDATE para usuarios. El toggle `accepts_bookings` se escribe vía API (verifica sesión + `claimed_by = auth.uid()`) con **service role**, solo esa columna | Abrir UPDATE de `artists` por RLS para una columna es la puerta a algo peor en la tabla editorial |
| 23 | Existe **revocación** de claims (`status = 'revoked'`): claim a `revoked` + `artists.claimed_by = NULL` + `accepts_bookings = FALSE` en la misma transacción | Cuentas comprometidas, managers que dejan de llevar al artista, conflictos: aparece a los 6 meses y hay que tenerlo pensado antes. Al revocar, la ficha vuelve a ser reclamable |
| 24 | **`claimed_by` nunca viaja a superficies públicas** (ni props ni HTML): las páginas públicas gatean el botón con booleanos (`accepts_bookings`) | El UUID ligaría la ficha con la cuenta personal del artista (y con `/u/<id>/tracks`, su colección privada de saves) sin su consentimiento |
| 25 | El **fichaje editorial** (`editorial_artist_marks`) y el **claim** son capas distintas. Marcar a alguien para el Top de artistas **no** escribe `claimed_by` ni `accepts_bookings`. Un claim aprobado **sí** aplica la misma exclusión de auto-voto y **además** desbloquea bookings (interruptor del artista, default off) | Con pocos saves un artista se votaba el catálogo y salía #1. Detectar por nombre/mail es frágil. El editor ficha a quien conoce; bookings solo cuando *él* reclama |

---

## 3. Flujos paso a paso

### 3.1 DJ con ficha en el catálogo (nuevo en la web)

1. Llega a la web (Google, enlace, Charts). Se registra con el check **«Soy artista de break»**
   (o sin él — no es obligatorio para nada).
2. Confirma email (flujo actual de `AuthProvider.signUpWithEmail` → `/auth/confirm`).
3. Aterriza en **Mi cuenta → sección artista**: buscador del catálogo.
4. Se encuentra → «Esta es mi ficha» → solicitud `pending`. Mensaje: *«Pendiente de
   verificación. Te contactaremos.»*
5. Administración contacta (foto / videollamada / conocimiento de escena) y aprueba o rechaza.
6. Aprobado → vínculo `profiles ↔ artists`. En su ficha pública aparece el bloque de booking;
   en Mi cuenta, su bandeja. **Sin permisos de edición.**

### 3.2 DJ sin ficha

Igual hasta el paso 3; no se encuentra → **«No estoy en el catálogo»** → formulario con URLs
(Beatport casi obligatorio si lo tiene, YouTube, SoundCloud, Instagram) → solicitud
`request_new` en la misma cola. Admin decide: ficha completa vía agente editorial, stub mínimo,
o rechazo.

**Aprobar un `request_new` es un acto compuesto** (validado en la API admin): crear/publicar la
ficha por el flujo editorial de siempre y, en el mismo acto, setear `artist_claims.artist_id` +
`status = 'approved'` + `artists.claimed_by`. Sin ficha publicada no se puede aprobar.

### 3.3 Usuario ya registrado (fan) que «se reconoce» artista

**Mi cuenta → Perfil** → bloque **«SOY ARTISTA»** → exactamente la misma sección (buscador /
alta nueva / estado). Misma implementación, segunda puerta.

Estados del bloque:

- **Sin solicitud:** botón «SOY ARTISTA» → abre buscador.
- **Pendiente:** «Solicitud en verificación — te contactaremos» (+ cancelar). No puede crear otra.
- **Verificado:** el bloque se convierte en su rincón de artista: enlace a la ficha pública +
  bandeja de solicitudes.
- **Rechazada:** «No pudimos verificar la solicitud» (redacción por decidir).

### 3.4 Solicitante de booking (promotor / usuario)

1. En la ficha de un artista verificado y abierto a booking: botón **SOLICITAR BOOKING**
   (visible logueado o no).
2. Sin sesión → login/registro con retorno a la ficha (patrón existente de favoritos).
3. Formulario estructurado → fila en `booking_requests`, estado `new`.
4. El artista recibe: aviso por email («tienes una solicitud nueva» — sin el contenido entero,
   para que la bandeja siga siendo el registro) + la fila en su bandeja de Mi cuenta.
5. El artista marca leída / respondida / aceptada / rechazada / cerrada. La negociación fina
   sigue por email/teléfono (contacto incluido en la solicitud).
6. La bandeja marca **colisiones de fecha** (decisión §2.16): si ya hay una solicitud aceptada
   para ese día, o dos pendientes el mismo fin de semana, se señala en la fila. Consulta sobre
   la propia tabla; no hay calendario que mantener.
7. El remitente sigue el estado en **«Solicitudes enviadas»** (Mi cuenta, decisión §2.20):
   fecha, artista, estado y el detalle de lo que envió. Solo lectura + cancelar mientras esté
   en `new`.
8. **Qué ve el artista del remitente:** `display_name` + los datos de contacto que el propio
   formulario pide (email/teléfono). No el username ni enlace al perfil público del remitente:
   lo que va en la solicitud es lo que se comparte.

### 3.5 Administración

- `/administrator` → **Claims**: cola de verificación (claim de ficha existente + solicitudes
  de alta nueva), con datos de contacto y URLs aportadas. Aprobar / rechazar / notas internas.
- `/administrator` → **Bookings**: todas las solicitudes; filtros por artista, estado, fecha,
  remitente. Acciones: ocultar solicitud (`hidden_by_admin`), ban global del remitente
  (`profiles.booking_banned`, decisión §2.21). Métricas (demanda por artista, tasa de
  respuesta) para lo editorial y para un posible modelo de negocio futuro.

---

## 4. Modelo de datos propuesto (borrador)

> Siguiente número de migración libre a fecha del documento: **068**.

### 4.1 `artist_claims`

```sql
CREATE TABLE public.artist_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('claim_existing', 'request_new')),
  -- claim_existing:
  artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  -- request_new (URLs aportadas por el solicitante):
  proposed_name TEXT,
  beatport_url TEXT,
  youtube_url TEXT,
  soundcloud_url TEXT,
  instagram_url TEXT,
  message TEXT DEFAULT '',
  -- datos de contacto para la verificación por llamada (migración 069):
  contact_phone TEXT DEFAULT '',   -- obligatorio en la API
  contact_email TEXT DEFAULT '',   -- opcional (si difiere del email de la cuenta)
  -- relación con la ficha: 'artist' (soy yo) | 'manager' | 'agency'
  relationship TEXT NOT NULL DEFAULT 'artist',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'revoked')),
  admin_notes TEXT DEFAULT '',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id)
);

-- Una sola solicitud pendiente por usuario
CREATE UNIQUE INDEX uniq_pending_claim_per_user
  ON public.artist_claims(user_id) WHERE status = 'pending';
-- Una ficha no puede estar reclamada-aprobada por dos cuentas
CREATE UNIQUE INDEX uniq_approved_claim_per_artist
  ON public.artist_claims(artist_id) WHERE status = 'approved';
```

- **Revocación (decisión §2.23):** acción de admin en `/administrator/claims`. En la misma
  transacción: claim → `revoked`, `artists.claimed_by = NULL`, `accepts_bookings = FALSE`.
  Las solicitudes en curso **se quedan como están** (historial); dejan de ser visibles para el
  ex-vinculado porque su RLS filtra por `claimed_by`, que ya no apunta a él. Al no quedar
  `approved`, el índice permite que la ficha vuelva a reclamarse.
- **Claims huérfanos:** un `approved` cuyo `artist_id` quedó NULL (ficha borrada, FK `SET
  NULL`) se trata como `revoked` de facto. No es expresable como CHECK con esa FK; se
  documenta y punto.

### 4.2 Vínculo y flag en `artists`

```sql
ALTER TABLE public.artists
  ADD COLUMN claimed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN accepts_bookings BOOLEAN NOT NULL DEFAULT FALSE;

-- Moderación de remitentes (decisión §2.21): ban global, no por-artista
ALTER TABLE public.profiles
  ADD COLUMN booking_banned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN booking_banned_reason TEXT DEFAULT '';
```

- `claimed_by` se rellena al aprobar el claim (fuente de verdad rápida para las RLS de
  bookings; `artist_claims` guarda el histórico). **Nunca viaja a superficies públicas**
  (decisión §2.24): las páginas públicas gatean el botón con `accepts_bookings`; el UUID solo
  se usa server-side (RLS, APIs). No exponerlo en props ni en HTML.
- `accepts_bookings` lo controla el artista verificado (toggle en su bandeja) — permite
  «pausar» sin perder el vínculo. El botón público solo sale con `accepts_bookings = TRUE`
  (que implica claim aprobado). **Escritura solo vía API con service role** (decisión §2.22):
  la ruta verifica sesión + `claimed_by = auth.uid()` y escribe únicamente esa columna.
  `artists` no recibe políticas de UPDATE para usuarios.
- Qué fichas son reclamables desde el buscador interno: como mínimo excluir
  `category IN ('pioneer', 'uk_legend')` (por depurar; ver §9).

### 4.3 `booking_requests`

```sql
CREATE TABLE public.booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_date DATE,            -- o rango: date_start/date_end, por depurar
  city TEXT NOT NULL,
  venue TEXT DEFAULT '',
  event_type TEXT DEFAULT '', -- club, festival, privado…
  budget_range TEXT DEFAULT '',
  message TEXT NOT NULL,
  contact_email TEXT NOT NULL,  -- prellenado con el email de la cuenta
  contact_phone TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'read', 'replied', 'accepted', 'declined', 'closed')),
  -- Moderación separada del ciclo de vida: ocultar no destruye el estado
  hidden_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
  admin_notes TEXT DEFAULT ''
);

CREATE INDEX idx_booking_requests_artist ON public.booking_requests(artist_id, created_at DESC);
CREATE INDEX idx_booking_requests_sender ON public.booking_requests(sender_id, created_at DESC);
```

### 4.4 RLS (tres vistas de las mismas tablas)

- `artist_claims`: el usuario SELECT/INSERT/UPDATE(cancelar) **solo las suyas**
  (`auth.uid() = user_id`); admin (`profiles.role = 'admin'`) todo. Aprobar/rechazar/revocar:
  solo vía API admin con service role (o política admin explícita).
- `artists`: **ninguna política de UPDATE para usuarios** (decisión §2.22). El toggle
  `accepts_bookings` va por API con service role.
- `booking_requests`:
  - remitente: SELECT de las suyas (`auth.uid() = sender_id`), INSERT con
    `auth.uid() = sender_id`, solo hacia artistas con `accepts_bookings = TRUE` y solo si
    su perfil no tiene `booking_banned = TRUE`. UPDATE limitado a cancelar en `new`.
  - artista: SELECT/UPDATE(status) de las recibidas
    (`artist_id IN (SELECT id FROM artists WHERE claimed_by = auth.uid())`),
    excluyendo `hidden_by_admin = TRUE`.
  - admin: todo (incl. `hidden_by_admin` + `admin_notes`).
- **Anti-abuso mínimo:** una solicitud «viva» (`new`/`read`) por remitente y artista
  (índice parcial único), límite diario por cuenta (constraint o check en la API), y el
  ban global `profiles.booking_banned`.

### 4.5 Tipos

Ampliar `src/types/database.ts`: interfaces `ArtistClaimRow`, `BookingRequestRow`, columnas
nuevas en `Artist` (`claimed_by`, `accepts_bookings`) y en `ProfileRow` (`booking_banned`,
`booking_banned_reason`), y entradas en `Database.public.Tables`.
**Ojo:** seguir el patrón existente — JSONB sin `unknown`, tipos planos que no rompan la
inferencia de `@supabase/supabase-js` (ver nota en `AdminChatJson`).

---

## 5. Superficies de UI (mínimas, reutilizando lo existente)

| Pieza | Dónde | Notas |
|-------|-------|-------|
| Check «Soy artista de break» | `src/app/[lang]/login/LoginForm.tsx` (solo modo `signup`) | No cambia el formulario más que eso. Se persiste como flag (p. ej. en `user_metadata` o query en el redirect post-confirm) para aterrizar en la sección artista |
| Sección artista (buscador / alta / estado) | Nueva subpágina de Mi cuenta (p. ej. `/[lang]/mi-cuenta/artista`), componente en `src/components/user/` | El shell ya existe: `UserSectionShell.tsx`. NO añadir pestaña al nav para todos: se llega desde Perfil y desde el redirect post-signup. Pestaña visible solo si claim aprobado (bandeja) |
| Bloque «SOY ARTISTA» | Sección Perfil existente (`/[lang]/mi-cuenta/perfil`) | Enlace/estado hacia la sección artista |
| Botón SOLICITAR BOOKING + formulario | Ficha pública `src/app/[lang]/artists/[slug]/page.tsx` | Solo si `claimed_by && accepts_bookings`. **Ojo caché:** la ficha usa `createCachedSupabase()` (revalidate 300 s) — el botón tardará ≤5 min en aparecer tras aprobar; aceptable y coherente con el resto de la web. El formulario en sí es client component (modal o bloque), envía a una API route con sesión |
| Bandeja del artista | Dentro de la sección artista de Mi cuenta | Lista de `booking_requests` + cambio de estado + aviso de colisión de fechas + toggle `accepts_bookings` (vía API service role, §2.22) |
| **Solicitudes enviadas** (remitente) | Mi cuenta (subpágina o dentro de la sección de eventos; sin pestaña nueva en el nav) | Solo lectura: fecha, artista, estado, detalle. Cancelar solo mientras esté en `new`. Decisión §2.20 |
| Admin Claims | `/[lang]/administrator/claims` (nueva) | Cola pending, aprobar/rechazar, notas. Al aprobar `request_new`, el alta editorial sigue el flujo actual (agente/manual) y luego se vincula |
| Admin Bookings | `/[lang]/administrator/bookings` (nueva) | Tabla completa, filtros, ocultar (`hidden_by_admin`), ban de remitente (`profiles.booking_banned`). Reutilizar `AdminTable` |
| Emails de aviso | API de creación de booking / resolución de claim | ⚠️ Hoy solo existen los emails de Supabase Auth. Aviso transaccional («tienes una solicitud») requiere proveedor (Resend o similar) — ver §8 (plan de comunicación) y §9.3. MVP degradable: sin email, solo bandeja |
| Tarjeta «¿Eres DJ o productor?» | Dashboard (`OverviewSection` o tarjeta propia) | Descartable (persistir el descarte), visible las primeras semanas de cuenta y solo sin claim. Enlaza a la sección artista. Decisión §2.17 |

**Invariantes del repo que esto debe respetar:** lecturas públicas con `createCachedSupabase()`
(regla `supabase-cache-lecturas-publicas`); las escrituras y lecturas por-usuario con los
clientes actuales con cookies; nada de tocar el middleware.

---

## 6. Lo que NO se construye (todavía)

- Edición de ficha por el artista (nunca, salvo decisión editorial futura).
- Tarifas públicas, calendario/disponibilidad, contratos, pagos, comisión.
- Sistema de reservas tipo Booking.com / gestión de agenda (decisión §2.15). Lo único
  «de calendario»: el aviso de colisión en la bandeja (§2.16) y el toggle `accepts_bookings`.
- Chat/hilos de mensajes. Una solicitud = una fila con estados.
- Secuencias/drips de email «¿eres artista?» (decisión §2.18). Los emails permitidos están
  tasados en §8.
- Pre-moderación de solicitudes (se activa solo si aparece spam real).
- CTA de claim en fichas públicas («¿Eres X?») — descartado explícitamente.
- Claims sobre pioneros/leyendas desde el buscador interno.
- Descubrimiento automático de artistas para invitarles (imposible/innecesario).

---

## 7. Pitch al artista (cómo se lo vendemos)

**No se le vende una herramienta, se le vende demanda.** El argumento «si la gente lo quiere,
ya lo buscan a él» solo vale para la punta de la pirámide (leyendas con agencia), que quedó
fuera del claim. El objetivo es el escalón de abajo: al DJ de la escena actual **no lo buscan,
lo descubren** — en los charts, en los lineups, en el Top 10 de una ficha. Hoy esa demanda
muere en el momento del descubrimiento (el promotor acaba en un DM de Instagram que se pierde).
El sistema cierra el circuito: del «me gusta este tío» al «te quiero el 12 de septiembre» sin
salir de la web.

Argumentos, en orden de fuerza:

1. **Ya te estamos promocionando gratis.** Ficha editorial, charts, Top 10, cross-links con
   eventos = un EPK vivo que él no mantiene y que posiciona en Google. Reclamar solo añade el
   botón. Cero trabajo, cero coste.
2. **Solicitudes serias, no DMs.** El formulario estructurado (fecha, ciudad, presupuesto)
   filtra a los no-serios antes de llegar. Contraste directo con el caos de Instagram.
3. **Sello de verificado.** Que *el archivo de referencia* diga «este es el auténtico y está
   disponible» tiene valor de credibilidad, sobre todo para quien aún no tiene nombre grande.
4. **Un sitio, no cinco.** Su presencia en breaks queda unificada donde la escena ya mira.

Frase de una línea:

> «Tu ficha en Optimal Breaks ya la ven los promotores de la escena. Verifícate y pon un botón
> de booking: las solicitudes te llegan ordenadas, con fecha y presupuesto, a un solo sitio.
> Tú solo respondes. No te pedimos nada — la ficha la seguimos cuidando nosotros.»

Cierre honesto: **no les cuesta nada probarlo.** Si no llega nada, no han perdido nada; si
llega un bolo, el boca a boca entre DJs hace el marketing solo. La métrica que le importa al
artista es *cuántas solicitudes le llegan* — por eso cada hora de desarrollo va a lo que mueve
esa métrica (promotores mirando la web, fichas y charts vivos), no a software de gestión.

---

## 8. Plan de comunicación y lanzamiento

Orden (decisión §2.19): **construir → probar con 2-3 artistas de confianza → anunciar.**

| Canal | Cuándo | Qué | Notas |
|-------|--------|-----|-------|
| **Tarjeta en el dashboard** (in-app, descartable) | Con el MVP | «¿Eres DJ o productor? Reclama tu ficha y recibe solicitudes de booking» — para el que pasó de largo en el registro | Gratis, sin riesgo de spam. Mecanismo principal de re-descubrimiento (§2.17) |
| **Email-anuncio a la base existente** | Tras probar con los primeros artistas | Anuncio de producto, **una sola vez**, redactado para los dos lados: «¿Eres artista? Verifícate. ¿Montas fiestas? Ya puedes contactar a los verificados desde su ficha» | Trabaja captación de oferta Y demanda, y reactiva cuentas dormidas. Aviso puntual de nueva funcionalidad = categoría más defendible LSSI/RGPD. Baja en un click, solo emails confirmados |
| **Bienvenida a nuevos** (drip 2-3 días post-signup) | Opcional, cuando exista el proveedor | Email de bienvenida **general** (charts, guarda tracks… y si eres artista, reclama), nunca monotema «¿eres artista?» | Solo a quienes no marcaron el check en el registro; una vez, nunca recurrente |
| **Avisos transaccionales** | Con el MVP idealmente | «Tienes una solicitud nueva» (sin el contenido entero: la bandeja es el registro) | El más importante de los cuatro; sin él la utilidad para el artista baja mucho |

Infraestructura común a los cuatro usos: **un** proveedor transaccional (Resend o similar) +
tabla de envíos (no repetir) + opt-out. Hoy solo existen los emails de Supabase Auth; Supabase
no envía correos arbitrarios. El drip además necesita un programador (cron de Vercel o
`pg_cron`). Decidir el proveedor **dentro del MVP** contando los cuatro usos, no montarlo solo
para uno (ver §9.3).

---

## 9. Preguntas abiertas (para depurar en Ask antes del OK)

1. **Fichas reclamables:** ¿exactamente qué categorías entran? (`current` + `andalusian`
   seguro; ¿`crew`? ¿`us_artist` vivos?). ¿Lista blanca por categoría o flag editorial por ficha?
2. **Multi-ficha / agencias:** ¿una cuenta puede recibir bookings de varias fichas
   (manager/agencia con varios DJs)? El esquema lo permite (varios `approved` del mismo
   `user_id`); ¿se quiere en el MVP o se limita a 1?
3. **Email transaccional:** ¿proveedor (Resend, etc.) dentro del MVP o después? Decidir
   contando los **cuatro usos** de §8 (avisos de booking, anuncio de lanzamiento, bienvenida
   opcional, opt-out común) — no montarlo solo para uno. Sin aviso por email la utilidad para
   el artista baja mucho; sin anuncio, la base vieja no se entera de que existe.
4. **Presupuesto:** ¿campo libre, rangos predefinidos, u opcional? (Recomendado: rangos.)
5. **Fecha del evento:** ¿fecha única o rango `date_start`/`date_end`?
6. **Solicitudes de usuarios «anónimos» de facto:** ¿cualquier cuenta recién creada puede
   enviar, o se exige algo (email confirmado ya es obligatorio; ¿algo más)?
7. **Textos legales:** dónde y cómo se avisa de que admin puede revisar solicitudes
   (¿checkbox en el formulario, línea al pie, página legal?).
8. **Rechazo de claim:** ¿se comunica el motivo o silencio administrativo?
9. **i18n:** todas las cadenas nuevas van a `src/dictionaries/{en,es}.json` — decidir textos.
10. **¿Badge público «Abierto a booking»** en la ficha además del botón, o solo el botón?
11. **Retención de datos:** las solicitudes llevan email y teléfono. Propuesta: anonimizar
    `contact_email`/`contact_phone`/`message` de las `closed`/`declined` a los 12 meses
    (script o `pg_cron`), conservando la fila para métricas. ¿Se acepta y con qué plazo?
12. **Métrica de éxito y cita de revisión:** propuesta: revisar a los 3 meses del lanzamiento
    — p. ej. ≥5 fichas reclamadas y ≥10 solicitudes enviadas = seguir invirtiendo; por debajo,
    congelar y analizar. Fijar los números antes de lanzar para que la decisión no sea vibes.

---

## 10. PROMPT DE IMPLEMENTACIÓN

> Copiar/pegar como punto de partida cuando se dé el OK. Ajustar antes con las respuestas de §9.

```
Implementa el sistema «Artistas verificados + Solicitudes de booking» descrito en
docs/GUIA_IMPLEMENTACION_BOOKINGS.md. Léelo entero antes de tocar nada y respeta sus
decisiones (§2), sus exclusiones (§6) y las reglas del repo (.cursor/rules), en especial
supabase-cache-lecturas-publicas y base-de-datos-sin-dejar-trabajo-al-usuario.

ALCANCE (MVP completo, sin extras):

1. MIGRACIÓN SQL (supabase/migrations/068_artist_claims_bookings.sql):
   - Tablas artist_claims (status incluye 'revoked') y booking_requests (status SIN
     'hidden'; columna hidden_by_admin BOOLEAN aparte) según §4. Ajusta si el documento
     tiene respuestas nuevas en §9.
   - Columnas artists.claimed_by y artists.accepts_bookings; profiles.booking_banned
     y profiles.booking_banned_reason.
   - Índices parciales únicos: 1 claim pending por usuario; 1 claim approved por ficha;
     1 booking «vivo» (new/read) por remitente+artista.
   - RLS completa según §4.4: SIN política de UPDATE sobre artists para usuarios; el
     INSERT de bookings exige accepts_bookings = TRUE y remitente sin booking_banned.
     Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS).

2. TIPOS (src/types/database.ts):
   - ArtistClaimRow, BookingRequestRow, columnas nuevas en Artist y en ProfileRow
     (booking_banned, booking_banned_reason), entradas en Database.public.Tables.
     Sigue el patrón existente (sin `unknown` en JSONB, sin romper la inferencia de
     @supabase/supabase-js).

3. API ROUTES (src/app/api/…, con sesión del usuario; service role SOLO donde se indica):
   - POST /api/artist-claims        → crear claim (claim_existing | request_new); valida
                                       1 pending por usuario y categorías reclamables.
   - PATCH /api/artist-claims/[id]  → cancelar (dueño) / aprobar-rechazar-revocar (admin).
                                       Aprobar claim_existing setea artists.claimed_by.
                                       Aprobar request_new EXIGE ficha ya publicada y setea
                                       artist_id + claimed_by en el mismo acto (§3.2).
                                       Revocar (§2.23): claim → revoked + claimed_by = NULL
                                       + accepts_bookings = FALSE, misma transacción.
   - GET  /api/artist-claims        → las mías (usuario) / todas (admin, con filtros).
   - POST /api/booking-requests     → crear (login + artista con accepts_bookings +
                                       remitente sin booking_banned; límites de §4.4).
   - GET  /api/booking-requests     → enviadas (remitente) / recibidas (artista) /
                                       todas (admin).
   - PATCH /api/booking-requests/[id] → cambio de estado (artista sobre las suyas; remitente
                                       solo cancelar en `new`; admin: hidden_by_admin +
                                       admin_notes + booking_banned del remitente).
   - PATCH /api/artist-bookings/settings → toggle accepts_bookings: verifica sesión +
                                       claimed_by = auth.uid() y escribe SOLO esa columna
                                       con service role (§2.22). Sin RLS de UPDATE en artists.

4. UI USUARIO:
   - LoginForm.tsx: en modo signup, check «Soy artista de break» → tras confirmar email,
     aterrizaje en /[lang]/mi-cuenta/artista.
   - Nueva sección /[lang]/mi-cuenta/artista (usa UserSectionShell): buscador del catálogo
     (excluye categorías no reclamables y fichas ya reclamadas), «Esta es mi ficha»,
     «No estoy en el catálogo» (formulario URLs), estado de la solicitud, y si está
     aprobada: bandeja de booking_requests + toggle accepts_bookings.
   - Bandeja: aviso de colisión de fechas (§2.16) — si ya hay una solicitud aceptada para
     ese día u otra pendiente en fechas próximas, marcarlo en la fila. Solo consulta sobre
     booking_requests; NO construir calendario. Del remitente se muestra display_name +
     contacto del formulario; SIN enlace a su perfil público (§3.4.8).
   - «Solicitudes enviadas» (§2.20): lista de solo lectura para el remitente en Mi cuenta
     (fecha, artista, estado, detalle; cancelar solo en `new`). Sin pestaña nueva en el nav.
   - Pestaña en el nav de Mi cuenta SOLO visible con claim aprobado; mientras tanto se
     llega desde Perfil.
   - ProfileSection (mi-cuenta/perfil): bloque «SOY ARTISTA» con estado, enlaza a la sección.
   - Tarjeta descartable en el dashboard (§2.17): «¿Eres DJ o productor? Reclama tu ficha…»,
     visible solo sin claim y con descarte persistido (localStorage o columna en profiles,
     según lo que ya haga el dashboard con avisos similares).

5. UI PÚBLICA (src/app/[lang]/artists/[slug]/page.tsx):
   - Si accepts_bookings = TRUE: botón SOLICITAR BOOKING (estética del sitio, junto a
     FavoriteButton/SeenLiveButton). Client component modal con el formulario estructurado
     (fecha, ciudad, sala, tipo, presupuesto, mensaje, contacto). Sin sesión → redirige a
     /[lang]/login con retorno. Incluye la línea de transparencia (admin puede revisar
     solicitudes).
   - claimed_by NUNCA viaja al cliente (§2.24): ni en props ni en HTML; gatear solo con
     el booleano.
   - NO añadir ningún CTA de claim en la ficha.
   - La página sigue usando createCachedSupabase(); no cambiar el modelo de caché.

6. ADMIN (/[lang]/administrator):
   - /claims: cola con filtros por estado, aprobar/rechazar/revocar con admin_notes; al
     aprobar un request_new dejar claro en la UI que el alta editorial de la ficha se hace
     con el flujo de siempre y luego se vincula (la API lo valida).
   - /bookings: tabla completa (AdminTable), filtros por artista/estado/fecha, acciones
     ocultar (hidden_by_admin), notas y ban del remitente (booking_banned + reason).
   - Enlaces en el sidebar admin.

7. i18n: todas las cadenas nuevas en src/dictionaries/en.json y es.json.

8. DOCUMENTACIÓN: sección nueva en README.md (EN) y README.es.md (ES) + actualizar
   docs/USER_ENGAGEMENT.md (nueva capacidad de usuario) y este documento (estado →
   implementado, con lo que haya cambiado).

FUERA DE ALCANCE (no lo hagas aunque parezca natural): edición de ficha por el artista,
emails (transaccionales, anuncio de lanzamiento, bienvenida) si no hay proveedor decidido
en §9.3, chat, tarifas, calendario/sistema de reservas, comisiones, pre-moderación,
CTA de claim en fichas públicas, secuencias de email «¿eres artista?».

Al terminar: npm run build (o al menos lint + tsc) y aplicar la migración en Supabase como
parte del trabajo (regla base-de-datos-sin-dejar-trabajo-al-usuario), salvo que falten
credenciales — en ese caso, dilo explícitamente.
```

---

*Documento creado el 19-08-2026 a partir de la sesión de diseño en chat; ampliado el mismo día
con el pitch al artista (§7), el plan de comunicación/lanzamiento (§8) y las decisiones 15-19;
endurecido tras revisión fresh-eyes (decisiones 20-24: lista de enviadas, ban global,
toggle vía service role, revocación, `claimed_by` no público; `hidden_by_admin` en vez de
estado `hidden`; preguntas 11-12 de retención y métrica de éxito).
Antes de implementar: resolver §9 y actualizar §10 en consecuencia.*
