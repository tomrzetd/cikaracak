-- Tiruan minimal skema auth Supabase untuk menguji migrasi di PostgreSQL biasa (bukan untuk produksi).
-- Kolom auth.users/auth.identities mengikuti Supabase agar atur_akun() teruji dengan bentuk tabel yang sama.
create schema if not exists auth;
create extension if not exists pgcrypto;
create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255) unique,
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  confirmation_token varchar(255),
  recovery_token varchar(255),
  email_change_token_new varchar(255),
  email_change varchar(255),
  email_change_token_current varchar(255) default '',
  phone_change text default '',
  phone_change_token varchar(255) default '',
  reauthentication_token varchar(255) default ''
);
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  email text generated always as (lower(identity_data ->> 'email')) stored,
  unique (provider_id, provider)
);
-- Seperti Supabase: membaca klaim lama (request.jwt.claim.sub) atau baru (request.jwt.claims ->> 'sub').
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to authenticated, anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
-- Supabase juga memberi anon hak tabel bawaan; RLS yang harus menahannya. Kita tiru agar ujinya jujur.
alter default privileges in schema public grant select, insert, update, delete on tables to anon;
