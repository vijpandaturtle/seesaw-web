import { NextResponse } from "next/server";

import { createJob, listJobs } from "@/lib/db";
import { runnerMode, startWorker } from "@/lib/worker";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ jobs: listJobs(), runner: runnerMode() });
}

/**
 * Insert a queued row, then start a worker on it if we're running alongside
 * the agents. Deployed away from them, the row just waits for a poller.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  const job = createJob(
    question,
    typeof body?.model === "string" && body.model ? body.model : "gpt2",
    Boolean(body?.autoApprove),
  );
  const started = startWorker(job.id);
  return NextResponse.json({ job, started }, { status: 201 });
}
