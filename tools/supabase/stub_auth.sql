-- Tiruan minimal skema auth Supabase untuk menguji migrasi di PostgreSQL biasa (bukan untuk produksi).
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to authenticated, anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
