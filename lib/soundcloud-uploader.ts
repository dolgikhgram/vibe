import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import os from "os";
import { loadCookies } from "./cookies";

const UPLOAD_URL = "https://soundcloud.com/upload";
const NAV_TIMEOUT = 120_000;
const UPLOAD_TIMEOUT = 300_000; // 5 min для обработки на стороне SoundCloud

const DEBUG = process.env.DEBUG_UPLOAD === "true" || process.env.DEBUG_UPLOAD === "1";
const t0 = () => {
  const start = (globalThis as { _uploadT0?: number })._uploadT0;
  return start ? Math.round((Date.now() - start) / 1000) : 0;
};
const log = (...args: unknown[]) => DEBUG && console.log("[upload]", new Date().toISOString(), "t=" + t0() + "s", ...args);
const errLog = (...args: unknown[]) => console.log("[upload ERROR]", new Date().toISOString(), "t=" + t0() + "s", ...args);
const okLog = (action: string, selector?: string) =>
  console.log("[upload OK]", new Date().toISOString(), "t=" + t0() + "s", "CLICKED:", action, selector || "");

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

  (globalThis as { _uploadT0?: number })._uploadT0 = Date.now();

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

    // Сразу на /upload — cookies уже в context
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

    // SPA: минимальное ожидание рендера
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(2000);
    errLog("page loaded, checking consent");

    // Cookie consent — закрываем быстро
    await page.waitForSelector('iframe[src*="onetrust"], #onetrust-consent-sdk, [id*="onetrust"]', {
      timeout: 5000,
    }).catch(() => null);
    await page.waitForTimeout(500);

    let consentClosed = false;
    for (let attempt = 0; attempt < 3 && !consentClosed; attempt++) {
      if (attempt > 0) await page.waitForTimeout(500);
      const clicked = await page.evaluate(() => {
        const clickBtn = (el: HTMLElement) => {
          el.click();
          return true;
        };
        const findIn = (root: Document | ShadowRoot): boolean => {
          const byId = root.querySelector('#onetrust-accept-btn-handler, #onetrust-reject-all-handler, [id*="onetrust-accept"]');
          if (byId instanceof HTMLElement) return clickBtn(byId);
          for (const tag of ['button', '[role="button"]', 'a', 'span', 'div']) {
            for (const el of root.querySelectorAll(tag)) {
              const text = (el.textContent || '').trim();
              if (/^I Accept$|^Reject All$|^Accept All$/i.test(text) && el instanceof HTMLElement) {
                return clickBtn(el);
              }
            }
          }
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot && findIn(el.shadowRoot)) return true;
          }
          for (const iframe of root.querySelectorAll('iframe')) {
            try {
              const doc = iframe.contentDocument;
              if (doc && findIn(doc)) return true;
            } catch (_) {}
          }
          return false;
        };
        return findIn(document);
      });
      if (clicked) {
        okLog("cookie_consent", "evaluate");
        consentClosed = true;
        await page.waitForTimeout(500);
        break;
      }
    }
    if (!consentClosed) {
      for (const frame of page.frames()) {
        const btn = frame.locator('#onetrust-accept-btn-handler, button:has-text("I Accept"), button:has-text("Reject All")').first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click({ force: true });
          okLog("cookie_consent", "frame_locator");
          consentClosed = true;
          await page.waitForTimeout(500);
          break;
        }
      }
    }
    if (!consentClosed) {
      for (const frame of page.frames()) {
        const el = frame.locator('text="I Accept"').first();
        if (await el.isVisible().catch(() => false)) {
          await el.click({ force: true });
          okLog("cookie_consent", "text_I_Accept");
          consentClosed = true;
          await page.waitForTimeout(500);
          break;
        }
      }
    }
    errLog("consent done");

    const isModalVisible = async () =>
      (await page.getByText(/Level up|Artist Plan|Unlock more tools|Artist Pro/i).first().isVisible().catch(() => false)) ||
      (await page.locator('[role="dialog"]').first().isVisible().catch(() => false));
    const isModalGone = async () => !(await isModalVisible());

    errLog("step: file input (iframe)");
    let filesSet = false;
    let uploadFrame: import("playwright").Frame | null = null;
    for (const frame of page.frames()) {
      const hasConsent = await frame.locator('button:has-text("I Accept"), #onetrust-accept-btn-handler').count() > 0;
      if (hasConsent) continue;
      const count = await frame.locator('input[type="file"]').count();
      if (count > 0) {
        await frame.locator('input[type="file"]').first().setInputFiles(absolutePath);
        filesSet = true;
        uploadFrame = frame;
        okLog("file_input", "iframe");
        break;
      }
    }
    if (!filesSet) {
      return { success: false, error: "File input не найден в iframe. Проверь, что страница upload загрузилась." };
    }
    errLog("file set, closing modal");

    const forceHideModal = async () => {
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('[role="dialog"]')) {
          if ((el as HTMLElement).innerHTML?.includes("Level up")) {
            const root = (el as HTMLElement).parentElement;
            if (root) root.style.cssText = "display:none!important";
          }
        }
      });
    };

    const tryCloseModal = async (): Promise<boolean> => {
      const corners = [[5, 5], [5, 400], [1275, 5], [1275, 400], [640, 5]] as [number, number][];
      for (const [x, y] of corners) {
        await page.mouse.click(x, y);
        await page.waitForTimeout(100);
        if (await isModalGone()) return true;
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
      if (await isModalGone()) return true;
      const clicked = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog?.parentElement) {
          (dialog.parentElement as HTMLElement).click();
          return true;
        }
        return false;
      });
      if (clicked) {
        await page.waitForTimeout(150);
        if (await isModalGone()) return true;
      }
      await forceHideModal();
      await page.waitForTimeout(150);
      return await isModalGone();
    };

    for (let i = 0; i < 3; i++) {
      if (await isModalGone()) break;
      await tryCloseModal();
    }

    errLog("step: file input again (Choose file / drag-drop, after modal closed)");
    await page.waitForTimeout(800);
    let filesSetAgain = false;

    const fileName = path.basename(absolutePath);
    const fileBuffer = fs.readFileSync(absolutePath);
    const fileBase64 = fileBuffer.toString("base64");
    const mimeType = fileName.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "application/octet-stream";
    const dataUrl = `data:${mimeType};base64,${fileBase64}`;

    const dropSelectors = [
      '[data-drop-zone], [data-testid*="drop"], [data-testid*="upload"]',
      '[class*="DropZone"], [class*="drop-zone"], .dropZone',
    ];

    const tryFrame = async (frame: import("playwright").Frame) => {
      const hasConsent = await frame.locator('button:has-text("I Accept"), #onetrust-accept-btn-handler').count() > 0;
      if (hasConsent) return false;
      const input = frame.locator('input[type="file"]').first();
      if (await input.count() > 0) {
        try {
          await input.setInputFiles(absolutePath);
          return true;
        } catch (_) {}
      }
      for (const sel of dropSelectors) {
        const el = frame.locator(sel).first();
        if (await el.count() === 0) continue;
        try {
          const dropped = await frame.evaluate(
            async (opts: { dataUrl: string; name: string; type: string; selector: string }) => {
              const target = document.querySelector(opts.selector);
              if (!target) return false;
              const dt = new DataTransfer();
              const res = await fetch(opts.dataUrl);
              const blob = await res.blob();
              const file = new File([blob], opts.name, { type: opts.type });
              dt.items.add(file);
              const optsEv = { dataTransfer: dt, bubbles: true };
              target.dispatchEvent(new DragEvent("dragenter", optsEv));
              target.dispatchEvent(new DragEvent("dragover", { ...optsEv, cancelable: true }));
              target.dispatchEvent(new DragEvent("drop", optsEv));
              return true;
            },
            { dataUrl, name: fileName, type: mimeType, selector: sel }
          );
          if (dropped) return true;
        } catch (_) {}
      }
      return false;
    };

    const framesToTry = uploadFrame ? [uploadFrame, ...page.frames().filter((f) => f !== uploadFrame)] : page.frames();
    for (const frame of framesToTry) {
      const hasConsent = await frame.locator('button:has-text("I Accept"), #onetrust-accept-btn-handler').count() > 0;
      if (hasConsent) continue;
      const fileChooserPromise = page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null);
      const chooseBtn = frame.getByText(/Choose files?|Select files?|choose files?|select files?/i).first();
      if (await chooseBtn.isVisible().catch(() => false)) {
        await chooseBtn.click({ force: true });
      } else {
        const fileInput = frame.locator('input[type="file"]').first();
        if (await fileInput.count() > 0) await fileInput.click({ force: true });
      }
      const chooser = await fileChooserPromise;
      if (chooser) {
        await chooser.setFiles(absolutePath);
        filesSetAgain = true;
        okLog("file_input", "choose_click_after_modal");
        break;
      }
    }

    if (!filesSetAgain && uploadFrame && (await tryFrame(uploadFrame))) {
      filesSetAgain = true;
      okLog("file_input", "iframe_input_after_modal");
    }
    if (!filesSetAgain) {
      for (const frame of page.frames()) {
        if (frame === uploadFrame) continue;
        if (await tryFrame(frame)) {
          filesSetAgain = true;
          okLog("file_input", "iframe_input_after_modal");
          break;
        }
      }
    }

    if (!filesSetAgain) {
      const mainInput = page.locator('input[type="file"]').first();
      if (await mainInput.count() > 0) {
        await mainInput.setInputFiles(absolutePath);
        filesSetAgain = true;
        okLog("file_input", "main_after_modal");
      }
    }
    await page.waitForTimeout(8000);

    if (await isModalVisible()) {
      errLog("modal_sub: retry before Upload");
      for (let i = 0; i < 3; i++) {
        await tryCloseModal();
        if (await isModalGone()) break;
      }
      await page.waitForTimeout(500);
    }

    const saveBtn = await page
      .waitForSelector('button.MuiButton-containedSuccess:has-text("Upload"), button:has-text("Upload"), button:has-text("Save"), button:has-text("Publish"), [data-testid="save-button"]', {
        timeout: 120_000,
      })
      .catch(() => null);
    if (!saveBtn) errLog("Upload button not found after 120s");
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

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
      'button.MuiButton-containedSuccess:has-text("Upload")',
      'button.MuiButton-root:has-text("Upload")',
      'button:has-text("Upload")',
      'button:has-text("Save to SoundCloud")',
      'button:has-text("Save")',
      'button:has-text("Publish")',
      'button:has-text("Сохранить")',
      'a:has-text("Save to SoundCloud")',
      'a:has-text("Save")',
      'a:has-text("Publish")',
      '[data-testid="save-button"]',
      'button[type="submit"]',
    ];

    const clickUploadBtn = async (loc: import("playwright").Page | import("playwright").Frame) => {
      for (const sel of saveSelectors) {
        const btn = loc.locator(sel).first();
        if (await btn.isVisible()) {
          await btn.scrollIntoViewIfNeeded().catch(() => {});
          await btn.click({ force: true });
          return sel;
        }
      }
      return null;
    };

    let saved = false;
    const clickedSel = await clickUploadBtn(page);
    if (clickedSel) {
      saved = true;
      okLog("upload_button", clickedSel);
    }
    if (!saved) {
      for (const frame of page.frames()) {
        const hasConsent = await frame.locator('button:has-text("I Accept"), #onetrust-accept-btn-handler').count() > 0;
        if (hasConsent) continue;
        const sel = await clickUploadBtn(frame);
        if (sel) {
          saved = true;
          okLog("upload_button", "frame:" + sel);
          break;
        }
      }
    }
    if (!saved) {
      for (const loc of [page, ...page.frames()]) {
        const byRole = loc.getByRole("button", { name: /upload|save|publish|сохранить|soundcloud/i });
        if (await byRole.first().isVisible().catch(() => false)) {
          await byRole.first().scrollIntoViewIfNeeded().catch(() => {});
          await byRole.first().click({ force: true });
          saved = true;
          okLog("upload_button", "getByRole");
          break;
        }
      }
    }
    if (!saved) {
      const linkRole = page.getByRole("link", { name: /save|publish|upload/i });
      if (await linkRole.isVisible()) {
        await linkRole.first().click({ force: true });
        saved = true;
        okLog("save_button", "getByRole link");
      }
    }

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
