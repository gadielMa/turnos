-- Antonella Morselli explicitly requested permanent removal of her legacy
-- business, operational records and account.
do $$
declare
  removed_business_ids uuid[];
  removed_user_ids uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[])
  into removed_business_ids
  from public.businesses
  where slug in ('antonella', 'antonella-morselli');

  if cardinality(removed_business_ids) > 0 then
    select coalesce(array_agg(distinct user_id), '{}'::uuid[])
    into removed_user_ids
    from public.business_members
    where business_id = any(removed_business_ids);

    delete from public.client_email_sends where business_id = any(removed_business_ids);
    delete from public.clients where business_id = any(removed_business_ids);
    delete from public.bookings where business_id = any(removed_business_ids);
    delete from public.businesses where id = any(removed_business_ids);
    delete from auth.users where id = any(removed_user_ids);
  end if;
end
$$;

delete from auth.users
where lower(email) = 'antonellamorselli23@gmail.com';
