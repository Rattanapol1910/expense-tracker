import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchCandidate } from "@/types/slip";

// เลขบัญชีบนสลิปถูกปิดบางส่วน เช่น xxx-x-x4567-x -> เอาตัวเลขทั้งหมดมาต่อกันแล้วเอา 4 ตัวท้าย
export function last4(account?: string): string | null {
  const digits = (account ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

const TITLES = /(นางสาว|นาย|นาง|น\.ส\.|mr\.?|mrs\.?|miss|ms\.?)/gi;
const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9ก-๙]/g, "");

function nameScore(slipName: string | undefined, accountName: string): number {
  if (!slipName) return 0;
  const tokens = slipName.replace(TITLES, " ").split(/\s+/).map(clean).filter((t) => t.length >= 2);
  if (!tokens.length) return 0;
  const target = clean(accountName.replace(TITLES, " "));
  return tokens.filter((t) => target.includes(t)).length / tokens.length;
}

// ต้องส่ง admin client เพราะ bank_accounts ของคนอื่นมองไม่เห็นภายใต้ RLS
export async function matchParty(
  admin: SupabaseClient,
  account: string | undefined,
  name: string | undefined
): Promise<MatchCandidate[]> {
  const l4 = last4(account);
  if (!l4) return [];

  const { data } = await admin
    .from("bank_accounts")
    .select("user_id, account_name, profiles(display_name)")
    .eq("account_last4", l4);

  const best = new Map<string, MatchCandidate>();
  for (const row of (data ?? []) as any[]) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const confidence = nameScore(name, row.account_name) >= 0.5 ? "high" : "low";
    const prev = best.get(row.user_id);
    if (!prev || confidence === "high") {
      best.set(row.user_id, {
        userId: row.user_id,
        displayName: profile?.display_name ?? "ไม่ทราบชื่อ",
        confidence,
      });
    }
  }
  return [...best.values()];
}