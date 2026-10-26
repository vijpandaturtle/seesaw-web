import { NextResponse } from "next/server";

import { listDatasheets } from "@/lib/datasheets";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ datasheets: listDatasheets() });
}
