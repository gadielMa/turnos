-- El comprobante es un requisito de carga en el navegador, pero no se persiste
-- ni se analiza. Las donaciones históricas conservan sus referencias existentes.
alter table public.soypobre_donations
  alter column receipt_url drop not null;

comment on column public.soypobre_donations.receipt_url is
  'No se usa para nuevas donaciones: los comprobantes no se almacenan ni se procesan.';
