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
  const absolutePath = path.resolve(filePath);
  const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;

  const headless = process.env.HEADED !== "true";
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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
    });

    await context.addCookies(cookies);

    const page = await context.newPage();

    log("goto", UPLOAD_URL);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(UPLOAD_URL, {
          waitUntil: "domcontentloaded",
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

    const url = page.url();
    log("current url", url);
    if (url.includes("/signin") || url.includes("/login")) {
      return {
        success: false,
        error: "Сессия истекла. Экспортируй свежие cookies с soundcloud.com",
      };
    }

    log("wait file input");
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.waitFor({ state: "attached", timeout: 15_000 });
    log("set files");
    await fileInput.setInputFiles(absolutePath);
    log("wait 5s after file");
    await page.waitForTimeout(5000);

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
      '[data-testid="save-button"]',
      'button[type="submit"]',
    ];

    let saved = false;
    for (const sel of saveSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible()) {
        await btn.click();
        saved = true;
        break;
      }
    }
    if (!saved) {
      const byRole = page.getByRole("button", { name: /save|publish|upload|сохранить/i });
      if (await byRole.isVisible()) await byRole.first().click();
    }
    log("save clicked, saved=", saved);

    log("wait track link, timeout", UPLOAD_TIMEOUT / 1000, "s");
    const trackLink = await page
      .waitForSelector('a[href*="/tracks/"]', { timeout: UPLOAD_TIMEOUT })
      .catch(async (e) => {
        log("track link timeout", (e as Error)?.message);
        if (DEBUG) {
          const screenshotPath = path.join(os.tmpdir(), `soundcloud-timeout-${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath }).catch(() => {});
          log("screenshot saved", screenshotPath);
        }
        return null;
      });

    if (trackLink) {
      const href = await trackLink.getAttribute("href");
      const trackUrl = href?.startsWith("http") ? href : `https://soundcloud.com${href || ""}`;
      const trackId = trackUrl.match(/\/tracks\/(\d+)/)?.[1];
      return { success: true, url: trackUrl, trackId };
    }

    const finalUrl = page.url();
    if (finalUrl.includes("/tracks/") || finalUrl.includes("/you/")) {
      return {
        success: true,
        url: finalUrl,
        trackId: finalUrl.match(/\/tracks\/(\d+)/)?.[1],
      };
    }

    return {
      success: false,
      error: "Загрузка завершена, но ссылка на трек не найдена",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
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
