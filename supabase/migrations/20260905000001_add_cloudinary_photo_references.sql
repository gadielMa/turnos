-- Las imágenes viven en Cloudinary; Supabase conserva sólo su referencia.
alter table public.soypobre_requests
  add column if not exists photo_url text,
  add column if not exists photo_public_id text;
