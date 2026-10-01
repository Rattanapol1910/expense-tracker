import type { SupabaseClient } from "@supabase/supabase-js";

// เช็ก ref_no ซ้ำ (ใช้ admin client เพราะอาจเป็นรายการของคนอื่น)
export async function findTransferByRef(admin: SupabaseClient, refNo: string) {
  const { data } = await admin
    .from("transfers")
    .select("id, sender_id, receiver_id")
    .eq("ref_no", refNo)
    .maybeSingle();
  return data;
}