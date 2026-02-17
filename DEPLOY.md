# Деплой на Railway — пошагово

## Шаг 1: Cookies

```bash
cd vibe
npm run encode-cookies
```

Скопируй всю строку (base64). Она понадобится в шаге 4.

## Шаг 2: GitHub

Если репозитория ещё нет:

```bash
cd /Users/user/Documents/vibe/vibe
git init
git add .
git commit -m "SoundCloud upload"
```

Создай репо на github.com → New repository. Затем:

```bash
git remote add origin https://github.com/TVOJ_USER/TVOJ_REPO.git
git branch -M main
git push -u origin main
```

## Шаг 3: Railway

1. Открой [railway.app](https://railway.app)
2. **Login** через GitHub
3. **New Project**
4. **Deploy from GitHub repo**
5. Выбери свой репозиторий
6. Если проект в подпапке `vibe` — **Settings** → **Root Directory** → `vibe`

## Шаг 4: Переменные

1. В проекте Railway открой **Variables**
2. **Add Variable**:
   - `SOUNDCLOUD_COOKIES` = base64 из шага 1
3. Для отладки (логи в Deployments):
   - `DEBUG_UPLOAD` = `true`
4. Сохрани

**Важно:** Cookies экспортируй только когда **залогинен** на soundcloud.com. В экспорте должен быть `oauth_token`. Если редирект на /welcome — cookies невалидны, переэкспортируй.

## Шаг 5: Домен

1. **Settings** → **Networking** → **Generate Domain**
2. Скопируй ссылку вида `https://vibe-production-xxxx.up.railway.app`

## Проверка

1. `https://ТВОЙ-ДОМЕН.railway.app/api/health` — должен вернуть `{"ok":true}`
2. `https://ТВОЙ-ДОМЕН.railway.app/api/status` — проверка cookies (`cookies: true` если ок)

## Логи

**Deployments** → выбери последний деплой → **View Logs**. Там будут `[upload]` логи. Добавь переменную `DEBUG_UPLOAD=true` для подробных логов.

## Готово

Открой ссылку в браузере. Загрузи MP3 — загрузка идёт на сервере Railway, сеть стабильная.
