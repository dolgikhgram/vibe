# SoundCloud Upload

Загрузка MP3 на SoundCloud через Playwright (без официального API). Один раз экспортируешь cookies — делишься ссылкой, все загружают на твой аккаунт.

## Настройка

### 1. Cookies

1. Войди на [soundcloud.com](https://soundcloud.com) в браузере
2. Расширение **EditThisCookie** или **Cookie-Editor** → экспорт cookies в JSON
3. Сохрани как `cookies.json` в корне проекта

### 2. Для деплоя

```bash
npm run encode-cookies
```

Скопируй вывод и задай переменную **SOUNDCLOUD_COOKIES** в Railway/Render.

## Локально

```bash
npm install
npx playwright install chromium
npm run dev
```

Открой http://localhost:3000

## Деплой на Railway

### 1. Подготовка cookies

```bash
npm run encode-cookies
```

Скопируй вывод (длинная base64 строка).

### 2. Репозиторий

Убедись, что код в GitHub. Если нет:

```bash
cd vibe
git init
git add .
git commit -m "SoundCloud upload"
git branch -M main
git remote add origin https://github.com/TVOJ_USER/TVOJ_REPO.git
git push -u origin main
```

### 3. Railway

1. [railway.app](https://railway.app) → **Login** (через GitHub)
2. **New Project** → **Deploy from GitHub repo**
3. Выбери репозиторий, папку `vibe` (если проект в подпапке)
4. **Variables** → **Add Variable**:
   - `SOUNDCLOUD_COOKIES` = вставь base64 из шага 1
5. **Deploy** запустится автоматически
6. **Settings** → **Generate Domain** → получишь ссылку `https://xxx.railway.app`

### 4. Root Directory (если проект в подпапке)

Если в репо есть папка `vibe` с проектом: **Settings** → **Root Directory** → `vibe`

### 5. Готово

Открой ссылку, загрузи MP3 — всё работает на сервере, без локальных проблем с сетью.

## Docker

```bash
docker build -t vibe .
docker run -p 3000:3000 -e SOUNDCLOUD_COOKIES="<base64>" vibe
```

## API

```
POST /api/upload
Content-Type: multipart/form-data

file — MP3, до 500 MB
title — опционально
```

Ответ: `{ success: true, url: "https://soundcloud.com/..." }`

## Отладка (локально)

**Таймаут при открытии soundcloud.com** — Chromium не может достучаться. Попробуй:

```bash
USE_SYSTEM_CHROME=true npm run dev
```

Использует установленный Chrome — у него тот же доступ к сети, что и у обычного браузера.

```bash
DEBUG_UPLOAD=true npm run dev
```

Логи в консоли. При таймауте — скриншот в `/tmp/soundcloud-timeout-*.png`.

```bash
HEADED=true npm run dev
```

Видимый браузер — смотришь процесс загрузки.

## Ошибки

- **Сессия истекла** — экспортируй свежие cookies
- **Таймаут** — локально часто нестабильно. Деплой на Railway обычно решает.
- **ERR_CONNECTION_REFUSED** — проверь VPN, firewall, интернет
- **Ошибка 310** — отключи системный прокси или задай `HTTP_PROXY`
