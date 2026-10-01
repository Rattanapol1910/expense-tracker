import type { ParsedSlip } from "@/types/slip";

export class SlipError extends Error {}

// ใช้ SlipOK: https://slipok.com — ส่งรูปสลิปแล้วได้ข้อมูลที่ธนาคารยืนยันกลับมา
export async function parseSlip(file: File): Promise<ParsedSlip> {
  const fd = new FormData();
  fd.append("files", file);
  fd.append("log", "false"); // เราเช็กสลิปซ้ำเองใน DB

  const res = await fetch(
    `https://api.slipok.com/api/line/apikey/${process.env.SLIPOK_BRANCH_ID}`,
    { method: "POST", headers: { "x-authorization": process.env.SLIPOK_API_KEY! }, body: fd }
  );
  const json = await res.json().catch(() => null);
  if (!json?.success || !json.data) {
    throw new SlipError(json?.message ?? "ตรวจสลิปไม่ผ่าน");
  }

  const d = json.data;
  const date = String(d.transDate); // YYYYMMDD
  const time = String(d.transTime ?? "00:00:00");
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time}+07:00`;

  return {
    refNo: String(d.transRef),
    amount: Number(d.amount),
    transferredAt: new Date(iso).toISOString(),
    senderName: d.sender?.displayName ?? d.sender?.name,
    senderAccount: d.sender?.account?.value,
    receiverName: d.receiver?.displayName ?? d.receiver?.name,
    receiverAccount: d.receiver?.account?.value,
  };
}