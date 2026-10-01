import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchParty } from "@/lib/slip/matcher";
import { verifySlip } from "@/lib/slip/sign";

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

  const counterpartyId: string | null = body.counterpartyId ?? null;
  if (counterpartyId === user.id) {
    return NextResponse.json({ error: "เลือกตัวเองเป็นคู่โอนไม่ได้" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (counterpartyId) {
    const { data: exists } = await admin.from("profiles").select("id").eq("id", counterpartyId).maybeSingle();
    if (!exists) return NextResponse.json({ error: "ไม่พบผู้ใช้ปลายทาง" }, { status: 400 });
  }

  // ถ้าระบบจับคู่คู่โอนได้ชัดเจน (เลขบัญชี+ชื่อตรง) -> confirmed ทันที ไม่งั้นรออีกฝั่งยืนยัน
  let status: "confirmed" | "pending" = "confirmed";
  if (counterpartyId) {
    const cands = body.role === "sender"
      ? await matchParty(admin, slip.receiverAccount, slip.receiverName)
      : await matchParty(admin, slip.senderAccount, slip.senderName);
    status = cands.some((c) => c.userId === counterpartyId && c.confidence === "high") ? "confirmed" : "pending";
  }

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
      note: body.note ?? null,
    })
    .select()
    .single();

  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json(
      { error: dup ? "สลิปนี้ถูกบันทึกแล้ว" : "บันทึกไม่สำเร็จ" },
      { status: dup ? 409 : 500 }
    );
  }

  await admin.from("transfer_labels").insert({
    transfer_id: transfer.id,
    user_id: user.id,
    category: body.category || "อื่นๆ",
    note: body.note ?? null,
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