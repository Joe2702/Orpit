# Deploying Orbit online (free)

The app is one deployable web service (the backend serves the frontend and
creates its database tables on boot). You need two free things:

1. **A Postgres database** — e.g. **Neon** (neon.tech): sign up, create a
   project, copy the connection string (`postgresql://...?sslmode=require`).
2. **A host** that builds from this GitHub repo — e.g. **Render** (render.yaml
   blueprint included) or any Node host.

## Render (Blueprint)

1. Render → **New +** → **Blueprint** → connect this repo (it reads `render.yaml`).
2. When prompted, paste your Neon string as **DATABASE_URL**. `JWT_SECRET` is
   generated automatically.
3. Choose the **Free** plan → **Apply**. First build takes ~5–10 minutes.
4. Open the resulting `https://<name>.onrender.com` URL.

## Any other Node host (manual)

- **Build command:** `npm run build`
- **Start command:** `npm start`
- **Environment variables:** `DATABASE_URL` (your Postgres string) and
  `JWT_SECRET` (any long random string).

## Use it

- Open the URL, create your account.
- **Phone icon:** open on your phone → iPhone Safari: Share → *Add to Home
  Screen*; Android Chrome: menu → *Install app*.
- **Share:** send anyone the URL; they make their own account.

> Free hosts often sleep when idle, so the first visit after a quiet period can
> take ~30–60s to wake up.
