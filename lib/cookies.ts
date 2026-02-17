import type { Cookie } from "playwright";
import fs from "fs";
import path from "path";

export interface ChromeCookie {
  domain: string;
  expirationDate?: number;
  hostOnly?: boolean;
  httpOnly?: boolean;
  name: string;
  path: string;
  sameSite?: "no_restriction" | "lax" | "strict" | "unspecified";
  secure?: boolean;
  session?: boolean;
  value: string;
}

function toPlaywrightCookie(c: ChromeCookie): Cookie {
  const domain = c.hostOnly ? c.domain : c.domain.startsWith(".") ? c.domain : `.${c.domain}`;
  const sameSiteMap = { no_restriction: "None" as const, lax: "Lax" as const, strict: "Strict" as const, unspecified: "Lax" as const };
  const sameSite = c.sameSite && c.sameSite !== "unspecified" ? sameSiteMap[c.sameSite] : "Lax";
  const expires = !c.session && c.expirationDate ? Math.floor(c.expirationDate) : 9999999999;

  return {
    name: c.name,
    value: c.value,
    domain,
    path: c.path || "/",
    expires,
    httpOnly: c.httpOnly ?? false,
    secure: c.secure ?? false,
    sameSite,
  };
}

export function loadCookies(): Cookie[] {
  const envCookies = process.env.SOUNDCLOUD_COOKIES;
  if (envCookies) {
    try {
      const decoded = Buffer.from(envCookies, "base64").toString("utf-8");
      const arr: ChromeCookie[] = JSON.parse(decoded);
      if (Array.isArray(arr) && arr.length > 0) return arr.map(toPlaywrightCookie);
    } catch {
      throw new Error("SOUNDCLOUD_COOKIES invalid. Use base64 of cookies JSON.");
    }
  }

  const cookiesPath = path.join(process.cwd(), "cookies.json");
  if (!fs.existsSync(cookiesPath)) {
    throw new Error(
      "Cookies not configured. Set SOUNDCLOUD_COOKIES env or add cookies.json (export from SoundCloud)"
    );
  }

  const raw = fs.readFileSync(cookiesPath, "utf-8");
  const arr: ChromeCookie[] = JSON.parse(raw);
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error("cookies.json is empty or invalid");
  }

  return arr.map(toPlaywrightCookie);
}
