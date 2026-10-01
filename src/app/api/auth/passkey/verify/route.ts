import { NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { expectedOrigin, rpID, saveChallenge, takeChallenge } from "@/lib/auth/webauthn";

type Transports = NonNullable<
  NonNullable<Parameters<typeof generateAuthenticationOptions>[0]["allowCredentials"]>[number]["transports"]
>;

// body: { step: "options" }  หรือ  { step: "verify", response }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  if (body.step === "options") {
    // ไม่ระบุ allowCredentials = ให้เครื่องเลือก Passkey เอง (ล็อกอินโดยไม่ต้องพิมพ์อีเมล)
    const options = await generateAuthenticationOptions({
      rpID: rpID(),
      userVerification: "required",
    });
    saveChallenge("login", options.challenge);
    return NextResponse.json(options);
  }

  if (body.step === "verify") {
    const expectedChallenge = takeChallenge("login");
    if (!expectedChallenge) {
      return NextResponse.json({ error: "คำขอหมดอายุ กรุณาลองใหม่" }, { status: 400 });
    }

    const credId = body.response?.id;
    if (typeof credId !== "string") {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: pk } = await admin.from("passkeys").select("*").eq("id", credId).maybeSingle();
    if (!pk) return NextResponse.json({ error: "ไม่พบ Passkey นี้ในระบบ" }, { status: 400 });

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge,
        expectedOrigin: expectedOrigin(),
        expectedRPID: rpID(),
        requireUserVerification: true,
        authenticator: {
          credentialID: pk.id,
          credentialPublicKey: isoBase64URL.toBuffer(pk.public_key),
          counter: Number(pk.counter),
          transports: (pk.transports ?? undefined) as Transports | undefined,
        },
      });
    } catch {
      return NextResponse.json({ error: "ตรวจสอบ Passkey ไม่สำเร็จ" }, { status: 400 });
    }
    if (!verification.verified) {
      return NextResponse.json({ error: "ตรวจสอบ Passkey ไม่สำเร็จ" }, { status: 400 });
    }

    await admin
      .from("passkeys")
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", pk.id);

    // ออก session ให้ผู้ใช้: สร้าง magic link ฝั่งเซิร์ฟเวอร์ (ไม่ส่งอีเมล) แล้วแลกเป็น session ทันที
    const { data: u, error: uErr } = await admin.auth.admin.getUserById(pk.user_id);
    const email = u?.user?.email;
    if (uErr || !email) {
      return NextResponse.json({ error: "ไม่พบบัญชีผู้ใช้" }, { status: 400 });
    }

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkErr || !tokenHash) {
      return NextResponse.json({ error: "สร้าง session ไม่สำเร็จ" }, { status: 500 });
    }

    const supabase = createClient();
    const { error: otpErr } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
    if (otpErr) return NextResponse.json({ error: "สร้าง session ไม่สำเร็จ" }, { status: 500 });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "step ไม่ถูกต้อง" }, { status: 400 });
}