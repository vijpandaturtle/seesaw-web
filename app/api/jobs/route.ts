import { NextResponse } from "next/server";

import { createJob, listJobs } from "@/lib/db";
import { pathwayByName, pathwayTitle, validatePathway } from "@/lib/pathways";
import { runnerMode, startStage } from "@/lib/runner";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ jobs: await listJobs(), runner: runnerMode() });
}

/**
 * Insert a queued row, then start a worker on it if we're running alongside
 * the agents. Deployed away from them, the row just waits for a poller.
 *
 * Two shapes:
 *   { question, model, autoApprove }                 a research job
 *   { pathway, params, model, question? }            a pathway job
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const model =
    typeof body?.model === "string" && body.model ? body.model : "gpt2";
  let question = typeof body?.question === "string" ? body.question.trim() : "";

  let pathway: { name: string; params: Record<string, unknown> } | undefined;
  if (body?.pathway !== undefined) {
    const params =
      body.params && typeof body.params === "object" && !Array.isArray(body.params)
        ? (body.params as Record<string, unknown>)
        : {};
    const problems = validatePathway(body.pathway, params, model);
    if (problems.length) {
      return NextResponse.json({ error: problems.join("; ") }, { status: 400 });
    }
    pathway = { name: body.pathway, params };
    question ||= pathwayTitle(pathwayByName(body.pathway)!, params);
  } else if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  let job;
  try {
    job = await createJob(question, model, Boolean(body?.autoApprove), pathway);
  } catch (error) {
    // The only expected failure: a store whose schema predates pathway jobs.
    if (/column .*(kind|params)/.test(String(error))) {
      return NextResponse.json(
        {
          error:
            "The job store hasn't been upgraded for pathway jobs yet. Start a " +
            "seesaw worker once (it adds the columns), then try again.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: `Couldn't write to the job store: ${String(error).slice(0, 300)}` },
      { status: 503 },
    );
  }
  const started = await startStage(job.id);
  return NextResponse.json({ job, started }, { status: 201 });
}
