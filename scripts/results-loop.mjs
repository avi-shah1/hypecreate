// The results loop: what an account's own posts did becomes the formats for its next batch.
//   node --env-file=.env.local scripts/results-loop.mjs notquiterichyet 2839
// Reads data/results/<account>.json ([{hook, views, link}], from the platform's own numbers:
// Oriane doesn't index accounts under 5,000 followers). The LLM only groups posts by hook
// shape. Scores come from the views, never the LLM. The result is a saved scan, so it shows
// up in the Studio next to the Oriane searches and goes through the same video pipeline.
import { readFile, writeFile } from "node:fs/promises";

const [account, followersArg] = process.argv.slice(2);
if (!account || !followersArg) throw new Error("Usage: results-loop.mjs <account> <followers>");
const followers = Number(followersArg);
const root = new URL("../", import.meta.url);
const posts = JSON.parse(await readFile(new URL(`data/results/${account}.json`, root), "utf8"));

const MODELS = ["anthropic/claude-opus-5", "openai/gpt-6.1-sol", "google/gemini-4-argon"];
const prompt = `These are one account's posts with their views. Each is a short b-roll video with one line of text on screen.

${posts.map((post, index) => `${index}. ${post.views} views: ${post.hook.slice(0, 160)}`).join("\n")}

Group the posts by the shape of their hook. Put posts together only when someone could write the next one by filling in the same blanks. Leave out posts that fit no group.

Reply with JSON only:
{"formats":[{"id":"short-kebab-id","name":"short plain name","hookPattern":"the hook with [blanks]","whyItWorks":"one plain sentence on why this shape gets watched, from the hooks themselves","rows":[post numbers]}]}`;

let reply;
for (const model of MODELS) {
  const res = await fetch("https://api.gmi-serving.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GMI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 16000, messages: [{ role: "user", content: prompt }] }),
  });
  if (res.ok) {
    reply = (await res.json()).choices[0].message.content;
    console.log("grouped by", model);
    break;
  }
  console.log(model, res.status);
}
if (!reply) throw new Error("No model answered");
const { formats } = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1));

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const briefs = formats
  .map((format) => {
    const rows = format.rows.map((row) => posts[row]).filter(Boolean).sort((a, b) => b.views - a.views);
    return {
      id: format.id,
      name: format.name,
      whyItWorks: format.whyItWorks,
      hookPattern: format.hookPattern,
      beats: [{ fromSeconds: 0, toSeconds: 7, shows: "Everyday b-roll with nobody on camera", onScreen: format.hookPattern }],
      durationSeconds: 7,
      recommendedStyle: "broll-text",
      clipTag: null,
      evidence: rows.slice(0, 4).map((post) => ({
        url: post.link,
        platform: "instagram",
        handle: account,
        thumbnailUrl: null,
        frameUrls: [],
        views: post.views,
        followers,
        viewsPerFollower: Math.round((post.views / followers) * 100) / 100,
        engagementRatePerViews: 0,
        spokenHook: "",
        onScreenText: [post.hook],
        audioTitle: null,
        durationSeconds: 7,
        topComments: [],
        publishedAt: "",
      })),
      score: median(rows.map((post) => post.views)),
    };
  })
  .filter((brief) => brief.evidence.length)
  .sort((a, b) => b.score - a.score);
// The Studio shows score as 0 to 100: relative to this account's best format.
const best = briefs[0]?.score || 1;
const medians = briefs.map((brief) => brief.score);
for (const brief of briefs) brief.score = brief.score / best;

const search = { query: `our account ${account}`, platforms: ["instagram"], minFollowers: 0, maxFollowers: 5000, days: 90, limit: posts.length };
const words = search.query.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const slug = `${words}_instagram_f0-5000_90d_n${posts.length}`;
await writeFile(
  new URL(`data/signal/${slug}.json`, root),
  JSON.stringify({ search, generatedAt: new Date().toISOString(), model: "results-loop", orianeFile: null, briefs, rejected: [], usedImages: false }, null, 2) + "\n",
);
console.log(slug);
for (const [index, brief] of briefs.entries()) {
  console.log(`${medians[index].toLocaleString()} median | ${brief.evidence.length} posts | ${brief.name} | ${brief.hookPattern}`);
}
