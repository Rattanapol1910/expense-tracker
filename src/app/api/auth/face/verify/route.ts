// (ทางเลือก) ยืนยันใบหน้า — ลบได้ถ้าใช้ passkey อย่างเดียว
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // TODO
  return NextResponse.json({ ok: true });
}

