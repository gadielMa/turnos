-- Hide the internal Induliru massage business from normal administration and public routes.
-- Its historical bookings are retained and the change can be reversed if needed.
update public.businesses
set status = 'cancelled'
where slug = 'induliru';
