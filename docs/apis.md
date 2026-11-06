# API notes

"Tested" means we called it on 2026-11-06. Everything else is from the docs and may be off. Keys and event codes are not in this repo: see README, Setup.

## Oriane: what videos show, say and sound like

Full reference: https://connect.oriane.xyz/rest/docs (rendered page; the OpenAPI spec is embedded in its HTML).

**Tested**

- Base URL `https://connect.oriane.xyz`. Auth is `Authorization: Bearer <key>`. `x-api-key` returns 401.
- `POST /rest/contents/search?sort=&limit=&offset=&projection=`. A query is `{ "operator": "and", "filters": {...}, "queries": [...] }`, nested up to two levels.
- List filters use `includes` and `excludes`, not `in`: `"platform": { "includes": ["tiktok"] }`.
- Text filters take `exactMatch`, `includesExactly`, `includesFuzzy`, `excludesExactly`, `excludesFuzzy`, each `{ "values": [...], "operator": "or" }`.
- Number filters take `min` and `max`. Dates take `after` and `before`.
- A search with more pages answers HTTP 206, not 200. `limit` is 100 at most.
- Normal search took 1 to 2 seconds, even 100 rows at `projection=full`.
- **Visual search took 37 seconds** on a broad query. Cache it. Do not run it live on stage.
- `POST /rest/assets` with `{ "type": "text", "text": "..." }` returns `data.id`. Use it as `"visualSimilarity": { "includes": { "values": [{ "assetId": "...", "minScore": 0.7 }] } }` and sort by `visualSimilarity:desc`. A `minScore` of 0.3 matched 53,001 videos, mostly irrelevant. Oriane's own guide says 0.7 for general descriptions and 0.9 for specifics.
- Frame and thumbnail URLs are public (`social-catalog-static.oriane.xyz`, webp), so they can go straight into a page or a vision model.
- There is no post URL in the response. `toEvidence()` builds it: TikTok from handle and `platformId`, Instagram from the `platformId` shortcode.

**What `projection=full` gives, per video**

| Layer | Fields |
|---|---|
| Shows | `media[].frames[]`: `url`, `timestampSeconds`, `onScreenTextRegions`, `visualSimilarityScore` |
| Says | `media[].transcript`, `transcriptChunks[]` with start and end seconds, `transcriptLanguage` |
| On screen | `media[].onScreenText[]` |
| Sounds | `audioTitle`, `audioAuthor`, `audioPlatformId`, `audioCopyrighted` |
| Crowd | `popularComments[]`, `viewsCount`, `likesCount`, `sharesCount`, `commentsCount` |
| Reach | `viewsRatePerFollowers`, `engagementRatePerViews`, `engagementRatePerFollowers` (all percentages) |
| Account | `profileHandle`, `profileFollowersCount`, `profileBio`, `profileLocationCompleteAddress` |

`POST /rest/profiles/search` finds accounts and returns `publicEmail`, `bio`, `language`, location. Not tested.

**Things that will bite**

- **The top of any chart is paid reach.** Sorting by views against followers surfaced `AD |` posts and brand accounts first. `ORGANIC_ONLY` in `lib/oriane.ts` filters by caption and by engagement. Tune it against real results.
- **Words lie.** A search for "this app" returned a video where "this app" meant TikTok itself. Have the LLM read the transcript and frames before a video counts as evidence.
- `platformType` separates TikTok `photo` from `video`, and Instagram `reel` from `carousel_album`.
- From Oriane's guide: accounts under 5,000 followers are not indexed, search covers the last 3 months, and new videos can take up to a week to appear. So it cannot read a small account's own numbers, or today's posts.

**MCP.** `https://connect.oriane.xyz/mcp` exists (answers 405 to a GET). Not tested. The app uses REST.

## GMI Cloud: models and compute

Docs: https://docs.gmicloud.ai, with every page listed at https://docs.gmicloud.ai/llms.txt. Not tested yet: needs a key.

- Key: https://console.gmicloud.ai > Settings > API Keys.
- Text, OpenAI-compatible: `POST https://api.gmi-serving.com/v1/chat/completions`. Tested: every `anthropic/` model we tried answers 429 on our key, and Opus 5.5 and Fable 5.1 answer 404. `openai/gpt-6.1-sol` works. `chat()` tries Claude Opus 5 first and moves on. `GET /v1/models` lists the rest.
- Video, image and speech run on a queue: `POST https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests` with `{ "model": "...", "payload": {...} }`, then poll `GET .../requests/{request_id}`. `generate()` in `lib/gmi.ts` handles it. The docs name the finished state both `success` and `finished`, and the result both `outcome.media_urls[].url` and `outcome.video_url`; the client accepts all of them. Check it on the first real job.

| Job | Model | Payload | Price |
|---|---|---|---|
| Vertical clip | `veo-3.1-fast-generate-001` | `prompt`, `aspectRatio: "9:16"`, `durationSeconds` 4, 6 or 8, `generateAudio` | $0.15 a second |
| Vertical clip from references | `seedance-2-0-fast-260128` | `prompt`, `ratio: "9:16"`, `duration` 4 to 15, `reference_images`, `reference_videos` | not stated |
| Clip, no ratio documented | `kling-v3-text-to-video` | `prompt`, `duration` 3 to 15, `mode` | from $0.084 a second |
| Voiceover | `minimax-tts-speech-2.8-turbo` | `text`, `voice_id`, `speed`, `language_boost` | see pricing page |

Pricing: https://docs.gmicloud.ai/inference-engine/billing/price

MCP for an assistant: `https://mcp.gmicloud.ai/mcp`, browser sign-in, no key to paste.

Hosting for agents and containers is AgentBox (public URL, per-second billing). We do not need it for the demo.

## Compound: the last mile

A Mac app, no API listed. It runs on your own Claude, Codex or Cursor plan and edits, captions and posts. Use it by hand for the launch video. Mac with an Apple chip, macOS 15 or later.

## Lovable

Optional. Its docs say connecting a project creates a new GitHub repo, so do not point it at this one. If someone wants it for a landing page, keep that as its own repo.
