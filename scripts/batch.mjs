// Renders one account's batch through /api/create. Needs the dev server and the footage.
//   node scripts/batch.mjs savewithcher [person] [slug-filter]
import { readFile } from "node:fs/promises";

const [account = "savewithcher", person = "chaerin", only] = process.argv.slice(2);
const items = JSON.parse(await readFile(new URL(`../data/batches/${account}.json`, import.meta.url), "utf8"));
const queue = items.filter((item) => !only || item.slug.includes(only));

async function worker() {
  for (let item = queue.shift(); item; item = queue.shift()) {
    const started = Date.now();
    const res = await fetch("http://localhost:3000/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...item, person, brand: "lodavo", language: "en", folder: account, style: item.style ?? "broll-text" }),
    });
    const json = await res.json();
    console.log(item.slug, res.status, `${Math.round((Date.now() - started) / 1000)}s`, res.ok ? json.videoUrl : json.error);
  }
}

// Each render decodes 4K video, so keep it to a few at a time on a fanless laptop.
await Promise.all([worker(), worker(), worker()]);
