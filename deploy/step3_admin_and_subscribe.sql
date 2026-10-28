-- STEP 3 of 3 — You. Run AFTER creating your login in Supabase → Authentication → Users → Add user
-- (email cschlotman@littlejohncapital.com, any password, "auto confirm" on).

insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'cschlotman@littlejohncapital.com'
on conflict (user_id, role) do nothing;

insert into public.subscribers (email, first_name, company, role, firm_type, source, referral_code, unsubscribe_token, sectors)
values ('cschlotman@littlejohncapital.com', 'Carl', 'Littlejohn Capital', 'gp', 'firm', 'editor',
        lower(substr(md5(random()::text), 1, 8)), encode(gen_random_bytes(16), 'hex'),
        array['Industrials','Business Services','Aerospace & Defense'])
on conflict (email) do update set status = 'active', unsubscribed_at = null, first_name = 'Carl', role = 'gp';

-- Verify:
select u.email, r.role from auth.users u join public.user_roles r on r.user_id = u.id;
select email, status, referral_code, sectors from public.subscribers where email = 'cschlotman@littlejohncapital.com';
