import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const key = process.env.GEMINI_API_KEY;
const url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const body = {
  model: "gemini-2.5-flash",
  temperature: 0.2,
  messages: [
    {
      role: "system",
      content: 'Reply JSON only {"decision":"TAKE"|"REJECT","confidence":0.5,"reason":"x"}',
    },
    { role: "user", content: "Candidate: long XAUUSD at support. Decide TAKE or REJECT." },
  ],
};
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
  body: JSON.stringify(body),
});
console.log("status", res.status);
console.log((await res.text()).slice(0, 1000));
