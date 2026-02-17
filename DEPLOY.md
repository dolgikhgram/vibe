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

## Шаг 4: Переменная

1. В проекте Railway открой **Variables**
2. **Add Variable**
3. Name: `SOUNDCLOUD_COOKIES`
4. Value: вставь base64 из шага 1
5. Сохрани

## Шаг 5: Домен

1. **Settings** → **Networking** → **Generate Domain**
2. Скопируй ссылку вида `https://vibe-production-xxxx.up.railway.app`

## Готово

Открой ссылку в браузере. Загрузи MP3 — загрузка идёт на сервере Railway, сеть стабильная.
