# Documentación del repositorio — índice y auditoría

Mapa de los **Markdown** del proyecto, para saber qué leer primero y qué mantener al día.

---

## Índice de archivos `.md`

| Ubicación | Propósito |
|-----------|-----------|
| **[`README.md`](../README.md)** (raíz) | Documentación técnica **canónica** (inglés): stack, env, auth, Storage, DJ deck, migraciones (tabla parcial), scripts `npm`, estructura de carpetas. |
| **[`README.es.md`](../README.es.md)** | Resumen en **español**: flujo de artistas, auth, GA4, vistas de listado; enlaza al README en inglés para el detalle largo. |
| **[`docs/AI_PROMPTS_AND_AGENTS.md`](./AI_PROMPTS_AND_AGENTS.md)** | Índice de **prompts** (`scripts/prompts/*.txt`), variables OpenAI/SerpAPI, modelo por defecto **por flujo**, rutas API relacionadas. Bilingüe (ES/EN en un solo archivo). |
| **[`docs/ARTIST_AI_AGENT.md`](./ARTIST_AI_AGENT.md)** | Manual del **agente de artistas**: CLI, flags, batch, API admin, UPSERT por REST. Complementa al README; no sustituye la tabla general de prompts (está en `AI_PROMPTS_AND_AGENTS.md`). |
| **[`docs/IMAGES_AND_WEBP.md`](./IMAGES_AND_WEBP.md)** | `displayImageUrl`, `public/images/` vs Supabase Storage, reglas WebP, SEO/OG. |
| **[`docs/USER_ENGAGEMENT.md`](./USER_ENGAGEMENT.md)** | Favoritos, “seen live”, asistencia a eventos, valoraciones; tablas Supabase y componentes. |
| **[`mailing/supabase/README.md`](../mailing/supabase/README.md)** | Plantillas HTML de **correo** para pegar en Supabase Auth (`RedirectTo` + `TokenHash`). |
| **[`public/images/README.md`](../public/images/README.md)** | Convención **operativa** para assets estáticos (WebP, `npm run images:to-webp`). Alineado con la regla de Cursor `imagenes-public-webp`. |

Este archivo (**`docs/README.md`**) es solo índice y auditoría; no duplica procedimientos largos.

---

## Auditoría: ¿sobra? ¿falta?

### Qué no sobra (complementario, no redundante)

- **Dos README de raíz** — `README.md` + `README.es.md` cumplen roles distintos: el inglés es la referencia completa; el español evita repetir páginas de texto y enlaza al inglés.
- **`AI_PROMPTS_AND_AGENTS.md` vs `ARTIST_AI_AGENT.md`** — El primero es **índice transversal** (todos los agentes y `.txt`); el segundo es **profundidad solo en artistas**. La repetición mínima (comandos `npm`, env) es aceptable para quien solo abre un archivo.
- **`IMAGES_AND_WEBP.md` vs `public/images/README.md`** — El de `docs/` explica **código y URLs en BD**; el de `public/images/` es **flujo de archivos en disco**. Conviven bien.

### Duplicación a vigilar (no urgente)

- Comandos **`db:artist`**, **`db:artist:agent`** y variables Supabase aparecen en README, README.es y `ARTIST_AI_AGENT.md`. Si cambia un comando, conviene actualizar **los tres** o al menos README + README.es y dejar el agente como detalle.

### Qué falta o es opcional

- **Tabla de migraciones en `README.md`** — Solo lista hasta **`011_*`** como ejemplo histórico; las migraciones **`012`–`039+`** (charts, mixes, OG, escenas, engagement, lotes) están solo en `supabase/migrations/`. El README principal indica que la tabla es **parcial**; no hace falta duplicar 30+ filas salvo que quieras un changelog de esquema.
- **`CHANGELOG.md`** — No existe; útil si publicas versiones con notas para humanos (opcional).
- **`CONTRIBUTING.md`** — Solo si aceptáis PR externos con convenciones explícitas.
- **Reglas de Cursor** (`.cursor/rules/`) — No están en esta lista: viven aparte y orientan a la IA en el editor.

### Resumen

**No hay que borrar** ningún `.md` actual: el conjunto es razonable para un repo con contenido editorial + Supabase + agentes. El mantenimiento costoso es solo **sincronizar** README/README.es cuando cambien comandos o env; el índice de prompts cuando añadas un `.txt` nuevo.

---

## Cambios recientes documentados en README

- **Audio e idioma:** `DeckAudioProvider` con **`key={lang}`** en `src/app/[lang]/layout.tsx` — al cambiar ES/EN se reinicia la sesión de audio (deck de la home, barra inferior, modo mix).
- **Navbar móvil:** `html`/`body` con `overflow-x` para ancho; **header** sin `overflow-x` para no recortar menús desplegables (cuenta, hamburguesa).
