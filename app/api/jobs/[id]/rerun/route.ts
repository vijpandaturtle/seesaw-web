import { NextResponse } from "next/server";

import { rerunJob } from "@/lib/db";
import { cleanModels } from "@/lib/models";
import { startStage } from "@/lib/runner";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Run a job's pathway again on its approved inputs, from Lens.
 *
 * Body: { models?, autoApprove? }. The models default to the source job's
 * (a single `model` string is still accepted).
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    models?: unknown;
    model?: unknown;
    autoApprove?: unknown;
  };
  let models: string[] | undefined;
  const given = body.models ?? body.model;
  if (given !== undefined && given !== "") {
    const chosen = cleanModels(given);
    if ("error" in chosen) return NextResponse.json({ error: chosen.error }, { status: 400 });
    models = chosen.models;
  }

  const result = await rerunJob(id, models, Boolean(body.autoApprove));
  if ("error" in result) {
    const status = result.error === "not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  const started = await startStage(result.job.id);
  return NextResponse.json({ job: result.job, started }, { status: 201 });
}
