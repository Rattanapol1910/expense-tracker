"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!/^[a-z0-9_]{3,20}$/i.test(username)) {
      setError("username ใช้ได้เฉพาะ a-z, 0-9 และ _ ความยาว 3-20 ตัวอักษร");
      return;
    }
    if (password.length < 8) {
      setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }

    setLoading(true);
    const { data, error } = await createClient().auth.signUp({
      email,
      password,
      options: {
        data: { username: username.toLowerCase(), display_name: displayName || username },
      },
    });
    setLoading(false);

    if (error) {
      setError(
        /database error/i.test(error.message)
          ? "username นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น"
          : error.message
      );
      return;
    }

    if (data.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      // เปิดการยืนยันอีเมลไว้ใน Supabase -> ต้องกดลิงก์ในอีเมลก่อน
      setInfo("สมัครสำเร็จ กรุณากดลิงก์ยืนยันในอีเมล แล้วกลับมาเข้าสู่ระบบ");
    }
  }

  return (
    <main className="mx-auto max-w-sm space-y-6 p-6">
      <h1 className="text-xl font-bold">สมัครสมาชิก</h1>

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="อีเมล"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
        <input
          type="text"
          required
          autoComplete="username"
          placeholder="username (a-z, 0-9, _)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
        <input
          type="text"
          placeholder="ชื่อที่แสดง (ไม่บังคับ)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
        <input
          type="password"
          required
          autoComplete="new-password"
          placeholder="รหัสผ่าน (อย่างน้อย 8 ตัว)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-green-700">{info}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-black px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
        </button>
      </form>

      <p className="text-center text-sm">
        มีบัญชีแล้ว?{" "}
        <Link href="/login" className="underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </main>
  );
}