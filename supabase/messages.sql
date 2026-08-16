-- Life Management direct messages + private attachments
-- Run this once in Supabase SQL Editor before using Messages attachments.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  updated_at timestamptz not null default now()
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  attachment_path text,
  attachment_name text,
  attachment_type text,
  attachment_size bigint,
  constraint direct_messages_has_content check (char_length(trim(body)) > 0 or attachment_path is not null)
);

alter table public.direct_messages drop constraint if exists direct_messages_body_check;
alter table public.direct_messages add column if not exists attachment_path text;
alter table public.direct_messages add column if not exists attachment_name text;
alter table public.direct_messages add column if not exists attachment_type text;
alter table public.direct_messages add column if not exists attachment_size bigint;


-- Keep every registered Supabase account discoverable in chat, even if that
-- account has not opened the Messages tab yet. This also backfills accounts
-- that were created before the chat feature was installed.
create or replace function public.sync_auth_user_to_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, updated_at)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data->>'display_name', new.email, 'Account'),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_sync on auth.users;
create trigger on_auth_user_profile_sync
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_auth_user_to_profile();

insert into public.profiles (id, email, display_name, updated_at)
select
  u.id,
  lower(coalesce(u.email, '')),
  coalesce(u.raw_user_meta_data->>'display_name', u.email, 'Account'),
  now()
from auth.users u
where coalesce(u.email, '') <> ''
on conflict (id) do update set
  email = excluded.email,
  display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
  updated_at = now();

create index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists direct_messages_sender_receiver_created_idx on public.direct_messages (sender_id, receiver_id, created_at desc);
create index if not exists direct_messages_receiver_sender_created_idx on public.direct_messages (receiver_id, sender_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.direct_messages enable row level security;

drop policy if exists "profiles_read_authenticated" on public.profiles;
create policy "profiles_read_authenticated" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "messages_select_participant" on public.direct_messages;
create policy "messages_select_participant" on public.direct_messages
  for select to authenticated using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "messages_insert_sender" on public.direct_messages;
create policy "messages_insert_sender" on public.direct_messages
  for insert to authenticated with check (auth.uid() = sender_id);

drop policy if exists "messages_update_participant" on public.direct_messages;
create policy "messages_update_participant" on public.direct_messages
  for update to authenticated using (auth.uid() = sender_id or auth.uid() = receiver_id) with check (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "messages_delete_participant" on public.direct_messages;
create policy "messages_delete_participant" on public.direct_messages
  for delete to authenticated using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Private bucket: attachments are accessed through short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('chat-attachments','chat-attachments',false)
on conflict (id) do update set public=false;

drop policy if exists "chat_attachments_insert_participant" on storage.objects;
create policy "chat_attachments_insert_participant" on storage.objects
  for insert to authenticated
  with check (
    bucket_id='chat-attachments'
    and exists (
      select 1 from public.direct_messages dm
      where dm.id = (storage.foldername(name))[1]::uuid
        and (dm.sender_id = auth.uid() or dm.receiver_id = auth.uid())
    )
  );

drop policy if exists "chat_attachments_select_participant" on storage.objects;
create policy "chat_attachments_select_participant" on storage.objects
  for select to authenticated
  using (
    bucket_id='chat-attachments'
    and exists (
      select 1 from public.direct_messages dm
      where dm.id = (storage.foldername(name))[1]::uuid
        and (dm.sender_id = auth.uid() or dm.receiver_id = auth.uid())
    )
  );

drop policy if exists "chat_attachments_delete_participant" on storage.objects;
create policy "chat_attachments_delete_participant" on storage.objects
  for delete to authenticated
  using (
    bucket_id='chat-attachments'
    and exists (
      select 1 from public.direct_messages dm
      where dm.id = (storage.foldername(name))[1]::uuid
        and (dm.sender_id = auth.uid() or dm.receiver_id = auth.uid())
    )
  );

-- Realtime is expected to be enabled for direct_messages already.
-- Do not run ALTER PUBLICATION here because PostgreSQL raises 42710 when
-- the table is already a member of supabase_realtime.

