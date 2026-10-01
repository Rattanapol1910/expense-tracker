"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

interface Props {
  mode: "login" | "register";
  onSuccess?: () => void;
  className?: string;
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "เกิดข้อผิดพลาด");
  return json;
}

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/i.test(ua)) return "iPhone/iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  return "อุปกรณ์นี้";
}

export default function PasskeyButton({ mode, onSuccess, className }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    if (!browserSupportsWebAuthn()) {
      setError("เบราว์เซอร์นี้ไม่รองรับ Passkey");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const options = await post("/api/auth/passkey/verify", { step: "options" });
        const response = await startAuthentication(options);
        await post("/api/auth/passkey/verify", { step: "verify", response });
        router.push("/dashboard");
        router.refresh();
      } else {
        const options = await post("/api/auth/passkey/register", { step: "options" });
        const response = await startRegistration(options);
        await post("/api/auth/passkey/register", {
          step: "verify",
          response,
          label: deviceLabel(),
        });
      }
      onSuccess?.();
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "NotAllowedError") setError("ยกเลิกหรือสแกนไม่สำเร็จ");
      else if (name === "InvalidStateError") setError("อุปกรณ์นี้ลงทะเบียน Passkey ไว้แล้ว");
      else setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-full rounded border px-4 py-2 font-medium hover:bg-gray-50 disabled:opacity-50"
      >
        {loading
          ? "กำลังตรวจสอบ..."
          : mode === "login"
          ? "เข้าสู่ระบบด้วย Passkey (สแกนหน้า/ลายนิ้วมือ)"
          : "เพิ่ม Passkey ให้อุปกรณ์นี้"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}