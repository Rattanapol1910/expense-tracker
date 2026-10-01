import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// body: { accept: boolean }  — true = ยืนยัน, false = ปฏิเสธ/โต้แย้ง
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (typeof body?.accept !== "boolean") {
    return NextResponse.json({ error: "accept ต้องเป็น boolean" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("respond_transfer", {
    p_id: params.id,
    p_accept: body.accept,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ transfer: data });
}