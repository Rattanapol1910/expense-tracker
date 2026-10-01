-- รายการรายรับ/รายจ่ายส่วนตัว (เพิ่มเอง)
create type public.txn_type as enum ('income', 'expense');

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.txn_type not null,
  amount numeric(14,2) not null check (amount > 0),
  category text not null default 'อื่นๆ',
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index on public.transactions (user_id, occurred_at desc);
