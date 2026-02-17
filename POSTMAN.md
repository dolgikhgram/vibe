# Тест API в Postman

## 1. Проверка cookies (GET)

**URL:** `https://твой-домен.railway.app/api/status`  
**Method:** GET

**Ожидаемый ответ:**
```json
{
  "app": "ok",
  "cookies": true,
  "cookiesSource": "env"
}
```

Если `cookies: false` — SOUNDCLOUD_COOKIES невалидны или base64 сломан.

---

## 2. Проверка health (GET)

**URL:** `https://твой-домен.railway.app/api/health`  
**Method:** GET

**Ожидаемый ответ:** `{"ok":true}`

---

## 3. Загрузка MP3 (POST)

**URL:** `https://твой-домен.railway.app/api/upload`  
**Method:** POST  
**Body:** form-data

| Key   | Type | Value        |
|-------|------|--------------|
| file  | File | выбери MP3   |
| title | Text | (опционально)|

**Ожидаемый успех:**
```json
{
  "success": true,
  "url": "https://soundcloud.com/...",
  "trackId": "123456"
}
```

**Текущая ошибка (cookies не работают):**
```json
{
  "success": false,
  "error": "Cookies не работают — SoundCloud не видит сессию..."
}
```

---

## Что даёт Postman

- Подтверждает, что бэкенд доступен
- Показывает, что `/api/status` видит cookies
- Позволяет воспроизвести запрос без UI

**Postman не решит проблему с /welcome** — это происходит внутри Playwright на стороне SoundCloud. Но он покажет, доходят ли cookies до приложения.

---

## План действий для решения проблемы

### Шаг 1: Postman — проверка cookies
1. `GET /api/status` — если `cookies: true`, base64 и формат ок
2. Если `cookies: false` — переэкспортируй cookies, запусти `npm run encode-cookies`, обнови SOUNDCLOUD_COOKIES в Railway

### Шаг 2: Локальный тест с видимым браузером
```bash
cd vibe
HEADED=true DEBUG_UPLOAD=true npm run dev
```
Открой http://localhost:3000, загрузи MP3. Увидишь браузер — поймёшь, что показывает SoundCloud (welcome или upload).

### Шаг 3: Логи Railway
После загрузки смотри Deploy Logs:
- `cookies count=... oauth_token=true` — cookies загружены
- `you url https://soundcloud.com/welcome` — редирект, cookies не принимаются

### Шаг 4: Если всё ещё /welcome
SoundCloud может блокировать headless. Варианты:
- Экспортируй cookies снова, сразу после входа (свежие)
- Попробуй другой аккаунт SoundCloud
- Используй `USE_SYSTEM_CHROME=true` локально (на Railway не применимо)
