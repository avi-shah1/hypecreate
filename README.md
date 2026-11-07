# Hack the Feed

UGC accounts that keep posting after the intern leaves.

Consumer apps grow through accounts that interns warm up. When the intern leaves, the account goes dark and their clips sit unused. This tool reads what is working today from video data, remakes those formats from the team's own clip library, generates what is missing, and learns from what each post did.

First customer: Lodavo, a Canadian savings app, with its next batch of posts due Monday.

## Clock (Friday Nov 6, PT)

| When | What |
|---|---|
| 3:15 | Each half works alone: Avi on real Oriane data, Ben with one finished video from the fixture |
| 3:45 | Wired together in the UI |
| 4:10 | Feature freeze. Record a 60-second screen recording as a fallback, fill in the form |
| **4:30** | **Round 1 submission due:** https://hackerboard.lovable.app/s/hack-the-feed-creator-tools-hackathon-wi-tdj8 |
| 5:30 | Finalists pitch on stage: 3 minutes, then 2 minutes of questions |
| 6:15 | Winners |
| Sun 5:00 | Compound's video award closes. Post with #HackTheFeed |

## What the jury scores

1. **Usage of video intelligence data:** how deep we go into what videos show, say and sound like
2. **Creativity:** an idea they have not seen
3. **Problem and solution:** a real pain, a clear fix
4. **Feasibility:** could it ship and sell on Monday
5. **Scale:** how big it can get

## Who owns what

| | Avi: signal | Ben: create |
|---|---|---|
| Job | Find the formats working right now | Turn one format into a finished video |
| Code | `lib/oriane.ts`, `app/api/signal/` | `lib/gmi.ts`, `app/api/create/`, `brand/`, `clips/` |
| Output | `FormatBrief[]` | `CreateResult`: an MP4 and a caption |

**Julius: brain view.** Code that shows which brain regions a video is predicted to activate. Put it in its own `brain/` folder so it can't collide with the other two halves. The idea: compare a new video against the breakout it remakes. Oriane gives frames and a timed transcript for that breakout, not the video file, so it needs to work from those or we need another source for the original.

`lib/contract.ts` is the only thing connecting the two. `fixtures/format-brief.example.json` is a real example, so Ben can build before Avi's search is ready, and `/api/signal` serves it until then. `app/page.tsx` is shared: keep edits small.

### Avi's half

1. Search Oriane for a niche with `ORGANIC_ONLY`, accounts of 5,000 to 200,000 followers, last 30 days, sorted by `viewsRatePerFollowers`.
2. `toEvidence()` the top 20 or 30. Have the LLM (`chat()` in `lib/gmi.ts`, frames passed as images) throw out false matches, group the rest into 3 to 5 formats and write each one's beats.
3. Cache the result in `data/cache/`. The stage demo reads the cache.

### Ben's half

1. `hook-plus-demo`: an LLM script and caption from the brief plus `brand/lodavo.md`, then ffmpeg cuts a library clip into the app demo with the hook text on top. This is the default style and the first one to finish.
2. `broll-text`: one generated 9:16 clip from GMI with text on top.
3. `ai-generated`: every scene generated. Last, and only if there is time.

### If there is time, in this order

1. **Results loop:** import a CSV of what posted videos did (`PostResult`). Formats and clips that did well get more of the next batch. This is the part of the pitch that makes it more than a one-shot generator.
2. **Market gap:** run the same format search in French. "This format has millions of views in English and nobody has made it in French."
3. Posting. For the demo, the output is a ready-to-post MP4 and caption.

## Setup

```
git clone git@github.com:benthomasmtl/hack-the-feed.git
cd hack-the-feed
npm install
cp .env.example .env.local
```

Then fill in `.env.local`:

- `ORIANE_API_KEY`: scan the QR code on the Oriane API slide of the event deck.
- `GMI_API_KEY`: https://console.gmicloud.ai > Settings > API Keys. The credit code is on the last slides of GMI's deck.

```
npm run smoke
npm run dev
```

`npm run smoke` proves both keys work. `docs/apis.md` has the tested API notes.

## Working together

- `git pull --rebase` before you start. Small commits, straight to `main`, push often.
- Stay in your half so we do not collide.
- Never commit keys, event codes, footage or renders. The repo may go public for the submission.
- Footage goes in `clips/` locally. A clip counts only with a signed release (`cleared: true`).

## Submission form

Team name, contact email, first name, link to demo (live app, video or repo), then short bullets for:

- What's the project?
- What problem does it solve?
- How does it use Oriane video data?
- What's the vision at scale?

Optional: up to 10 files (deck, screenshots, short video), 25 MB each.
