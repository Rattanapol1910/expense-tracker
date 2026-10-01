import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ปกติฝั่งที่ไม่ใช่ผู้อัพโหลดเป็นคนตอบ แต่ถ้ามีการเคลม (claimed_by) ผู้อัพโหลดเดิมเป็นคนตอบ
const needsMyResponse = (t: any, uid: string) =>
  t.status === "pending" && (t.claimed_by ? t.uploaded_by === uid : t.uploaded_by !== uid);

// รายการโอนที่เราเป็นผู้โอนหรือผู้รับ (RLS กรองให้แล้ว) ?status=pending เพื่อดูรายการรอยืนยัน
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const status = new URL(request.url).searchParams.get("status");
  let q = supabase
    .from("transfers")
    .select("*, sender:profiles!transfers_sender_id_fkey(display_name), receiver:profiles!transfers_receiver_id_fkey(display_name)")
    .order("transferred_at", { ascending: false });
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data ?? []).map((t: any) => ({
    ...t,
    needsMyResponse: needsMyResponse(t, user.id),
  }));
  return NextResponse.json({ items });
}