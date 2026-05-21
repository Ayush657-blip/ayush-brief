const Groq = require("groq-sdk");
const { Resend } = require("resend");
const https = require("https");
const http = require("http");
const fs = require("fs");
const { generateEmailHTML } = require("./email");

// ── CONFIG ──────────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);
const MY_EMAIL = process.env.MY_EMAIL;
const DASHBOARD_URL = "https://ayushbrief.online";

// ── RSS FEEDS ────────────────────────────────────────────
const RSS_FEEDS = {
  "AI & Technology": [
    "https://techcrunch.com/feed/",
    "https://www.theverge.com/rss/index.xml",
    "https://feeds.wired.com/wired/index"
  ],
  "World News": [
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"
  ],
  "Healthcare": [
    "https://economictimes.indiatimes.com/industry/healthcare/biotech/pharmaceuticals/rss.cms",
    "https://www.who.int/rss-feeds/news-english.xml",
    "https://feeds.bbci.co.uk/news/health/rss.xml"
  ],
  "India Business": [
    "https://economictimes.indiatimes.com/markets/rss.cms",
    "https://www.livemint.com/rss/companies"
  ]
};

// ── FETCH URL ────────────────────────────────────────────
function fetchURL(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error("Too many redirects"));
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*"
      },
      timeout: 15000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

// ── PARSE FEED ───────────────────────────────────────────
function parseFeed(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const desc = extractTag(block, "description");
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    if (title) items.push({
      title, link: link || "",
      description: desc ? desc.replace(/<[^>]+>/g, "").substring(0, 300) : "",
      pubDate: pubDate || ""
    });
  }
  if (items.length === 0) {
    const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = extractTag(block, "title");
      const summary = extractTag(block, "summary") || extractTag(block, "content");
      const link = (block.match(/href="([^"]+)"/) || [])[1];
      const published = extractTag(block, "published") || extractTag(block, "updated");
      if (title) items.push({
        title, link: link || "",
        description: summary ? summary.replace(/<[^>]+>/g, "").substring(0, 300) : "",
        pubDate: published || ""
      });
    }
  }
  return items;
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"));
  if (!match) return null;
  return match[1].trim()
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function isRecent(pubDate) {
  if (!pubDate) return true;
  try { return (new Date() - new Date(pubDate)) / 3600000 <= 24; }
  catch { return true; }
}

// ── FETCH NEWS ───────────────────────────────────────────
async function fetchCategoryNews(category, feeds) {
  const allItems = [];
  for (const url of feeds) {
    try {
      console.log(`  → ${url.split("/")[2]}`);
      const xml = await fetchURL(url);
      const items = parseFeed(xml).filter(i => isRecent(i.pubDate));
      allItems.push(...items);
      console.log(`    ✓ ${items.length} recent articles`);
    } catch (err) {
      console.log(`    ⚠ Failed: ${err.message}`);
    }
  }
  const seen = new Set();
  return allItems.filter(item => {
    const key = item.title.toLowerCase().substring(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

// ── GROQ SUMMARIZE ───────────────────────────────────────
async function summarizeWithGroq(category, articles) {
  if (articles.length === 0) return articles;

  const articleText = articles.map((a, i) =>
    `[${i + 1}] Title: ${a.title}\nDescription: ${a.description || "No description"}`
  ).join("\n\n");

  const prompt = `You are a sharp intelligence analyst writing for Ayush — a 24-year-old Indian professional in FMCG sales and healthcare building an AI startup.

Category: ${category}

Summarize each article. Return ONLY a valid JSON array. No markdown. No backticks. No extra text.

Format:
[{"title":"exact original title","summary":"2 sentences: what happened and why it matters","why":"1 specific actionable insight for Indian FMCG or startup professional","tag":"2-3 word tag"}]

Articles:
${articleText}`;

  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 2000
    });

    const raw = res.choices[0].message.content.trim()
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    const parsed = JSON.parse(raw);
    return articles.map((article, i) => ({
      ...article,
      summary: parsed[i]?.summary || article.description,
      why: parsed[i]?.why || "Stay informed on this development",
      tag: parsed[i]?.tag || category
    }));
  } catch (err) {
    console.log(`  ⚠ Groq error for ${category}: ${err.message}`);
    return articles.map(a => ({
      ...a,
      summary: a.description || a.title,
      why: "Read the full article for context",
      tag: category
    }));
  }
}

// ── MAIN ─────────────────────────────────────────────────
async function run() {
  console.log("\n🚀 Ayush's Brief starting...");
  console.log(`📅 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST\n`);

  const sections = [];
  let totalStories = 0;

  for (const [category, feeds] of Object.entries(RSS_FEEDS)) {
    console.log(`\n📰 ${category}`);
    const articles = await fetchCategoryNews(category, feeds);

    if (articles.length > 0) {
      console.log(`  🤖 Summarizing ${articles.length} articles...`);
      const summarized = await summarizeWithGroq(category, articles);
      sections.push({ category, articles: summarized });
      totalStories += summarized.length;
      console.log(`  ✅ Done`);
    } else {
      console.log(`  ⚠ No recent articles`);
      sections.push({ category, articles: [] });
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  if (totalStories === 0) {
    console.log("\n❌ No stories found. Exiting.");
    return;
  }

  // Save data.json for dashboard
  const dashboardData = {
    date: new Date().toISOString(),
    totalStories,
    sections
  };
  fs.writeFileSync("data.json", JSON.stringify(dashboardData, null, 2));
  console.log("\n📊 data.json saved for dashboard");

  // Send email
  console.log(`\n📧 Sending email (${totalStories} stories)...`);
  const html = generateEmailHTML(sections, totalStories, DASHBOARD_URL);

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Asia/Kolkata"
  });

  const { data, error } = await resend.emails.send({
    from: "Ayush's Brief <newsletter@ayushbrief.online>",
    to: MY_EMAIL,
    subject: `☀️ Ayush's Brief — ${today} · ${totalStories} Stories`,
    html
  });

  if (error) {
    console.log("❌ Email failed:", JSON.stringify(error));
  } else {
    console.log("✅ Email sent! ID:", data.id);
    console.log("📬 Delivered to:", MY_EMAIL);
  }

  console.log("\n🎯 Done. See you tomorrow at 6:00 AM IST.\n");
}

run().catch(err => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
