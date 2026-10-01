import { createHmac, timingSafeEqual } from "crypto";
import type { SlipTokenPayload } from "@/types/slip";

// ลงลายเซ็นผลตรวจสลิป กัน client แก้ยอด/เลขอ้างอิงก่อนยืนยัน
const secret = () => process.env.SLIP_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const mac = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export function signSlip(payload: Omit<SlipTokenPayload, "exp">, ttlMs = 15 * 60 * 1000): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function verifySlip(token: string): SlipTokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SlipTokenPayload;
  return payload.exp > Date.now() ? payload : null;
}