import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// ค่าตั้งต้นของ WebAuthn (อ่านจาก .env.local)
export const rpName = () => process.env.WEBAUTHN_RP_NAME || "Expense Tracker";
export const rpID = () => process.env.WEBAUTHN_RP_ID || "localhost";
export const expectedOrigin = () => process.env.WEBAUTHN_ORIGIN || "http://localhost:3000";

// เก็บ challenge ไว้ใน cookie httpOnly ที่ลงลายเซ็น (อายุ 5 นาที ใช้ได้ครั้งเดียว)
const COOKIE = "wa_challenge";
const TTL_SECONDS = 5 * 60;
const COOKIE_PATH = "/api/auth/passkey";

type Kind = "register" | "login";

interface ChallengePayload {
  challenge: string;
  kind: Kind;
  uid: string | null;
  exp: number;
}

const secret = () =>
  process.env.WEBAUTHN_SECRET ||
  process.env.SLIP_TOKEN_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

const mac = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export function saveChallenge(kind: Kind, challenge: string, uid: string | null = null) {
  const payload: ChallengePayload = {
    challenge,
    kind,
    uid,
    exp: Date.now() + TTL_SECONDS * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  cookies().set(COOKIE, `${body}.${mac(body)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: TTL_SECONDS,
  });
}

// อ่านแล้วลบทิ้งทันที (กัน replay) คืน null ถ้าไม่ถูกต้อง/หมดอายุ/ไม่ตรงชนิด
export function takeChallenge(kind: Kind, uid: string | null = null): string | null {
  const store = cookies();
  const raw = store.get(COOKIE)?.value;
  store.set(COOKIE, "", { path: COOKIE_PATH, maxAge: 0 });
  if (!raw) return null;

  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: ChallengePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
  if (payload.exp < Date.now() || payload.kind !== kind || payload.uid !== uid) return null;
  return payload.challenge;
}