import { NextResponse } from "next/server";

import { deleteJob, getJob } from "@/lib/db";
import { STATUS } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ job });
}

/**
 * Delete a job and its agent trace. Its files on disk are left alone, as the
 * Python side does. A queued or running job is refused: cancel it first, or
 * its worker would keep writing to a job that no longer exists.
 */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.status === STATUS.RUNNING || job.status === STATUS.QUEUED) {
    return NextResponse.json({ error: "cancel the job before deleting it" }, { status: 409 });
  }
  await deleteJob(id);
  return NextResponse.json({ ok: true });
}
