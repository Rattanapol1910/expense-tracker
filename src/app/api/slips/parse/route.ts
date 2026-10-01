import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSlip, SlipError } from "@/lib/slip/parser";
import { matchParty } from "@/lib/slip/matcher";
import { describeExisting, findTransferByRef } from "@/lib/slip/dedupe";
import { signSlip } from "@/lib/slip/sign";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "ต้องเป็นรูปภาพขนาดไม่เกิน 5MB" }, { status: 400 });
  }

  let slip;
  try {
    slip = await parseSlip(file);
  } catch (e) {
    const msg = e instanceof SlipError ? e.message : "เรียกระบบตรวจสลิปไม่สำเร็จ";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const admin = createAdminClient();

  // สลิปนี้เคยถูกบันทึกแล้ว: ถ้าเป็นของเราก็แจ้ง ถ้ายังมีฝั่งว่างก็ให้เคลมได้
  const existing = await findTransferByRef(admin, slip.refNo);
  if (existing) {
    const { alreadyMine, canClaim } = describeExisting(existing, user.id);
    return NextResponse.json(
      {
        duplicate: true,
        alreadyMine,
        canClaim,
        error: alreadyMine
          ? "คุณบันทึกสลิปนี้ไว้แล้ว"
          : canClaim
          ? "สลิปนี้มีผู้อัพโหลดไว้แล้ว คุณสามารถขอเป็นคู่โอนของรายการนี้ได้"
          : "สลิปนี้ถูกบันทึกในระบบแล้ว",
        // ส่ง slip + token ให้เฉพาะกรณีเคลมได้ (ไม่อัพรูปซ้ำ จึงไม่มี slipPath)
        ...(canClaim
          ? { slip, token: signSlip({ ...slip, uid: user.id, slipPath: "" }) }
          : {}),
      },
      { status: 409 }
    );
  }

  const ext = file.type === "image/png" ? "png" : "jpg";
  const slipPath = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("slips").upload(slipPath, file, { contentType: file.type });
  if (upErr) return NextResponse.json({ error: "อัพโหลดรูปไม่สำเร็จ" }, { status: 500 });

  const [senderCandidates, receiverCandidates] = await Promise.all([
    matchParty(admin, slip.senderAccount, slip.senderName),
    matchParty(admin, slip.receiverAccount, slip.receiverName),
  ]);

  const myRole = senderCandidates.some((c) => c.userId === user.id)
    ? "sender"
    : receiverCandidates.some((c) => c.userId === user.id)
    ? "receiver"
    : null;

  return NextResponse.json({
    slip,
    token: signSlip({ ...slip, uid: user.id, slipPath }),
    myRole, // null = จับคู่ไม่ได้ ให้ผู้ใช้เลือกเองว่าเป็นผู้โอนหรือผู้รับ
    senderCandidates: senderCandidates.filter((c) => c.userId !== user.id),
    receiverCandidates: receiverCandidates.filter((c) => c.userId !== user.id),
  });
}