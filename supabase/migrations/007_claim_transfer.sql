-- 007: ให้อีกฝั่งเคลมสลิปที่ยังไม่มีคู่โอนได้ (claim) + ปรับ respond_transfer รองรับ

-- 1) บันทึกว่าใครเป็นคนเคลม (null = ไม่มีการเคลม)
alter table public.transfers
  add column if not exists claimed_by uuid references public.profiles(id);

-- 2) เคลมสลิป: เติมฝั่งที่ว่างเป็นผู้ใช้คนนี้ แล้วตั้งเป็น pending ให้ผู้อัพโหลดเดิมยืนยัน
create or replace function public.claim_transfer(p_ref text)
returns public.transfers
language plpgsql security definer set search_path = public as $$
declare
  t public.transfers;
  me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthorized'; end if;

  select * into t from public.transfers where ref_no = p_ref for update;
  if not found then raise exception 'not_found'; end if;

  if t.sender_id = me or t.receiver_id = me then raise exception 'already_party'; end if;

  -- เคลมได้เฉพาะรายการที่ยังมีฝั่งว่าง และไม่ได้ถูกโต้แย้ง/รออยู่
  if t.status <> 'confirmed' or (t.sender_id is not null and t.receiver_id is not null) then
    raise exception 'not_claimable';
  end if;

  update public.transfers
     set sender_id    = case when t.sender_id is null then me else t.sender_id end,
         receiver_id  = case when t.sender_id is null then t.receiver_id else me end,
         claimed_by   = me,
         status       = 'pending',
         responded_at = null
   where id = t.id
   returning * into t;

  insert into public.notifications (user_id, transfer_id, message)
  values (t.uploaded_by, t.id, 'มีผู้ใช้ขอเป็นคู่โอนของสลิปที่คุณอัพโหลด รอคุณยืนยัน');

  return t;
end; $$;

revoke all on function public.claim_transfer(text) from public;
grant execute on function public.claim_transfer(text) to authenticated;

-- 3) respond_transfer ฉบับใหม่ (ชื่อและพารามิเตอร์เหมือนเดิม API ฝั่งเว็บไม่ต้องแก้)
--    - ปกติ: ฝั่งที่ "ไม่ใช่ผู้อัพโหลด" ตอบ
--    - ถ้ามีการเคลม: ผู้อัพโหลดเดิมเป็นคนตอบ (ตอบได้เฉพาะตอน pending)
--      ถ้าปฏิเสธ จะคืนฝั่งนั้นให้ว่างและกลับเป็นสลิปรอคู่โอนเหมือนเดิม
create or replace function public.respond_transfer(p_id uuid, p_accept boolean)
returns public.transfers
language plpgsql security definer set search_path = public as $$
declare
  t public.transfers;
  me uuid := auth.uid();
  notify_user uuid;
  msg text;
begin
  select * into t from public.transfers where id = p_id for update;
  if not found
     or me is null
     or (t.sender_id is distinct from me and t.receiver_id is distinct from me) then
    raise exception 'not_found';
  end if;

  if t.claimed_by is not null then
    if t.uploaded_by <> me then raise exception 'not_your_turn'; end if;
    if t.status <> 'pending' then raise exception 'not_pending'; end if;

    notify_user := t.claimed_by;

    if p_accept then
      update public.transfers
         set status = 'confirmed', responded_at = now()
       where id = p_id
       returning * into t;
      msg := 'ผู้อัพโหลดยืนยันรายการโอนแล้ว';
    else
      update public.transfers
         set sender_id    = case when sender_id   = claimed_by then null else sender_id   end,
             receiver_id  = case when receiver_id = claimed_by then null else receiver_id end,
             claimed_by   = null,
             status       = 'confirmed',
             responded_at = now()
       where id = p_id
       returning * into t;
      msg := 'ผู้อัพโหลดปฏิเสธคำขอเป็นคู่โอน';
    end if;
  else
    if t.uploaded_by = me then raise exception 'uploader_cannot_respond'; end if;
    if p_accept and t.status <> 'pending' then raise exception 'not_pending'; end if;
    if not p_accept and t.status = 'rejected' then raise exception 'already_rejected'; end if;

    notify_user := t.uploaded_by;

    update public.transfers
       set status = (case when p_accept then 'confirmed' else 'rejected' end)::public.transfer_status,
           responded_at = now()
     where id = p_id
     returning * into t;

    msg := case when p_accept then 'อีกฝั่งยืนยันรายการโอนแล้ว' else 'อีกฝั่งปฏิเสธ/โต้แย้งรายการโอน' end;
  end if;

  insert into public.notifications (user_id, transfer_id, message)
  values (notify_user, t.id, msg);

  return t;
end; $$;

revoke all on function public.respond_transfer(uuid, boolean) from public;
grant execute on function public.respond_transfer(uuid, boolean) to authenticated;