# Imágenes estáticas del sitio (`public/images`)

## Dos reglas simples

### A) El fichero ya está en WebP en el repo

Si ya tienes `algo.webp` en `public/images/...` (lo guardó la IA, un export previo, etc.):

- En `image_url` (y en código) usa **exactamente** esa ruta pública: `/images/.../algo.webp`, **tal como está el nombre y la carpeta**.
- No hace falta convertir nada.

### B) Subes tú un JPG, PNG, etc. a `public/` para usarlo en el sitio

1. Convierte a WebP y borra el original:

   ```bash
   npm run images:to-webp -- public/images/artists/mi-foto.jpg
   ```

2. Referencia **solo** el `.webp` resultante en JSON y en Supabase (y ejecuta el UPSERT que corresponda).

## Cómo convertir (solo caso B)

Varios archivos:

```bash
npm run images:to-webp -- public/images/artists/a.jpg public/images/events/cartel.png
```

El script crea `mismo-nombre.webp` junto al original y **elimina** el JPG/PNG.

## Convención de nombres

- Preferir minúsculas y guiones coherentes por carpeta. Si ya hay un nombre fijado (`Anuschka.webp`), no cambiarlo sin actualizar JSON y BD.
- La URL pública es `/images/...` = lo que hay bajo `public/images/...`.

## Qué no hacer

- No poner en `image_url` una extensión distinta de la del archivo que realmente sirves (si en disco es `.webp`, el enlace es `.webp`).
- No dejar JPG/PNG versionados para carteles/retratos cuando el flujo acordado es WebP (caso B).

## Raíz de `public/images/` (logos, OG, etc.)

Pueden seguir PNG/JPEG si una herramienta o red social lo exige; eso no aplica al mismo criterio que `artists/` y `events/` para contenido editorial.
