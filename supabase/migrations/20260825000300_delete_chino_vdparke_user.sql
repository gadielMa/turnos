-- Requested removal of this exact test account. Deleting auth.users also cascades
-- to its profile and any associated business memberships.
delete from auth.users
where lower(email) = 'chino.vdparke@hotmail.com';
