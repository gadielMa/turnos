-- Las Edge Functions operan con service_role; el navegador continúa sin acceso
-- directo a estas tablas y recibe sólo los datos filtrados por las funciones.
grant select, insert, update, delete on public.soypobre_requests to service_role;
grant select, insert, update, delete on public.soypobre_donors to service_role;
grant select, insert, update, delete on public.soypobre_donations to service_role;
