# QA del reproductor — checklist de verificación

El reproductor es una de las piezas más críticas de la web: debe funcionar **igual de bien** desde cualquier superficie, formato y plataforma. Esta checklist cubre **todos** los puntos de "play" y los invariantes que cada uno debe cumplir.

> Contexto: agosto 2026. Se corrigió que el botón de fila con icono `❚❚` **reiniciaba** el tema en vez de pausarlo (`ChartView`, `CommunityMonthlyTop`, `BeatportTopTracks`, `ArtistFeaturedTracks`) y que el `■ STOP` de las tarjetas de mix re-lanzaba en vez de parar (`MixesExplorer`, dashboard). Ver README (EN/ES) → *El Play/Pausa de cada fila es un toggle real*.

## Superficies de reproducción

| # | Superficie | Componente | Motor |
|---|---|---|---|
| 1 | Breaks Vitales (40) | `ChartView` | preview `<audio>` global |
| 2 | New Releases (`/charts`) | `ChartView` | preview global |
| 3 | Top 100 comunidad (`/top100`) | `CommunityMonthlyTop` | preview global |
| 4 | Top 10 Beatport (artista/sello) | `BeatportTopTracks` | preview global |
| 5 | New Releases (ficha artista) | `ArtistFeaturedTracks` | preview global |
| 6 | Mis Tracks | `TracksSection` | preview global |
| 7 | Lista/carrusel artistas | `ArtistShowcase` | preview global |
| 8 | `/mixes` PLAY/STOP (mp3/SoundCloud) | `MixesExplorer.MixPlayButton` | mix global |
| 9 | Dashboard mixes/favoritos | `shared.DashboardMixPlayButton` | mix global |
| 10 | Embeds YouTube | `LazyYouTubeEmbed` | iframe (coordinador) |
| 11 | Embeds SoundCloud visual | `SoundCloudVisualEmbed` | iframe (coordinador) |

## Invariantes (definición de "igual de bien")

- **I1** Play arranca exactamente el tema pulsado.
- **I2** El mismo botón `❚❚`/`STOP` **pausa o para** (nunca reinicia).
- **I3** Reanudar continúa desde la posición exacta (previews).
- **I4** Una sola fuente audible (arrancar en A silencia B, YouTube, SoundCloud, deck y **otra pestaña/PWA**).
- **I5** Persistencia entre rutas (la barra global sigue sonando al navegar).
- **I6** Cola: ⏭/⏮ y auto-avance al terminar; para al final de la lista.
- **I7** Seek (barra de progreso arrastrable + lockscreen).
- **I8** Estado visual sincronizado (icono ▶/❚❚, fila resaltada, contador `n/total`).
- **I9** Media Session / lockscreen (título, carátula, controles) en móvil/PWA.
- **I10** Autoplay bloqueado (deep-link en pestaña nueva) → overlay "toca para escuchar".
- **I11** Miniaturas de YouTube vía proxy propio (no en negro con adblockers). **Verificar en producción.**
- **I12** Formatos: sample mp3, Bandcamp, SoundCloud, YouTube, sample Beatport.

## Matriz por superficie (marcar en cada navegador/plataforma)

Para cada fila 1–11: `Play(I1)` · `Pausa/Stop(I2)` · `Reanudar(I3)` · `⏭/⏮(I6)` · `Auto-avance(I6)` · `Seek(I7)` · `Exclusión(I4)` · `Persiste al navegar(I5)` · `Icono/estado(I8)`.

- [ ] 1 · Breaks Vitales
- [ ] 2 · New Releases (/charts)
- [ ] 3 · Top 100
- [ ] 4 · Top 10 Beatport
- [ ] 5 · New Releases (ficha)
- [ ] 6 · Mis Tracks
- [ ] 7 · Lista/carrusel artistas
- [ ] 8 · /mixes PLAY/STOP
- [ ] 9 · Dashboard mixes
- [ ] 10 · Embeds YouTube (2º clic para)
- [ ] 11 · Embeds SoundCloud (control del widget)

## Exclusión cruzada (I4) — obligatorio

Arrancar en cada tipo de fuente A y comprobar que silencia una fuente activa B ∈ {preview, mix, YouTube, SoundCloud, deck, otra pestaña/ventana PWA}.

- [ ] preview → silencia mix
- [ ] preview → silencia YouTube
- [ ] preview → silencia SoundCloud
- [ ] mix → silencia preview
- [ ] YouTube → silencia preview/mix
- [ ] SoundCloud → silencia preview/mix
- [ ] deck (home) → silencia preview/mix
- [ ] otra pestaña/ventana PWA → silencia la anterior (`BroadcastChannel`)

## Plataformas / entornos

- [ ] Escritorio: **Chrome**
- [ ] Escritorio: **Firefox** (donde se reportó el fallo)
- [ ] Escritorio: **Safari**
- [ ] Escritorio: **Edge**
- [ ] iOS Safari
- [ ] iOS **PWA instalada** (lock/unlock, volver de background, lockscreen)
- [ ] Android Chrome
- [ ] Android **PWA** (notificación media, lockscreen)
- [ ] **Vercel desplegado** (obligatorio para I9 lockscreen e I11 miniaturas)
- [ ] Red con bloqueadores (uBlock / Brave / SSL-inspection) para I11

## Regresión rápida (smoke test de esta sesión)

- [ ] En 1–7: ▶ → el mismo botón `❚❚` **pausa**; volver a pulsar **reanuda desde donde iba** (no reinicia).
- [ ] En 8–9: PLAY → `■ STOP` **detiene** (no reinicia).
- [ ] En 10: vinilo/YouTube → 2º clic **oculta y para** el vídeo.
- [ ] Cruce: sonando un preview de `/charts`, dar play a un mix de `/mixes` → el preview se calla y solo suena el mix (y viceversa).

## Notas de diseño (no son fallos)

- **`/mixes` mp3/SoundCloud (8):** el botón es **STOP** (para y cierra), no pausa/resume — coherente con el `✕` de `MiniMixBar`.
- **SoundCloud visual (11):** el control ▶/❚❚ lo pinta el propio widget de SoundCloud; la tarjeta OB no tiene botón propio sincronizado, pero el coordinador sí lo pausa cuando otra fuente toma el relevo.

## Solo verificable en navegador (no cubierto por revisión de código)

I7 (seek en lockscreen), I9 (Media Session iOS/Android), I10 (overlay de autoplay real), I11 (miniaturas en producción) y la exclusión entre **ventana PWA + pestaña** en un móvil físico.
