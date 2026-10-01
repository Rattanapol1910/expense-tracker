-- 005: แก้ช่องโหว่ RLS + เพิ่ม label รายคน + ให้คู่โอนเปิดดูสลิปได้

-- 1) การสร้าง transfer ทำผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น (กันยัด status/amount เอง)
drop policy if exists "transfers_insert_party" on public.transfers;

-- 2) ตอบรับ/โต้แย้งผ่านฟังก์ชัน ไม่ให้ client แก้คอลัมน์อื่นได้
drop policy if exists "transfers_respond_counterparty" on public.transfers;

create or replace function public.respond_transfer(p_id uuid, p_accept boolean)
returns public.transfers
language plpgsql security definer set search_path = public as $$
declare t public.transfers;
begin
  select * into t from public.transfers where id = p_id for update;
  if not found
     or auth.uid() is null
     or (t.sender_id is distinct from auth.uid() and t.receiver_id is distinct from auth.uid()) then
    raise exception 'not_found';
  end if;
  if t.uploaded_by = auth.uid() then raise exception 'uploader_cannot_respond'; end if;
  if p_accept and t.status <> 'pending' then raise exception 'not_pending'; end if;
  if not p_accept and t.status = 'rejected' then raise exception 'already_rejected'; end if;

  update public.transfers
     set status = (case when p_accept then 'confirmed' else 'rejected' end)::public.transfer_status,
         responded_at = now()
   where id = p_id
   returning * into t;

  insert into public.notifications (user_id, transfer_id, message)
  values (t.uploaded_by, t.id,
          case when p_accept then 'อีกฝั่งยืนยันรายการโอนแล้ว' else 'อีกฝั่งปฏิเสธ/โต้แย้งรายการโอน' end);
  return t;
end; $$;

revoke all on function public.respond_transfer(uuid, boolean) from public;
grant execute on function public.respond_transfer(uuid, boolean) to authenticated;

-- 3) หมวดหมู่/โน้ตของแต่ละฝั่ง (transfers มีแถวเดียว แต่ละคนจัดหมวดต่างกันได้)
create table public.transfer_labels (
  transfer_id uuid not null references public.transfers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null default 'อื่นๆ',
  note text,
  primary key (transfer_id, user_id)
);
alter table public.transfer_labels enable row level security;
create policy "transfer_labels_own" on public.transfer_labels
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4) คู่โอนเปิดดูรูปสลิปได้ (เดิมเห็นแค่โฟลเดอร์ผู้อัพโหลด)
create policy "slips_read_transfer_party" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'slips' and exists (
      select 1 from public.transfers t
      where t.slip_path = storage.objects.name
        and (t.sender_id = auth.uid() or t.receiver_id = auth.uid())
    )
  );