import { NextResponse } from "next/server";

import { createJob, listJobs } from "@/lib/db";
import { AUTO, pathwayByName } from "@/lib/pathways";
import { runnerMode, startStage } from "@/lib/runner";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ jobs: await listJobs(), runner: runnerMode() });
}

/**
 * Insert a queued research job, then start a worker on it if we're running
 * alongside the agents. Deployed away from them, the row just waits for a poller.
 *
 * Body: { question, model, autoApprove, pathway?, search? }. A pathway is
 * Scout's starting plan; Scout chooses its inputs, so none are taken here.
 * "auto" has Scout choose the pathway too (or none). `search` gives Scout its
 * literature search tools.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const model =
    typeof body?.model === "string" && body.model ? body.model : "gpt2";
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  let pathway: string | undefined;
  if (body?.pathway === AUTO) {
    pathway = AUTO;
  } else if (body?.pathway !== undefined && body.pathway !== null) {
    const found = pathwayByName(body.pathway);
    if (!found) {
      return NextResponse.json(
        { error: `unknown pathway ${JSON.stringify(body.pathway)}` },
        { status: 400 },
      );
    }
    if (found.models && !found.models.includes(model)) {
      return NextResponse.json(
        { error: `${found.label} only runs on ${found.models.join(", ")}` },
        { status: 400 },
      );
    }
    pathway = found.name;
  }

  if (body?.search !== undefined && typeof body.search !== "boolean") {
    return NextResponse.json({ error: "search must be true or false" }, { status: 400 });
  }
  const search = body?.search === true;

  let job;
  try {
    job = await createJob(question, model, Boolean(body?.autoApprove), pathway, search);
  } catch (error) {
    // The only expected failure: a store whose schema predates the params column.
    if (/column .*(kind|params)/.test(String(error))) {
      return NextResponse.json(
        {
          error:
            "The job store hasn't been upgraded for pathways yet. Start a " +
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
