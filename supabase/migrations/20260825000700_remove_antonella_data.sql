-- Antonella Morselli requested removal from the live platform. This makes the
-- profile unavailable to the public site and administration without destroying
-- historical bookings or client data.
update public.businesses
set status = 'cancelled'
where slug in ('antonella', 'antonella-morselli');
