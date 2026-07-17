# Future Project Status

> Persistent handoff for future Codex sessions. Read this file together with the latest Git status and commit history before continuing.

Last updated: 2026-07-17 (Asia/Taipei)

## Resume snapshot

- Official website: <https://future-planner.claireeek.com/>
- GitHub: <https://github.com/claowennie/future-deploy>
- Production Worker: `future-planner`
- Current branch: `main`
- Latest product change before this handoff: `dd7f1bb` — `Rename Chinese product title`
- Latest verified Worker version: `661bf07f-83b8-4c20-b0d6-968265bbd8df`
- Public contact: `claowennie@gmail.com`
- Working tree was clean when this handoff was created.

The product is live. The next product-facing milestone is preparing the short demonstration video, after confirming the Supabase Auth production URL settings described below.

## Product positioning

Future is a bilingual personal growth operating system that connects long-term goals, daily action, focus, reflection, habits, notes, and the Melo AI music companion into one continuous growth loop.

The primary product story is:

```text
Long-term direction → today's action → focused execution → reflection → visible growth
                                                    ↘ Melo music companion
```

The README is structured as the formal product entry for visitors who want to try the product, understand its evolution, or inspect its architecture and local setup.

## Repositories and directories

### Main public repository

```text
D:\谷歌下载\future-deploy
```

- React/Vite frontend
- Cloudflare Worker API and Static Assets deployment
- Supabase migrations and documentation
- Tests, screenshots, README, and public Companion download
- Git remote: `https://github.com/claowennie/future-deploy.git`

### Companion packaging source

```text
D:\谷歌下载\future-companion
```

- Local Node.js bridge for NetEase Cloud Music playback
- Listens on `127.0.0.1:45731`
- Not currently a Git repository
- Do not package `.future-companion/`, cookies, pairing tokens, App Private Keys, API keys, or user audio

## Production architecture

```text
Browser / installed PWA
  ├─ React 18 + Vite 8 UI
  ├─ Supabase Auth, Postgres/RLS, Realtime, private Storage
  ├─ YouTube official embedded player
  ├─ Browser speechSynthesis (default free voice)
  ├─ Optional Future Companion on 127.0.0.1
  └─ Cloudflare Worker /api/*
       ├─ validates Supabase user identity
       ├─ reads user-scoped data through JWT + RLS
       ├─ validates structured Melo/DeepSeek output
       ├─ handles optional Google or MiniMax TTS
       └─ applies per-account/route rate limiting
```

Core stack: React, Vite, JavaScript, CSS, PWA, Cloudflare Workers and Static Assets, Wrangler, Supabase Auth/Postgres/RLS/Realtime/Storage, DeepSeek BYOK, Google Chirp 3 HD BYOK, MiniMax Speech BYOK, Web Speech API, YouTube IFrame API, Node.js, `@music163/ncm-cli`, and mpv.

## Stable product decisions

### Language

- New visitors with no `locale_v1` preference always start in Chinese.
- Users who explicitly select English keep that saved preference.
- Chinese browser/PWA title: `future · 个人成长规划`.
- English runtime title: `future · Personal Growth Planner`.
- Website UI language and Melo voice language are separate controls. Changing Melo between Chinese and English must not change the website UI.

### Melo voice

- Default provider: free browser speech.
- Optional BYOK providers: Google Chirp 3 HD and MiniMax.
- API keys are kept only in the current tab/session and must not be stored in Supabase, Worker configuration, logs, or build output.
- Chinese and English voices are selectable independently.

### Player and volume

- Melo speaks the opening and first-track introduction before playback.
- The displayed player state must follow real playback, including automatic track transitions.
- Selecting a playlist item triggers its introduction before playing it.
- Play/pause remains on the left in the compact player layout.
- The volume button sits to its right; the slider appears only when the volume button is activated.
- Volume changes continuously while dragging and uses a perceptually useful curve.

### Privacy and local playback

- User rows and private audio are isolated with Supabase RLS.
- Browser and cloud TTS receive only the text required for synthesis.
- Future Companion accepts only paired, allowlisted commands and keeps NetEase credentials/audio local.
- The old `workers.dev` origin is retained in Companion v0.6.2 only for migration compatibility.

## Completed iteration history

### Planning and core product

- Built Today / Week / Month / Year planning, annual OKRs, recurring tasks, habits, Pomodoro focus, ambient sound, reflections, success journal, notes, seasonal growth tree, time-of-day lighting, immersive mode, mobile responsiveness, and PWA support.
- Added Supabase authentication, cross-device sync, RLS isolation, private audio storage, export, self-service account deletion, and optional push support.
- Added complete Chinese and English UI coverage and made Settings internally scrollable with the scrollbar inset inside the modal frame.
- Updated the public contact email to `claowennie@gmail.com`.

### Melo radio and playback

- Rebuilt Melo as a deployable AI radio experience with structured recommendations and narrated track introductions.
- Added private Supabase audio, YouTube playlists, and the NetEase local Companion as separate music sources.
- Fixed queue construction, playable-track matching, same-title cover avoidance, artist diversity, introduction timing, player-state synchronization, real track-end detection, and automatic next-track playback.
- Fixed the state where music was audible but the player still displayed “not playing”.
- Added live volume control and refined the compact control layout.
- Separated website UI language from Melo voice language.

### Voice providers

- Added browser speech, Google Chirp 3 HD, and MiniMax BYOK voice configuration.
- Browser speech is the default.
- Added Chinese/English voice choices, actionable TTS test feedback, MiniMax error mapping, cloud-speech playback unlock handling, and privacy documentation.

### Public launch and deployment

- Hardened security headers, same-origin/API checks, rate limits, runtime configuration, CI checks, and Cloudflare deployment.
- Reworked the README into the formal product entry: About, Core Features, Product Journey, What I Built, Tech Stack, Architecture, Local Development, Deployment, and Roadmap.
- Removed recruiter-specific wording from Roadmap and refocused it on product reliability and evolution.
- Bound the Worker to `future-planner.claireeek.com` and kept `workers.dev` available as a migration fallback.
- Updated canonical metadata, Open Graph URL/title, README links, deployment docs, and GitHub repository Website.
- Changed the default UI from browser-language detection to Chinese-first while preserving saved English preferences.

## Future Companion release

Current public release: `v0.6.2`

Download:

<https://future-planner.claireeek.com/downloads/future-companion-windows-v0.6.2.zip>

```text
Size:    15,615 bytes
SHA-256: 0F608BEEAFAB4BCD3F11ABE2993C6A2A2318D329628C57FD08DBAA29A76880AE
```

Default allowed website origins in v0.6.2:

```text
https://future-planner.claireeek.com
https://future-planner.claowennie.workers.dev
http://localhost:5173
http://127.0.0.1:5173
```

Users running v0.6.0 must download v0.6.2 before connecting from the custom domain, because v0.6.0 does not allow the new origin.

When releasing another Companion version:

1. Update the source version and allowed origins in `D:\谷歌下载\future-companion`.
2. Run its tests.
3. Package only the public source/scripts under a versioned top-level folder.
4. Add the ZIP to `public/downloads/`.
5. Update the filename, version copy, headers, size, and SHA-256 in the main app, tests, and README.
6. Run the complete main-repository check and verify the downloaded production hash.

## External configuration to confirm

Cloudflare custom-domain routing is complete. Supabase Auth URL settings could not be verified from the previous session because the signed-in browser-control connection was unavailable.

Before considering domain migration fully closed, confirm in Supabase:

```text
Authentication → URL Configuration

Site URL:
https://future-planner.claireeek.com

Redirect URLs:
https://future-planner.claireeek.com/**
https://future-planner.claowennie.workers.dev/**
http://localhost:5173/**
```

Keep the old production origin temporarily so existing email confirmation and password-reset links do not break during migration.

## Demonstration video plan

Target length: 90–120 seconds. The video should tell one complete story instead of listing every feature.

Recommended sequence:

1. `0–8s` — seasonal home, time-of-day lighting, growth tree.
2. `8–20s` — Year → Month → Week → Today, showing long-term goals reaching daily action.
3. `20–45s` — create/organize a task and complete a habit.
4. `45–65s` — start Pomodoro and enter immersive mode.
5. `65–82s` — finish work, write Reflection, show growth feedback.
6. `82–105s` — ask Melo for quiet focus music; show introduction, playback, and transition.
7. `105–115s` — bilingual UI, sync, privacy/BYOK flashes.
8. `115–120s` — Future logo, official domain, and GitHub.

Primary message: Future turns long-term direction into today's action, then closes the loop through focus and reflection. Melo is the memorable supporting differentiator.

Use a prepared demo account, hide email/API keys, record at 1920×1080, avoid long real-time typing, add subtitles, and use only copyright-safe audio. Prepare an English-UI/English-subtitle export for GitHub and a Chinese version for domestic platforms if needed.

## Current roadmap and known follow-ups

- Confirm Supabase Auth Site URL and redirect allowlist for the custom domain.
- Record and publish the two-minute product demo and concise iteration Case Study.
- Improve first-load feedback, weak-network recovery, and error fallback to reduce perceived blank screens.
- Split or reduce the large initial JavaScript/CSS assets where practical.
- Upgrade Future Companion to a signed installer with dependency checks, diagnostics, and automatic updates.
- Add a limited no-key Melo experience when usage economics allow it.
- Improve Melo recommendation feedback, queue editing, and long-term taste evolution.
- Expand end-to-end tests, accessibility checks, production alerts, offline behavior, push reliability, and sync-conflict UX.

## Verification and release workflow

From `D:\谷歌下载\future-deploy`:

```powershell
npm run check
npm run deploy
```

`npm run check` covers ESLint, date/merge/i18n/Melo/Companion-package tests, Worker syntax checks, and a production Vite build.

After deployment, verify at minimum:

- `/` returns 200 and contains the current title/canonical URL.
- `/api/runtime-config.js` returns 200 without exposing private secrets.
- login, signup, email confirmation, password reset, sync, and account deletion.
- Melo chat, browser voice, configured cloud TTS, YouTube, and private audio.
- Companion pairing, state synchronization, volume, automatic next track, and the versioned ZIP hash.
- mobile layout, PWA/service-worker refresh, and language switching.

Then commit only intended changes and push `main`. Never use destructive Git commands against unrelated user changes.

## Security reminders

- `.env.local` and `.env.worker` contain environment configuration. Never quote their values in chat or documentation.
- Never commit DeepSeek, Google, MiniMax, Supabase service-role, Cloudflare, NetEase, or Companion secrets.
- Supabase public URL/publishable configuration may be shipped to the browser, but private credentials must not be.
- Treat `D:\谷歌下载\future-companion\.future-companion` as private runtime data and never include it in a release ZIP.
