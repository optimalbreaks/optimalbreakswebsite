-- Cartel oficial en repo: public/images/events/retro-halloween-2025.jpg
-- (sustituye la ruta anterior raveart_retro_hallowen_2025.jpeg de 013)

UPDATE public.events
SET image_url = '/images/events/retro-halloween-2025.jpg'
WHERE slug = 'raveart-retro-halloween-2025';
