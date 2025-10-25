import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

function sanitizeSession(name: string): string {
  return (name || "default").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "default";
}

export async function GET(
  _req: NextRequest,
  context: { params: { session: string; which: string } }
) {
  try {
    const { session, which } = context.params;
    const safeSession = sanitizeSession(session);
    const base = process.cwd();
    const normalized = which.endsWith(".csv") ? which.replace(/\.csv$/i, "") : which;
    if (!["source", "target"].includes(normalized)) {
      return new Response("Not found", { status: 404 });
    }
    const filePath = path.join(base, "api", "sessions", safeSession, `${normalized}.csv`);
    if (!fs.existsSync(filePath)) {
      return new Response("Not found", { status: 404 });
    }
    const csv = await fs.promises.readFile(filePath);
    return new Response(csv.toString(), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response("Not found", { status: 404 });
  }
}


