import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchParty } from "@/lib/slip/matcher";
import { findTransferByRef } from "@/lib/slip/dedupe";
import { verifySlip } from "@/lib/slip/sign";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/constants/categories";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set<string>([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, "โอนเงิน"]);

// body: { token, role: "sender" | "receiver", counterpartyId?: string | null, category?, note? }
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const slip = body?.token ? verifySlip(body.token) : null;
  if (!slip || slip.uid !== user.id) {
    return NextResponse.json({ error: "ข้อมูลสลิปหมดอายุ กรุณาอัพโหลดใหม่" }, { status: 400 });
  }
  if (body.role !== "sender" && body.role !== "receiver") {
    return NextResponse.json({ error: "role ไม่ถูกต้อง" }, { status: 400 });
  }

  // ตรวจ input
  const counterpartyId: string | null = body.counterpartyId ?? null;
  if (counterpartyId !== null && (typeof counterpartyId !== "string" || !UUID.test(counterpartyId))) {
    return NextResponse.json({ error: "คู่โอนไม่ถูกต้อง" }, { status: 400 });
  }
  if (counterpartyId === user.id) {
    return NextResponse.json({ error: "เลือกตัวเองเป็นคู่โอนไม่ได้" }, { status: 400 });
  }
  const category: string = body.category || "อื่นๆ";
  if (!CATEGORIES.has(category)) {
    return NextResponse.json({ error: "หมวดหมู่ไม่ถูกต้อง" }, { status: 400 });
  }
  const note: string | null =
    typeof body.note === "string" ? body.note.trim().slice(0, 200) || null : null;

  const admin = createAdminClient();

  // ===== เคสเคลม: สลิปนี้มีในระบบแล้ว =====
  // ตัดสินจากฐานข้อมูลเอง ไม่เชื่อ flag จาก client
  const existing = await findTransferByRef(admin, slip.refNo);
  if (existing) {
    const { data: claimed, error: claimErr } = await supabase.rpc("claim_transfer", {
      p_ref: slip.refNo,
    });
    if (claimErr) {
      const m = claimErr.message;
      const msg = m.includes("already_party")
        ? "คุณเป็นคู่โอนของรายการนี้อยู่แล้ว"
        : m.includes("not_claimable")
        ? "สลิปนี้มีคู่โอนครบแล้วหรือกำลังรอการยืนยัน"
        : "ขอเป็นคู่โอนไม่สำเร็จ";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    await admin.from("transfer_labels").upsert(
      { transfer_id: claimed.id, user_id: user.id, category, note },
      { onConflict: "transfer_id,user_id" }
    );
    return NextResponse.json({ transfer: claimed, claimed: true });
  }

  // ===== เคสบันทึกสลิปใหม่ =====
  if (counterpartyId) {
    const { data: exists } = await admin.from("profiles").select("id").eq("id", counterpartyId).maybeSingle();
    if (!exists) return NextResponse.json({ error: "ไม่พบผู้ใช้ปลายทาง" }, { status: 400 });
  }

  // confirmed ทันทีเมื่อ:
  //   - ไม่ระบุคู่โอน (เป็นบันทึกส่วนตัวฝั่งเดียว) หรือ
  //   - ระบบจับคู่ได้ชัดเจน "ทั้งสองฝั่ง" (ตัวเราและคู่โอน) ไม่งั้นรออีกฝั่งยืนยัน
  const [senderMatches, receiverMatches] = await Promise.all([
    matchParty(admin, slip.senderAccount, slip.senderName),
    matchParty(admin, slip.receiverAccount, slip.receiverName),
  ]);
  const mine = body.role === "sender" ? senderMatches : receiverMatches;
  const theirs = body.role === "sender" ? receiverMatches : senderMatches;

  const iAmHigh = mine.some((c) => c.userId === user.id && c.confidence === "high");
  const theyAreHigh =
    counterpartyId !== null &&
    theirs.some((c) => c.userId === counterpartyId && c.confidence === "high");

  const status: "confirmed" | "pending" =
    counterpartyId === null ? "confirmed" : iAmHigh && theyAreHigh ? "confirmed" : "pending";

  const senderId = body.role === "sender" ? user.id : counterpartyId;
  const receiverId = body.role === "receiver" ? user.id : counterpartyId;

  const { data: transfer, error } = await admin
    .from("transfers")
    .insert({
      ref_no: slip.refNo,
      amount: slip.amount,
      transferred_at: slip.transferredAt,
      slip_path: slip.slipPath,
      uploaded_by: user.id,
      sender_id: senderId,
      receiver_id: receiverId,
      status,
      note,
    })
    .select()
    .single();

  if (error) {
    const dup = error.code === "23505"; // มีคนบันทึกตัดหน้าในเสี้ยววินาที
    return NextResponse.json(
      { error: dup ? "สลิปนี้ถูกบันทึกแล้ว" : "บันทึกไม่สำเร็จ" },
      { status: dup ? 409 : 500 }
    );
  }

  await admin.from("transfer_labels").insert({
    transfer_id: transfer.id,
    user_id: user.id,
    category,
    note,
  });

  if (counterpartyId) {
    await admin.from("notifications").insert({
      user_id: counterpartyId,
      transfer_id: transfer.id,
      message:
        status === "pending"
          ? `มีรายการโอน ${slip.amount.toLocaleString("th-TH")} บาท รอคุณยืนยัน`
          : `มีรายการโอน ${slip.amount.toLocaleString("th-TH")} บาท เข้าบัญชีรายการของคุณแล้ว`,
    });
  }

  return NextResponse.json({ transfer });
}