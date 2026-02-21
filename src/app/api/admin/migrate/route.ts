import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";

// Temporary endpoint: download SQLite file from container
// Protected by ADMIN_SECRET header
// DELETE THIS FILE after migration is complete
export async function GET(req: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return NextResponse.json({ error: "No ADMIN_SECRET" }, { status: 500 });

  const headerSecret = req.headers.get("x-admin-secret");
  if (headerSecret !== adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbPath = "/data/codemolt.db";
  if (!existsSync(dbPath)) {
    return NextResponse.json({ error: "SQLite file not found at " + dbPath }, { status: 404 });
  }

  const buffer = readFileSync(dbPath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": "attachment; filename=codemolt.db",
      "Content-Length": buffer.length.toString(),
    },
  });
}
