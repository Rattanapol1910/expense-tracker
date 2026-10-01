"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PasskeyButton from "@/components/auth/PasskeyButton";

type Passkey = {
  id: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
};

type Profile = { username: string; display_name: string };

export default function ProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setEmail(user.email ?? "");

    const [{ data: p }, { data: k }] = await Promise.all([
      supabase.from("profiles").select("username, display_name").eq("id", user.id).single(),
      // RLS จำกัดให้เห็นเฉพาะของตัวเองอยู่แล้ว
      supabase.from("passkeys").select("id, label, created_at, last_used_at").order("created_at"),
    ]);
    setProfile(p as Profile | null);
    setPasskeys((k ?? []) as Passkey[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function removePasskey(id: string) {
    if (!confirm("ลบ Passkey นี้?")) return;
    await supabase.from("passkeys").delete().eq("id", id);
    load();
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-lg space-y-8 p-6">
      <section className="space-y-1">
        <h1 className="text-xl font-bold">โปรไฟล์</h1>
        <p>{profile?.display_name}</p>
        <p className="text-sm text-gray-500">
          @{profile?.username} · {email}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Passkey (สแกนหน้า/ลายนิ้วมือ)</h2>

        {passkeys.length === 0 ? (
          <p className="text-sm text-gray-500">ยังไม่มี Passkey</p>
        ) : (
          <ul className="divide-y rounded border">
            {passkeys.map((k) => (
              <li key={k.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <p className="font-medium">{k.label ?? "Passkey"}</p>
                  <p className="text-gray-500">
                    เพิ่มเมื่อ {new Date(k.created_at).toLocaleDateString("th-TH")}
                    {k.last_used_at &&
                      ` · ใช้ล่าสุด ${new Date(k.last_used_at).toLocaleDateString("th-TH")}`}
                  </p>
                </div>
                <button onClick={() => removePasskey(k.id)} className="text-red-600 underline">
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        )}

        <PasskeyButton mode="register" onSuccess={load} />
      </section>

      <section>
        <button onClick={logout} className="rounded border px-4 py-2 hover:bg-gray-50">
          ออกจากระบบ
        </button>
      </section>
    </main>
  );
}