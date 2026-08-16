-- Life Management v29 notifications migration.
-- Safe to run on an existing project. It does NOT drop direct_messages.

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{"calendar":true,"bills":true,"water":true,"sleep":true,"workout":true,"grocery":true,"reading":true,"journal":true,"messages":true,"vitals":false}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz
);

create index if not exists notification_devices_user_id_idx on public.notification_devices(user_id);
create index if not exists notifications_user_id_created_at_idx on public.notifications(user_id, created_at desc);

alter table public.notification_preferences enable row level security;
alter table public.notification_devices enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "users manage own notification preferences" on public.notification_preferences;
create policy "users manage own notification preferences" on public.notification_preferences
for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);

drop policy if exists "users manage own notification devices" on public.notification_devices;
create policy "users manage own notification devices" on public.notification_devices
for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications
for select to authenticated using (auth.uid()=user_id);

drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications" on public.notifications
for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);

-- Queue a notification whenever a direct message is inserted.
create or replace function public.queue_direct_message_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.notifications(user_id,type,title,body,data)
  values (
    new.receiver_id,
    'message',
    'New message',
    case when coalesce(new.body,'') <> '' then left(new.body,180)
         when coalesce(new.attachment_type,'') like 'image/%' then 'Sent a photo'
         else 'Sent a file' end,
    jsonb_build_object('message_id',new.id,'sender_id',new.sender_id)
  );
  return new;
end; $$;

drop trigger if exists trg_queue_direct_message_notification on public.direct_messages;
create trigger trg_queue_direct_message_notification
after insert on public.direct_messages
for each row execute function public.queue_direct_message_notification();

-- Realtime is intentionally NOT altered here. If direct_messages is already
-- in supabase_realtime, do not add it again.
