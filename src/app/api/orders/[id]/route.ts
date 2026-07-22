import { NextRequest, NextResponse } from "next/server";
import { getAdminApiContext } from "@/lib/api-auth";
import { orderStatusSchema } from "@/lib/validation";

export const runtime = "nodejs";

// PATCH /api/orders/[id] — admin updates an order's status and/or marks it read.
// RLS (via the session-scoped client) ensures an admin can only touch their own
// restaurant's orders.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getAdminApiContext();
  if (!ctx) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const { supabase } = ctx;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.is_read === "boolean") {
    patch.is_read = body.is_read;
  }
  if (body.status !== undefined) {
    const parsed = orderStatusSchema.safeParse({ status: body.status });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    patch.status = parsed.data.status;
    // Acknowledging (or any status change beyond new) implies it's been seen.
    if (parsed.data.status !== "new") patch.is_read = true;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", params.id)
    .select("id, status, is_read")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "Could not update the order." },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, order: data });
}
