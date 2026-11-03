import { NextResponse } from "next/server";

import { getEvent } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; eventId: string }> };

/** One agent-trace event with its data: the prompt, the answer, the tool's output. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id, eventId } = await params;
  const n = Number(eventId);
  if (!Number.isInteger(n)) return NextResponse.json({ error: "bad event id" }, { status: 400 });
  const event = await getEvent(id, n);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event });
}
