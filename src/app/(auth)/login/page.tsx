"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PasskeyButton from "@/components/auth/PasskeyButton";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-sm space-y-6 p-6">
      <h1 className="text-xl font-bold">เข้าสู่ระบบ</h1>

      <PasskeyButton mode="login" />

      <div className="flex items-center gap-3 text-sm text-gray-400">
        <hr className="flex-1" /> หรือ <hr className="flex-1" />
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="email"
          required
          autoComplete="username webauthn"
          placeholder="อีเมล"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="รหัสผ่าน"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-black px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>

      <p className="text-center text-sm">
        ยังไม่มีบัญชี?{" "}
        <Link href="/register" className="underline">
          สมัครสมาชิก
        </Link>
      </p>
    </main>
  );
}