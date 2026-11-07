<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Rules for any AI agent in this repo

Read `README.md`, then `docs/apis.md`.

- `lib/contract.ts` is the interface between signal, create and brain. Change it deliberately.
- Never commit a key, footage or a render. Keys live in `.env.local`, footage in `clips/`, renders in `public/renders/`. All of them are ignored.
- Oriane and GMI cost real credits. Cache responses, keep `limit` small while exploring, and never run a generation job in an uncapped loop.
- Copy for Lodavo follows `brand/lodavo.md`. Check copy against it, not from memory.
- Clips with `cleared: false` are never used. An AI-generated person never plays a real user, and nobody's face or voice is made to say words they did not say.
