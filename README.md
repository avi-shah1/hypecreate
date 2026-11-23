# HypeCreate

**Find the short videos working in your niche right now, then turn them into ready-to-post ads for your brand.**

**[Try the live demo → hypecreate.vercel.app](https://hypecreate.vercel.app)**

![The HypeCreate Studio](docs/studio.png)

Consumer apps grow on TikTok and Instagram through small UGC accounts: someone films themselves, posts every day, and the account warms up. When that person leaves, the account goes quiet. HypeCreate keeps it posting. It reads what is working for other creators this month, explains *why* each video works, and remakes that format as a new video for your brand, checked against your brand's rules.

> **This demo only works for Lodavo**, a savings app that gives you free tickets to a weekly cash draw for the money you save. The company research, brand rules and videos are all Lodavo's. Other companies aren't supported yet: adding one means a brand file in `brand/`, a profile in `app/studio/brand-profile.ts`, and live mode to make its videos.

## How it works

1. **Research the company.** Paste the company's website and the Studio shows a brand profile: what the product does, who it's for, and the guardrails every script must follow (what it may never claim, which legal line has to appear). For now the profile is pre-built for Lodavo (`app/studio/brand-profile.ts`, from `lodavo-brand-brief.md`), so any lodavo.com address works and other sites don't yet.
2. **Scan a niche.** Type a niche like "saving money" or "student budget". HypeCreate searches recent TikTok and Instagram videos from creators with 5k–200k followers through [Oriane](https://oriane.xyz), drops paid ads and off-topic videos, and ranks what's left by views per follower, so small accounts that punch above their weight rise to the top.
3. **Get the winning formats.** An AI model watches the top videos (transcript, on-screen text, opening frames) and groups them into formats: the hook pattern, the beat-by-beat structure, why it works, and links to the real videos as evidence.
4. **Make a video.** Pick a format and the Studio writes a script for your brand in that shape, generates the video on [GMI Cloud](https://gmicloud.ai) (Veo, Kling, Seedance, MiniMax), and burns in the legal line.
5. **Check the hook.** Open the video in the **brain view**, a 3D brain that lights up with the image and sound features of each moment, so you can see whether the first seconds grab attention. It measures the video in your browser. It is not a brain scan and does not predict views.

## Pages

| Page | What it's for |
|---|---|
| `/studio` | The whole flow above: research, scan, formats with evidence, make a video, and every video made so far |
| `/brain` | The brain view on its own. `/brain?video=/demo/strict-budget-store-run-veo.mp4` opens with that video |
| `/queue` | The planned posts for each account, with captions and time slots (read-only) |

## Demo mode

The public demo can't spend money. **Demo mode is on unless `HYPECREATE_LIVE=1` is set**, and the server enforces it (`lib/demo.ts`), not just the buttons:

- **Scans** answer from the saved searches in `data/signal/`, which are real results saved from earlier scans. A niche nobody saved gets the saved search closest to it.
- **Make a video** runs through its steps in a second or two, then shows one of the videos already made, in `public/demo/`. It prefers a video made for that same format.
- **Paid routes** (`/api/create`) refuse.

Nothing calls Oriane or GMI, so the demo needs no API keys.

## Run it on your computer

```powershell
npm install
npm run dev
```

Then open http://localhost:3000. That runs the demo.

To run it for real (live scans, real videos, using your credits):

```powershell
Copy-Item .env.example .env.local
# In .env.local, set HYPECREATE_LIVE=1 and add your keys:
#   ORIANE_API_KEY  from https://app.oriane.xyz/billing/subscription?tab=api
#   GMI_API_KEY     from https://console.gmicloud.ai > Settings > API Keys
npm run smoke   # checks both keys with one cheap call each
npm run dev
```

A live video costs about $1–2 of GMI credit and takes a few minutes. `docs/apis.md` has the tested API notes and prices.

## Deploying

It's a standard Next.js app, so it deploys to Vercel as-is. Leave `HYPECREATE_LIVE` unset and add no keys; the demo videos are served from `public/demo/`.

## Code map

| Where | What |
|---|---|
| `app/studio/` | The Studio page: research, scan progress, format cards, recent videos |
| `app/api/signal/` | Niche search → winning formats. `lib/oriane.ts` talks to Oriane, `analyze.ts` has the AI read the videos, `signal.ts` caches both layers in `data/` |
| `app/studio/generate/pipeline.ts` | Format + brand rules → script → GMI video → legal line (AI video) |
| `lib/create.ts`, `lib/render.ts` | Format → video cut from your own footage with ffmpeg (needs the local `clips/` library) |
| `lib/demo.ts` | Demo mode, and `data/demo-videos.json` lists the demo videos |
| `brand/lodavo.md` | Lodavo's brand rules: what scripts may say, what they never say, the legal line |
| `public/brain/` | The WebGL brain view |
| `lib/contract.ts` | The types shared between scan, create and brain |

## Bulk tools (live mode, on a machine with footage)

- `node scripts/batch.mjs clips/batches/<account>.json <person|faceless>` renders a batch of videos, each with a caption file.
- `node --env-file=.env.local scripts/results-loop.mjs clips/results/<account>.json <followers>` turns an account's own results into formats in the Studio.

## Credits

Built at the Hack the Feed hackathon by Ben Thomas (video creation), Avi Shah (Oriane signal) and Julius (brain view). Forked from [benthomasmtl/hack-the-feed](https://github.com/benthomasmtl/hack-the-feed).
