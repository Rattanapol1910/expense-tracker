-- 006: เก็บ Passkey (WebAuthn) ของผู้ใช้
-- เขียน/แก้ไขผ่าน API ฝั่งเซิร์ฟเวอร์ (service role) เท่านั้น client อ่านและลบของตัวเองได้
create table public.passkeys (
  id text primary key,                    -- credential ID (base64url)
  user_id uuid not null references public.profiles(id) on delete cascade,
  public_key text not null,               -- public key (base64url)
  counter bigint not null default 0,
  transports text[],
  device_type text,                       -- singleDevice | multiDevice
  backed_up boolean not null default false,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index on public.passkeys (user_id);

alter table public.passkeys enable row level security;

create policy "passkeys_select_own" on public.passkeys
  for select to authenticated
  using (user_id = auth.uid());

create policy "passkeys_delete_own" on public.passkeys
  for delete to authenticated
  using (user_id = auth.uid());