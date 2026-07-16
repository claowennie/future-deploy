# Future project continuity

When the user says “回到 Future 项目”, “继续 Future”, or otherwise resumes work on this product:

1. Read [`docs/PROJECT_STATUS.md`](./docs/PROJECT_STATUS.md) completely before changing code.
2. Check `git status --short` and the latest commits before assuming the handoff is still current.
3. Treat `https://future-planner.claireeek.com/` as the only official public entry. Keep the old `workers.dev` origin only where migration compatibility is intentional.
4. Preserve these product decisions unless the user explicitly changes them:
   - A new visitor sees the Chinese UI by default.
   - A saved English UI preference remains English.
   - Website UI language and Melo voice language are independent.
   - Chinese title: `future · 个人成长规划`.
   - English title: `future · Personal Growth Planner`.
   - Browser speech is the default free voice provider; cloud TTS is optional BYOK.
5. Never print, commit, or copy `.env*` values, API keys, Supabase credentials, Companion pairing tokens, NetEase cookies, or private keys into documentation.
6. For normal production changes, run `npm run check`, deploy with `npm run deploy`, verify the custom domain, then commit and push only the intended files.
7. After a material product, architecture, deployment, or roadmap change, update `docs/PROJECT_STATUS.md` in the same commit so the next session can resume accurately.

The separate Companion source directory is `D:\谷歌下载\future-companion`. It is not a Git repository; the public, versioned distribution is committed under `public/downloads/` in this repository.
