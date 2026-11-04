import { NextResponse } from "next/server";

import { setJobModels } from "@/lib/db";
import { cleanModels } from "@/lib/models";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Change the models a job waiting at its gate will run on: drop one before
 * approving, or add another. Only while the job is awaiting approval.
 *
 * Body: { models }.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { models?: unknown };
  const chosen = cleanModels(body.models);
  if ("error" in chosen) return NextResponse.json({ error: chosen.error }, { status: 400 });

  const result = await setJobModels(id, chosen.models);
  if ("error" in result) {
    const status = result.error === "not found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ job: result.job });
}
