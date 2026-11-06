// npm run smoke: proves both keys work, cheaply. Costs one small search and one short chat.

async function oriane() {
  const key = process.env.ORIANE_API_KEY;
  if (!key) return console.log("Oriane: ORIANE_API_KEY missing from .env.local");
  const res = await fetch(
    "https://connect.oriane.xyz/rest/contents/search?limit=1&projection=basic&sort=viewsRatePerFollowers:desc",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operator: "and",
        filters: {
          platform: { includes: ["tiktok"] },
          transcript: { includesExactly: { values: ["this app"] } },
          viewsCount: { min: 100000 },
        },
      }),
    },
  );
  const json = await res.json();
  if (!res.ok) return console.log(`Oriane: failed, HTTP ${res.status}`, json.error);
  const top = json.data.results[0];
  console.log(
    `Oriane: ok, ${json.metadata.pagination.totalCount} matches, top is @${top?.profileHandle} with ${top?.viewsCount} views`,
  );
}

async function gmi() {
  const key = process.env.GMI_API_KEY;
  if (!key) return console.log("GMI: GMI_API_KEY missing from .env.local");
  const res = await fetch("https://api.gmi-serving.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4.6",
      max_tokens: 10,
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
    }),
  });
  const json = await res.json();
  if (!res.ok) return console.log(`GMI: failed, HTTP ${res.status}`, json);
  console.log(`GMI: ok, ${json.model} replied "${json.choices[0].message.content}"`);
}

await oriane();
await gmi();
