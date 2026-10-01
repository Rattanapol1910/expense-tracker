-- Row Level Security: ผู้ใช้เห็นเฉพาะข้อมูลของตัวเอง
alter table public.profiles       enable row level security;
alter table public.bank_accounts  enable row level security;
alter table public.transactions   enable row level security;
alter table public.transfers      enable row level security;
alter table public.notifications  enable row level security;

-- profiles: ล็อกอินแล้วค้นหา username ได้ แต่แก้ได้เฉพาะของตัวเอง
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid());

-- bank_accounts: เห็น/แก้ได้เฉพาะของตัวเอง
create policy "bank_accounts_own" on public.bank_accounts
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- transactions: เฉพาะเจ้าของ
create policy "transactions_own" on public.transactions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- transfers: เห็นเมื่อเป็นผู้โอนหรือผู้รับ
create policy "transfers_select_party" on public.transfers
  for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

-- สร้างได้เมื่อเป็นผู้อัพโหลดและเป็นหนึ่งในคู่โอน
create policy "transfers_insert_party" on public.transfers
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (sender_id = auth.uid() or receiver_id = auth.uid())
  );

-- ตอบรับ/ปฏิเสธ: เฉพาะฝั่งที่ "ไม่ใช่ผู้อัพโหลด" เท่านั้น
create policy "transfers_respond_counterparty" on public.transfers
  for update to authenticated
  using (
    status = 'pending'
    and uploaded_by <> auth.uid()
    and (sender_id = auth.uid() or receiver_id = auth.uid())
  );

-- ผู้อัพโหลดลบรายการที่ยัง pending ของตัวเองได้
create policy "transfers_delete_uploader_pending" on public.transfers
  for delete to authenticated
  using (uploaded_by = auth.uid() and status = 'pending');

-- notifications: เฉพาะเจ้าของ
create policy "notifications_own" on public.notifications
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Storage: สร้าง bucket 'slips' (private) แล้วเก็บไฟล์ใต้โฟลเดอร์ {user_id}/...
insert into storage.buckets (id, name, public) values ('slips', 'slips', false)
  on conflict do nothing;

create policy "slips_upload_own_folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'slips' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "slips_read_own_folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'slips' and (storage.foldername(name))[1] = auth.uid()::text);
