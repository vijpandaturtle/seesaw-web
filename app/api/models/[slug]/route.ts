import { NextResponse } from "next/server";

import { isValidSlug } from "@/lib/datasheet-types";
import { getDatasheet } from "@/lib/datasheets";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { slug } = await params;
  // Checked here as well as in getDatasheet, so a traversal attempt never
  // reaches the filesystem layer at all.
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const datasheet = getDatasheet(slug);
  if (!datasheet) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ datasheet });
}
