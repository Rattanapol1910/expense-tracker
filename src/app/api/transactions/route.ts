import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ปกติฝั่งที่ไม่ใช่ผู้อัพโหลดเป็นคนตอบ แต่ถ้ามีการเคลม (claimed_by) ผู้อัพโหลดเดิมเป็นคนตอบ
const needsMyResponse = (t: any, uid: string) =>
  t.status === "pending" && (t.claimed_by ? t.uploaded_by === uid : t.uploaded_by !== uid);

// GET ?from=ISO&to=ISO — รวมรายการเพิ่มเอง + รายการโอน (ผู้โอน=รายจ่าย / ผู้รับ=รายรับ)
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const from = sp.get("from");
  const to = sp.get("to");

  let txQ = supabase.from("transactions").select("*").eq("user_id", user.id);
  let trQ = supabase
    .from("transfers")
    .select("*, sender:profiles!transfers_sender_id_fkey(display_name), receiver:profiles!transfers_receiver_id_fkey(display_name), transfer_labels(user_id, category, note)")
    .neq("status", "rejected");
  if (from) { txQ = txQ.gte("occurred_at", from); trQ = trQ.gte("transferred_at", from); }
  if (to)   { txQ = txQ.lte("occurred_at", to);   trQ = trQ.lte("transferred_at", to); }

  const [tx, tr] = await Promise.all([txQ, trQ]);
  if (tx.error || tr.error) {
    return NextResponse.json({ error: (tx.error ?? tr.error)!.message }, { status: 500 });
  }

  const manual = (tx.data ?? []).map((t) => ({
    id: t.id, source: "manual" as const, type: t.type, amount: Number(t.amount),
    category: t.category, note: t.note, occurredAt: t.occurred_at,
    status: "confirmed" as const, counterparty: null as string | null,
  }));

  const transfers = (tr.data ?? []).map((t: any) => {
    const isSender = t.sender_id === user.id;
    const label = (t.transfer_labels ?? []).find((l: any) => l.user_id === user.id);
    const other = isSender ? t.receiver : t.sender;
    return {
      id: t.id, source: "transfer" as const,
      type: isSender ? ("expense" as const) : ("income" as const),
      amount: Number(t.amount),
      category: label?.category ?? "โอนเงิน",
      note: label?.note ?? null,
      occurredAt: t.transferred_at,
      status: t.status as "pending" | "confirmed",
      counterparty: (Array.isArray(other) ? other[0] : other)?.display_name ?? null,
      needsMyResponse: needsMyResponse(t, user.id),
    };
  });

  const items = [...manual, ...transfers].sort(
    (a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt)
  );
  return NextResponse.json({ items });
}

// POST { type, amount, category?, note?, occurredAt? } — เพิ่มรายการเอง
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = await request.json().catch(() => null);
  const amount = Number(b?.amount);
  if ((b?.type !== "income" && b?.type !== "expense") || !(amount > 0)) {
    return NextResponse.json({ error: "type หรือ amount ไม่ถูกต้อง" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      type: b.type,
      amount,
      category: b.category || "อื่นๆ",
      note: b.note ?? null,
      occurred_at: b.occurredAt ?? new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data }, { status: 201 });
}