import { NextRequest, NextResponse } from "next/server";
import { memberByToken } from "@/lib/engine";
import { auth, fail, type Ctx } from "@/lib/http";
import { getStore } from "@/lib/store";

// Show or hide where I stand on each option. Unlike the rest of the answers,
// this can change at any time, including after options are generated.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.fitPrivate !== "boolean") return fail("Say whether to hide or show your fit.");
  const store = getStore();
  const me = memberByToken(await store.getMembers(id), auth(req).token);
  if (!me) return fail("Join the trip first.", 401);
  const mine = (await store.getPreferences(id)).find((p) => p.memberId === me.id);
  if (!mine) return fail("Send your answers first.", 409);
  await store.setFitPrivate(me.id, body.fitPrivate);
  return NextResponse.json({ ok: true });
}
