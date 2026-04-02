# Images, WebP, and URLs (Optimal Breaks)

**EN** — Where images live, how WebP is applied, and common pitfalls.  
**ES** — Resumen al final.

---

## Two sources of images

| Source | Typical use | URL shape |
|--------|-------------|-----------|
| **`public/images/`** | Logos, deck assets, favicon-adjacent files, static marketing images | `/images/foo.webp` (site origin) |
| **Supabase Storage** (`media` bucket) | Artist portraits, event posters, label logos, blog heroes, etc. | `https://<project>.supabase.co/storage/v1/object/public/media/...` |

Entity pages (artists, events, labels, …) read **`image_url` from PostgreSQL**. For **artists**, `image_url` may be a **Storage** `https://` URL or a site path **`/images/artists/<file>.webp`** when the portrait is versioned under **`public/images/artists/`** (see map below).

### Artist portraits: map + `displayArtistImageUrl`

- **`data/artist-public-portrait-map.json`** — maps **`slug` → filename** (e.g. `deekline.webp`) for files in **`public/images/artists/`**. After adding a WebP and an entry, run **`npm run db:artist:sync-public-portraits`** so JSON + Supabase get **`image_url: /images/artists/…`** (optional but keeps DB aligned with the static asset).
- **`src/lib/artist-public-portrait.ts`** — **`displayArtistImageUrl(slug, image_url)`** for listings and artist pages: prefer **remote** `https://` / `http://` from the DB, then the **map** (local `/images/artists/…`), then an **`image_url`** that already starts with **`/images/artists/`**. If nothing valid remains, the UI uses the **punk** thumbnail fallback in **`CardThumbnail`** (not stored as a URL in the database).
- **Automated web photo search** (`npm run db:artist:photo`, **`db:artist:photo:repair`**) **skips** slugs that have an editorial file + map entry (or `image_url` under `/images/artists/`) unless **`--force-rephoto`**. See [**`docs/ARTIST_AI_AGENT.md`**](ARTIST_AI_AGENT.md).

---

## `displayImageUrl()` (`src/lib/image-url.ts`)

`CardThumbnail`, `EventPosterLightbox`, and SEO helpers use **`displayImageUrl(url)`** before rendering or building Open Graph URLs.

**Rules today:**

1. **Local static files** — If the URL path starts with **`/images/`** and ends with `.jpg`, `.jpeg`, or `.png`, the helper rewrites the extension to **`.webp`**. This matches the repo policy: raster assets under `public/images/` were migrated to WebP; old `.png`/`.jpg` paths in code still resolve to the WebP file.

2. **Supabase Storage** — URLs are **not** rewritten. Whatever is stored in `image_url` must be the **real** object path in the bucket. If the DB says `portrait.webp` but only `portrait.jpg` exists in Storage, the image **404s**. If you want WebP from Storage, **upload** a `.webp` object and **update** `image_url` (admin, `db:artist`, or SQL).

3. **Skipped paths** (no rewrite even under `/images/`): paths containing `favicon`, `opengraph`, `og-home`, or ending like `icon-512.png` — kept as explicit raster for icons/OG where we did not standardise on WebP.

4. **External CDNs** (e.g. Unsplash) — Unchanged; we do not force WebP.

---

## SEO / JSON-LD

- **`absoluteOgImage()`** in `src/lib/seo.ts` passes URLs through **`displayImageUrl`**, so relative OG asset paths under `/images/` prefer WebP when applicable.
- Artist **JSON-LD** `image` field uses the normalised URL for consistency.

---

## Upload checklist (Storage)

- Prefer **WebP** for new uploads when you control the file (smaller, good quality).
- After upload, set **`image_url`** to the **exact** public URL of that object (extension included).
- CLI: `npm run media:upload -- ./file.webp media/path/in/bucket.webp` — see main [README.md](../README.md#supabase-storage-media-bucket).

---

## Resumen (ES)

- **`public/images/`**: el código puede sustituir `.jpg`/`.png` por `.webp` automáticamente (`displayImageUrl`).
- **Artistas**: además, **`displayArtistImageUrl`** prioriza URL remota en BD, luego retrato del **mapa** `data/artist-public-portrait-map.json` + `public/images/artists/`, luego ruta local en BD; si no hay imagen, **fallback punk** en la UI. Script de foto por internet **no** toca esos slugs editoriales salvo forzar.
- **Supabase**: la URL en la base debe coincidir con el fichero subido; **no** se inventa `.webp` en el cliente.
- Para WebP en Storage: sube el `.webp` y actualiza `image_url`.

---

## Related files

- `src/lib/image-url.ts` — `displayImageUrl`
- `src/lib/artist-public-portrait.ts` — `displayArtistImageUrl`, map import
- `src/components/CardThumbnail.tsx`
- `src/components/EventPosterLightbox.tsx`
- `src/lib/seo.ts` — `absoluteOgImage`
