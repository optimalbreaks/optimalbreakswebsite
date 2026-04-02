-- Capítulo Andalucía 2015 → presente: resurgimiento, Raveart (promotora en organizations, eventos enlazados) y artistas del archivo.
-- Reordena sort_order para situar este bloque antes de la era digital abierta.

UPDATE public.history_entries SET sort_order = 8 WHERE slug = 'digital-era-revival';

INSERT INTO public.history_entries (slug, title_en, title_es, content_en, content_es, section, year_start, year_end, sort_order)
VALUES (
  'andalusian-revival-raveart',
  'Andalusia: revival, Raveart and the present',
  'Andalucía: resurgimiento, Raveart y el presente',
  $en$
<p>From the mid-2010s, Andalusia has rebuilt a visible break ecosystem: resident DJs, crews, labels and festivals that connect the region’s 1990s memory with UK bass, electro and contemporary breaks — without depending on mass radio as in the golden age.</p>
<p><strong>Raveart</strong> (Seville, documented in this site’s database as active since 2002) anchors much of that continuity: annual <strong>Summer</strong> and <strong>Winter</strong> festivals, <strong>Retro Halloween</strong>, and club cycles such as <strong>We Love Retro</strong> and <strong>Booking &amp; Clubbing</strong> with UK guests like the <strong>Freestylers</strong>, plus the <strong>Raveart Records</strong> label — all wired here via the promoter organization and the events archive.</p>
<p>Artists in this archive — <strong>Cerbero</strong>, <strong>Bubu</strong>, <strong>Javy Groove</strong>, <strong>Yo Speed</strong>, <strong>Fran Break</strong> and others — keep studios and booths in the south. <em>Break Nation</em> (2023) bridges generations; together with Beatport categories, YouTube and Mixcloud, the scene reads as living culture, not only nostalgia.</p>
$en$,
  $es$
<p>Desde mediados de los 2010, Andalucía recupera una presencia clara en el mapa del break: residentes, crews, sellos y festivales que conectan la memoria de los noventa con UK bass, electro y breaks contemporáneos — sin depender de la radio masiva como en la edad de oro.</p>
<p><strong>Raveart</strong> (Sevilla, consta en la base de datos de este sitio como activa desde 2002) articula buena parte de esa continuidad: festivales anuales <strong>Summer</strong> y <strong>Winter</strong>, <strong>Retro Halloween</strong> y ciclos de club como <strong>We Love Retro</strong> y <strong>Booking &amp; Clubbing</strong> con invitados británicos como <strong>Freestylers</strong>, más el sello <strong>Raveart Records</strong> — enlazado aquí como organización promotora y en el archivo de eventos.</p>
<p>Artistas presentes en este archivo — <strong>Cerbero</strong>, <strong>Bubu</strong>, <strong>Javy Groove</strong>, <strong>Yo Speed</strong>, <strong>Fran Break</strong> y otros — mantienen estudio y cabina en el sur. <em>Break Nation</em> (2023) funciona como puente generacional; junto a Beatport, YouTube y Mixcloud, la escena se lee como cultura viva, no solo nostalgia.</p>
$es$,
  'andalusian',
  2015,
  NULL,
  7
)
ON CONFLICT (slug) DO UPDATE SET
  title_en = EXCLUDED.title_en,
  title_es = EXCLUDED.title_es,
  content_en = EXCLUDED.content_en,
  content_es = EXCLUDED.content_es,
  section = EXCLUDED.section,
  year_start = EXCLUDED.year_start,
  year_end = EXCLUDED.year_end,
  sort_order = EXCLUDED.sort_order;
