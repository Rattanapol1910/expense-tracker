-- รายการโอนระหว่างผู้ใช้: เก็บแถวเดียว ให้แต่ละฝั่งเห็นตามบทบาท
--   sender_id   -> แสดงเป็น "รายจ่าย"
--   receiver_id -> แสดงเป็น "รายรับ"
create type public.transfer_status as enum ('pending', 'confirmed', 'rejected');

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,            -- เลขอ้างอิงบนสลิป กันรายการซ้ำ
  amount numeric(14,2) not null check (amount > 0),
  transferred_at timestamptz not null,
  slip_path text,                         -- path ใน Supabase Storage
  uploaded_by uuid not null references public.profiles(id),
  sender_id uuid references public.profiles(id),
  receiver_id uuid references public.profiles(id),
  status public.transfer_status not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id is distinct from receiver_id),
  check (uploaded_by = sender_id or uploaded_by = receiver_id)
);

create index on public.transfers (sender_id, transferred_at desc);
create index on public.transfers (receiver_id, transferred_at desc);

-- แจ้งเตือน
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  transfer_id uuid references public.transfers(id) on delete cascade,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
