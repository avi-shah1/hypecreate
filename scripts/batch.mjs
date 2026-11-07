// Renders one account's batch through /api/create. Needs the dev server and the footage.
//   node scripts/batch.mjs clips/batches/notquiterichyet.json faceless [slug-filter]
// The file name is the account: videos land in public/renders/<account>/. Each item is
// {slug, style?, script: {scenes: [{clip | prompt, start?, seconds, text}], caption}}.
import { readFile } from "node:fs/promises";
import path from "node:path";

const [file, person, only] = process.argv.slice(2);
if (!file || !person) throw new Error("Usage: batch.mjs <batch.json> <person|faceless> [slug-filter]");
const account = path.basename(file, ".json");
const items = JSON.parse(await readFile(file, "utf8"));
const queue = items.filter((item) => !only || item.slug.startsWith(only));

async function worker() {
  for (let item = queue.shift(); item; item = queue.shift()) {
    const started = Date.now();
    const res = await fetch("http://localhost:3000/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Ben's call: of our accounts, only @fintechben carries the on-screen legal line.
      body: JSON.stringify({ ...item, person, brand: "lodavo", language: "en", folder: account, style: item.style ?? "broll-text", legal: account === "fintechben", vary: account === "fintechben" }),
    });
    const json = await res.json();
    console.log(item.slug, res.status, `${Math.round((Date.now() - started) / 1000)}s`, res.ok ? json.videoUrl : json.error);
  }
}

// lib/render.ts runs the renders themselves one at a time. This only caps requests in flight.
await Promise.all([worker(), worker(), worker()]);
