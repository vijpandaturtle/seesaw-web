import { NextResponse } from "next/server";

import { createJob, listJobs } from "@/lib/db";
import { DEFAULT_MODEL, cleanModels, incompatibility } from "@/lib/models";
import { AUTO, pathwayByName } from "@/lib/pathways";
import { runnerMode, startStage } from "@/lib/runner";
import { useCaseByName } from "@/lib/use-cases";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ jobs: await listJobs(), runner: runnerMode() });
}

/**
 * Insert a queued research job, then start a worker on it if we're running
 * alongside the agents. Deployed away from them, the row just waits for a poller.
 *
 * Body: { question, models, otherModel?, autoApprove, useCase?, pathway?, search? }.
 * `models` lists every model the job runs on (a single `model` string is
 * still accepted). A pathway is Scout's starting plan; Scout chooses its
 * inputs, so none are taken here, except model_diffing's `otherModel`: the
 * changed model compared with the first. "auto" has Scout choose the pathway
 * too (or none). `search` gives Scout its literature search tools. `useCase`
 * records what the job is for; with no pathway named, its main pathway runs.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const chosen = cleanModels(body?.models ?? body?.model ?? DEFAULT_MODEL);
  if ("error" in chosen) {
    return NextResponse.json({ error: chosen.error }, { status: 400 });
  }
  const { models } = chosen;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  let useCase: string | undefined;
  if (body?.useCase !== undefined && body.useCase !== null) {
    const found = useCaseByName(body.useCase);
    if (!found) {
      return NextResponse.json(
        { error: `unknown use case ${JSON.stringify(body.useCase)}` },
        { status: 400 },
      );
    }
    if (found.status === "planned") {
      return NextResponse.json(
        { error: `${found.title} isn't runnable yet: ${found.gap}` },
        { status: 400 },
      );
    }
    if (body.pathway === undefined || body.pathway === null || body.pathway === AUTO) {
      body.pathway = found.pathways[0];
    } else if (!found.pathways.includes(body.pathway)) {
      return NextResponse.json(
        { error: `${found.title} runs ${found.pathways.join(" or ")}, not ${body.pathway}` },
        { status: 400 },
      );
    }
    useCase = found.name;
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
    const reason = models.map((m) => incompatibility(found, m)).find(Boolean);
    if (reason) {
      return NextResponse.json({ error: reason }, { status: 400 });
    }
    pathway = found.name;
  }

  // model_diffing compares the first model with a changed one the user names.
  let otherModel: string | undefined;
  if (pathwayByName(pathway)?.comparesModels) {
    const other = cleanModels(body?.otherModel);
    if ("error" in other || other.models.length !== 1) {
      return NextResponse.json(
        { error: "model diffing needs the changed model to compare with: otherModel" },
        { status: 400 },
      );
    }
    if (models.length !== 1) {
      return NextResponse.json(
        { error: "model diffing compares one base model with the changed one" },
        { status: 400 },
      );
    }
    otherModel = other.models[0];
  }

  if (body?.search !== undefined && typeof body.search !== "boolean") {
    return NextResponse.json({ error: "search must be true or false" }, { status: 400 });
  }
  const search = body?.search === true;

  let job;
  try {
    job = await createJob(
      question, models, Boolean(body?.autoApprove), pathway, search, otherModel, useCase,
    );
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
