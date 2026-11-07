# Hack the Feed

UGC accounts that keep posting after the intern leaves.

Consumer apps grow through accounts that interns and creators warm up. When that person leaves, the account goes dark and their clips sit unused. This app finds the formats working on other accounts right now, remakes them from the team's own footage, generates what is missing, checks each hook with a brain view, and learns from what each account already posted.

Built by Ben (create), Avi (Oriane signal) and Julius (brain view). This repo stays private: its saved scans link to real accounts.

## What it does

| Page | What |
|---|---|
| `/studio` | Scan a niche on Oriane, see the winning formats with their evidence, make a video in three styles (real clips and app demo, 7-second b-roll, AI), look at it in the brain view, browse everything ready to post |
| `/brain` | The brain view on its own. `/brain?video=/renders/x.mp4` opens with that video |
| `/queue` | The posts planned for each account: video, caption, slot, and whether Ben has OK'd it. He reviews in chat, so the page is read-only |

## Run it

```
npm install
cp .env.example .env.local
npm run smoke
npm run dev
```

- `ORIANE_API_KEY`: https://app.oriane.xyz/billing/subscription?tab=api
- `GMI_API_KEY`: https://console.gmicloud.ai > Settings > API Keys

`docs/apis.md` has the tested API notes.

## Footage

`clips` is a local symlink to the footage folder and never enters git: it shows real people. `clips/library.json` lists every clip with its tags and whether its person cleared it for reuse; `lib/library.ts` only ever hands out cleared clips. Without footage the Studio still runs, on AI-generated video.

## Making videos in bulk

- `node scripts/batch.mjs clips/batches/<account>.json <person|faceless>` renders a batch to `public/renders/<account>/`, each video with a caption file.
- `node --env-file=.env.local scripts/results-loop.mjs clips/results/<account>.json <followers>` turns an account's own results into formats in the Studio.

## Code map

- `app/api/signal/`: Oriane search to `FormatBrief[]` (`lib/oriane.ts`).
- `lib/create.ts`: format to finished video, through `lib/gmi.ts` and `lib/render.ts` (ffmpeg).
- `public/brain/`: the WebGL brain view. It measures image and sound features in the browser. It is not a brain scan and does not predict views.
- `lib/contract.ts`: the types between the halves.
