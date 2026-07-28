import { NextResponse } from "next/server";

import { catalog, fixtureHealth, listRuns, scoreMatrix } from "@/lib/evals";

export const runtime = "nodejs";

export async function GET() {
  const runs = listRuns();
  return NextResponse.json({
    runs,
    catalog: catalog(),
    fixtures: fixtureHealth(),
    matrix: scoreMatrix(runs),
  });
}
