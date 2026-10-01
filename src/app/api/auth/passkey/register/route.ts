import { NextResponse } from "next/server";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { expectedOrigin, rpID, rpName, saveChallenge, takeChallenge } from "@/lib/auth/webauthn";

type Transports = NonNullable<
  NonNullable<Parameters<typeof generateRegistrationOptions>[0]["excludeCredentials"]>[number]["transports"]
>;

// body: { step: "options" }  หรือ  { step: "verify", response, label? }
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  if (body.step === "options") {
    const { data: existing } = await supabase.from("passkeys").select("id, transports");

    const options = await generateRegistrationOptions({
      rpName: rpName(),
      rpID: rpID(),
      userID: new TextEncoder().encode(user.id),
      userName: user.email ?? user.id,
      attestationType: "none",
      excludeCredentials: (existing ?? []).map((p) => ({
        id: p.id as string,
        transports: (p.transports ?? undefined) as Transports | undefined,
      })),
      authenticatorSelection: {
        residentKey: "required", // ให้ล็อกอินได้โดยไม่ต้องพิมพ์อีเมล
        userVerification: "required", // บังคับสแกนหน้า/ลายนิ้วมือ/PIN ของเครื่อง
      },
    });

    saveChallenge("register", options.challenge, user.id);
    return NextResponse.json(options);
  }

  if (body.step === "verify") {
    const expectedChallenge = takeChallenge("register", user.id);
    if (!expectedChallenge) {
      return NextResponse.json({ error: "คำขอหมดอายุ กรุณาลองใหม่" }, { status: 400 });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge,
        expectedOrigin: expectedOrigin(),
        expectedRPID: rpID(),
        requireUserVerification: true,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "ตรวจสอบ Passkey ไม่สำเร็จ" },
        { status: 400 }
      );
    }

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "ตรวจสอบ Passkey ไม่สำเร็จ" }, { status: 400 });
    }

    const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    const admin = createAdminClient();
    const { error } = await admin.from("passkeys").insert({
      id: credentialID,
      user_id: user.id,
      public_key: isoBase64URL.fromBuffer(credentialPublicKey),
      counter,
      transports: body.response?.response?.transports ?? null,
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp,
      label: typeof body.label === "string" ? body.label.slice(0, 40) : null,
    });

    if (error) {
      const dup = error.code === "23505";
      return NextResponse.json(
        { error: dup ? "Passkey นี้ถูกลงทะเบียนแล้ว" : "บันทึก Passkey ไม่สำเร็จ" },
        { status: dup ? 409 : 500 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "step ไม่ถูกต้อง" }, { status: 400 });
}