import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import os from "os";
import { loadCookies } from "./cookies";

const UPLOAD_URL = "https://soundcloud.com/upload";
const NAV_TIMEOUT = 120_000;
const UPLOAD_TIMEOUT = 300_000; // 5 min для обработки на стороне SoundCloud

const DEBUG = process.env.DEBUG_UPLOAD === "true" || process.env.DEBUG_UPLOAD === "1";
const log = (...args: unknown[]) => DEBUG && console.log("[upload]", new Date().toISOString(), ...args);
const errLog = (...args: unknown[]) => console.log("[upload ERROR]", new Date().toISOString(), ...args);

export interface UploadResult {
  success: true;
  url: string;
  trackId?: string;
}

export interface UploadError {
  success: false;
  error: string;
}

export type UploadResponse = UploadResult | UploadError;

const CHROMIUM_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-blink-features=AutomationControlled",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-software-rasterizer",
  "--disable-extensions",
  "--no-first-run",
  "--no-zygote",
  "--disable-background-networking",
  "--disable-default-apps",
  "--disable-sync",
  "--disable-translate",
  "--metrics-recording-only",
  "--mute-audio",
  "--no-default-browser-check",
  "--proxy-bypass-list=*",
  "--no-proxy-server",
];

export async function uploadToSoundCloud(
  options: { filePath: string; title?: string }
): Promise<UploadResponse> {
  const { filePath, title } = options;

  if (!fs.existsSync(filePath)) {
    return { success: false, error: "File not found" };
  }

    const cookies = loadCookies();
    const cookieNames = cookies.map((c) => c.name);
    const hasOauth = cookies.some((c) => c.name === "oauth_token");
    errLog("cookies", "count=" + cookies.length, "names=" + cookieNames.join(","), "oauth_token=" + hasOauth);
    if (hasOauth) {
      const oauth = cookies.find((c) => c.name === "oauth_token");
      errLog("oauth_token domain=" + oauth?.domain, "valueLen=" + (oauth?.value?.length ?? 0));
    }
    const absolutePath = path.resolve(filePath);
  const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;

  // В Docker с Xvfb — headed обходит DataDome (SoundCloud)
  const inDocker = fs.existsSync("/.dockerenv");
  const headless = !(process.env.HEADED === "true" || inDocker);
  const useChrome = process.env.USE_SYSTEM_CHROME === "true" && !fs.existsSync("/.dockerenv");
  log("launch", { headless, useChrome, fileSize: fs.statSync(filePath).size });

  const launchOpts = {
    headless,
    args: proxy ? CHROMIUM_ARGS.filter((a) => a !== "--no-proxy-server") : CHROMIUM_ARGS,
    proxy: proxy ? { server: proxy } : undefined,
    timeout: 30_000,
  };

  let browser;
  if (useChrome) {
    try {
      browser = await chromium.launch({ ...launchOpts, channel: "chrome" });
      log("using Chrome");
    } catch {
      browser = await chromium.launch(launchOpts);
      log("Chrome failed, using Chromium");
    }
  } else {
    browser = await chromium.launch(launchOpts);
  }

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
      locale: "en-US",
      timezoneId: "America/New_York",
    });

    // Playwright: при url не передавать path — иначе "Cookie should have either url or path"
    const cookiesForPlaywright = cookies.map(({ name, value, expires, httpOnly, secure, sameSite }) => ({
      name,
      value,
      url: "https://soundcloud.com",
      expires: expires ?? 9999999999,
      httpOnly: httpOnly ?? false,
      secure: secure ?? false,
      sameSite: sameSite ?? "Lax",
    }));
    await context.addCookies(cookiesForPlaywright);

    const page = await context.newPage();

    // Сначала главная — чтобы cookies применились
    log("goto home");
    await page.goto("https://soundcloud.com", {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    }).catch(() => {});
    await page.waitForTimeout(3000);

    // Проверка сессии: /you — только для залогиненных
    log("goto /you");
    await page.goto("https://soundcloud.com/you", {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    }).catch(() => {});
    await page.waitForTimeout(2000);
    const youUrl = page.url();
    log("you url", youUrl);
    if (youUrl.includes("/welcome") || youUrl.includes("/signin") || youUrl.includes("/login")) {
      return {
        success: false,
        error:
          "Cookies не работают — SoundCloud не видит сессию. Зайди на soundcloud.com в Chrome, залогинься, установи EditThisCookie, экспортируй cookies (Export → JSON), запусти npm run encode-cookies и обнови SOUNDCLOUD_COOKIES в Railway.",
      };
    }

    log("goto", UPLOAD_URL);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(UPLOAD_URL, {
          waitUntil: "load",
          timeout: NAV_TIMEOUT,
        });
        log("goto ok, attempt", attempt);
        break;
      } catch (e) {
        log("goto fail attempt", attempt, e);
        if (attempt === 3) throw e;
        await page.waitForTimeout(2000 * attempt);
      }
    }

    let url = page.url();
    log("current url", url);

    if (url.includes("/signin") || url.includes("/login")) {
      return {
        success: false,
        error: "Сессия истекла. Экспортируй свежие cookies с soundcloud.com",
      };
    }

    // /welcome = не залогинен, cookies не работают
    if (url.includes("/welcome")) {
      return {
        success: false,
        error:
          "Редирект на /welcome — cookies невалидны или истекли. Зайди на soundcloud.com в браузере, залогинься, экспортируй cookies через EditThisCookie и обнови SOUNDCLOUD_COOKIES в Railway.",
      };
    }

    // SPA: ждём полной загрузки и рендера
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(8000);

    // Клик по зоне загрузки — может показать скрытый input
    const dropZoneSelectors = [
      '[data-testid="upload-dropzone"]',
      '[data-drop-zone]',
      'label[for*="file"]',
      'button:has-text("Choose"), button:has-text("Select"), button:has-text("Upload")',
      'a:has-text("Choose"), a:has-text("Upload")',
      '[role="button"]:has-text("Upload")',
      '.upload-area, .drop-zone, [class*="Upload"]',
    ];
    for (const sel of dropZoneSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        await el.hover().catch(() => {});
        await el.click().catch(() => {});
        await page.waitForTimeout(2000);
        log("clicked drop zone", sel);
        break;
      }
    }

    log("wait file input");
    const fileInput = page.locator('input[type="file"]').first();
    try {
      await fileInput.waitFor({ state: "attached", timeout: 45_000 });
    } catch (e) {
      const count = await page.locator('input[type="file"]').count();
      errLog("file input not found, count=", count);
      if (DEBUG) {
        const screenshotPath = path.join(os.tmpdir(), `soundcloud-upload-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath }).catch(() => {});
        errLog("screenshot", screenshotPath);
      }
      throw e;
    }
    log("set files");
    await fileInput.setInputFiles(absolutePath);
    log("wait for form");
    await page.waitForTimeout(5000);

    const saveBtn = await page
      .waitForSelector('button:has-text("Save"), button:has-text("Publish"), [data-testid="save-button"]', {
        timeout: 120_000,
      })
      .catch(() => null);
    if (!saveBtn) errLog("Save button not found after 120s");
    await page.waitForTimeout(2000);

    if (title) {
      const titleSelectors = [
        'input[placeholder*="Title"]',
        'input[name*="title"]',
        'input[aria-label*="title"]',
        'input[placeholder*="Title"]',
      ];
      for (const sel of titleSelectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible()) {
          await el.fill(title);
          break;
        }
      }
    }

    const saveSelectors = [
      'button:has-text("Save")',
      'button:has-text("Publish")',
      'button:has-text("Upload")',
      'button:has-text("Сохранить")',
      'a:has-text("Save")',
      'a:has-text("Publish")',
      '[data-testid="save-button"]',
      'button[type="submit"]',
    ];

    let saved = false;
    for (const sel of saveSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible()) {
        await btn.click();
        saved = true;
        log("clicked", sel);
        break;
      }
    }
    if (!saved) {
      const byRole = page.getByRole("button", { name: /save|publish|upload|сохранить/i });
      if (await byRole.isVisible()) {
        await byRole.first().click();
        saved = true;
      }
    }
    if (!saved) {
      const linkRole = page.getByRole("link", { name: /save|publish/i });
      if (await linkRole.isVisible()) {
        await linkRole.first().click();
        saved = true;
      }
    }
    log("save clicked, saved=", saved);

    const checkSuccess = async (): Promise<string | null> => {
      const u = page.url();
      if (u.includes("/tracks/")) return u;
      const link = await page.locator('a[href*="/tracks/"]').first();
      if (await link.isVisible()) {
        const href = await link.getAttribute("href");
        return href?.startsWith("http") ? href : `https://soundcloud.com${href || ""}`;
      }
      return null;
    };

    log("wait for success, timeout", UPLOAD_TIMEOUT / 1000, "s");
    const start = Date.now();
    while (Date.now() - start < UPLOAD_TIMEOUT) {
      const result = await checkSuccess();
      if (result) {
        log("found url", result);
        return {
          success: true,
          url: result,
          trackId: result.match(/\/tracks\/(\d+)/)?.[1],
        };
      }
      await page.waitForTimeout(5000);
      log("poll, elapsed", Math.round((Date.now() - start) / 1000), "s");
    }

    const finalUrl = page.url();
    errLog("timeout, final url", finalUrl, "saved=", saved);
    if (finalUrl.includes("/tracks/") || finalUrl.includes("/you/")) {
      return {
        success: true,
        url: finalUrl,
        trackId: finalUrl.match(/\/tracks\/(\d+)/)?.[1],
      };
    }

    return {
      success: false,
      error: `Таймаут. URL: ${finalUrl.slice(0, 80)}... Логи: Railway → Deployments → View Logs`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errLog("catch", msg);
    let errorMsg = msg;

    if (msg.includes("ERR_CONNECTION_REFUSED") || msg.includes("net::ERR")) {
      errorMsg = "Нет доступа к SoundCloud. Проверь интернет, VPN, firewall.";
    } else if (msg.includes("kCFError") || msg.includes("310")) {
      errorMsg = "Ошибка сети. Отключи системный прокси или задай HTTP_PROXY.";
    } else if (msg.includes("timeout") || msg.includes("Timeout")) {
      const isGoto = msg.includes("page.goto") || msg.includes("navigating");
      errorMsg = isGoto
        ? "Не удалось открыть soundcloud.com. Локально: USE_SYSTEM_CHROME=true или деплой на Railway."
        : "Таймаут ожидания трека. DEBUG_UPLOAD=true для логов.";
    }

    return { success: false, error: errorMsg };
  } finally {
    await browser.close();
  }
}
