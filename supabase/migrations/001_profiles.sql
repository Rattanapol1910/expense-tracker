-- โปรไฟล์ผู้ใช้ + บัญชีธนาคารที่ผูกไว้ (ใช้จับคู่ผู้รับตอนอัพสลิป)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bank_code text not null,              -- เช่น KBANK, SCB, BBL
  account_name text not null,           -- ชื่อบัญชี
  account_last4 text not null check (char_length(account_last4) = 4),
  promptpay_hint text,                  -- เบอร์/เลขบัตรท้าย 4 ตัว (ถ้ามี)
  created_at timestamptz not null default now()
);

create index on public.bank_accounts (account_last4);

-- สร้างโปรไฟล์อัตโนมัติเมื่อสมัครสมาชิก
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
