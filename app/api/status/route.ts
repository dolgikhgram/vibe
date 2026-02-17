import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const checks: Record<string, string | boolean> = {
    app: "ok",
    cookies: false,
    cookiesSource: "none",
  };

  try {
    const envCookies = process.env.SOUNDCLOUD_COOKIES;
    if (envCookies) {
      const decoded = Buffer.from(envCookies, "base64").toString("utf-8");
      const arr = JSON.parse(decoded);
      const hasOauth = Array.isArray(arr) && arr.some((c: { name: string }) => c.name === "oauth_token");
      checks.cookies = hasOauth;
      checks.cookiesSource = "env";
    } else {
      const cookiesPath = path.join(process.cwd(), "cookies.json");
      if (fs.existsSync(cookiesPath)) {
        const raw = fs.readFileSync(cookiesPath, "utf-8");
        const arr = JSON.parse(raw);
        const hasOauth = Array.isArray(arr) && arr.some((c: { name: string }) => c.name === "oauth_token");
        checks.cookies = hasOauth;
        checks.cookiesSource = "file";
      }
    }
  } catch (e) {
    checks.cookies = false;
    checks.cookiesError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(checks);
}
