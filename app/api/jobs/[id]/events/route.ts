import { NextResponse } from "next/server";

import { listEvents } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The job's agent trace, oldest first, without each event's data. `events` is
 * null when the store has no trace table yet (no current worker has
 * opened it).
 */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json({ events: await listEvents(id) });
}
