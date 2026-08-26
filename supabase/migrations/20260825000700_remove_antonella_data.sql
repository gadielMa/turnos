-- Remove the legacy business from the live platform while preserving historical
-- data in environments where it still exists.
update public.businesses
set status = 'cancelled'
where slug = 'legacy-business';
