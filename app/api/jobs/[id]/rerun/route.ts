import { NextResponse } from "next/server";

import { rerunJob } from "@/lib/db";
import { startStage } from "@/lib/runner";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Run a job's pathway again on its approved inputs, from Lens.
 *
 * Body: { model?, autoApprove? }. The model defaults to the source job's.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    model?: unknown;
    autoApprove?: unknown;
  };
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;

  const result = await rerunJob(id, model, Boolean(body.autoApprove));
  if ("error" in result) {
    const status = result.error === "not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  const started = await startStage(result.job.id);
  return NextResponse.json({ job: result.job, started }, { status: 201 });
}
