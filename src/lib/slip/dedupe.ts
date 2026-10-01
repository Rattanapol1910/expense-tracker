import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExistingTransfer {
  id: string;
  sender_id: string | null;
  receiver_id: string | null;
  status: "pending" | "confirmed" | "rejected";
}

// เช็ก ref_no ซ้ำ (ใช้ admin client เพราะอาจเป็นรายการของคนอื่น)
export async function findTransferByRef(admin: SupabaseClient, refNo: string) {
  const { data } = await admin
    .from("transfers")
    .select("id, sender_id, receiver_id, status")
    .eq("ref_no", refNo)
    .maybeSingle();
  return (data as ExistingTransfer | null) ?? null;
}

// alreadyMine = เราเป็นคู่โอนของรายการนี้อยู่แล้ว
// canClaim    = ยังมีฝั่งว่าง + ไม่ถูกโต้แย้ง + เราไม่ใช่คู่โอนอยู่แล้ว
export function describeExisting(existing: ExistingTransfer, userId: string) {
  const alreadyMine = existing.sender_id === userId || existing.receiver_id === userId;
  const hasEmptySide = existing.sender_id === null || existing.receiver_id === null;
  return {
    alreadyMine,
    canClaim: !alreadyMine && hasEmptySide && existing.status === "confirmed",
  };
}