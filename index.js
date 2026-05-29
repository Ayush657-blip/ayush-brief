const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const parser = new Parser({ timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
const SUPA_URL = 'https://ygkviidhuqicfnvyuiiu.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY;

const VALID_CATEGORIES = [
  'Business', 'Indian Economy', 'Finance', 'Tech', 'Sports',
  'Government', 'International', 'Climate', 'Startups & Auto',
  'Science & Health', 'Entertainment'
];

// ── BROAD RSS FEEDS ───────────────────────────────────────────────────────────
const BROAD_FEEDS = [
  'https://feeds.bbci.co.uk/news/business/rss.xml',
  'https://www.livemint.com/rss/companies',
  'https://www.livemint.com/rss/economy',
  'https://www.livemint.com/rss/market',
  'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms',
  'https://feeds.bbci.co.uk/news/technology/rss.xml',
  'https://techcrunch.com/feed/',
  'https://timesofindia.indiatimes.com/rssfeeds/66949542.cms',
  'https://feeds.bbci.co.uk/sport/rss.xml',
  'https://timesofindia.indiatimes.com/rssfeeds/4719161.cms',
  'https://feeds.feedburner.com/ndtvnews-india-news',
  'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms',
  'https://www.thehindu.com/news/national/feeder/default.rss',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
  'https://www.theguardian.com/environment/climate-crisis/rss',
  'https://feeds.bbci.co.uk/news/health/rss.xml',
  'https://www.thehindu.com/sci-tech/science/feeder/default.rss',
  'https://www.thehindu.com/sci-tech/health/feeder/default.rss',
  'https://www.theguardian.com/science/rss',
  'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml',
  'https://www.thehindu.com/business/Industry/feeder/default.rss',
  'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
  'https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms',
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
function isEnglishHeadline(title) {
  if (!title) return false;
  const latinChars = (title.match(/[a-zA-Z]/g) || []).length;
  const totalChars = title.replace(/\s/g, '').length;
  return totalChars === 0 || (latinChars / totalChars) > 0.5;
}

async function fetchFeed(url) {
  try {
    const feed = await parser.parseURL(url);
    return feed.items.slice(0, 10).map(item => ({
      title: (item.title || '').trim(),
      summary: (item.contentSnippet || item.content || item.summary || '').trim(),
      link: item.link || '',
      pubDate: item.pubDate || item.isoDate || ''
    }));
  } catch (err) {
    console.log(`⚠️  Feed failed: ${url.slice(0, 60)}`);
    return [];
  }
}

async function callClaudeAPI(prompt, maxTokens = 500) {
  if (!CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content[0].text.trim();
}

// ── CLASSIFY + IMPORTANCE IN ONE CALL ────────────────────────────────────────
async function classifyAndScore(headline, summary) {
  const prompt = `You are a strict news classifier and editor for an Indian news newsletter targeting students and working professionals.

TASK: Classify this story into ONE category AND assign an importance score.

CATEGORY RULES:

Business: Company profits, losses, mergers, acquisitions, corporate strategy, Indian companies
Examples: "HUL Q3 results", "Tata Steel acquires", "Mukesh Ambani salary"
NOT: government policy, stock markets, startups, employment trends

Indian Economy: India macroeconomy — GDP, RBI, inflation, rupee, trade policy, budget, GST, economic reforms
Examples: "RBI cuts repo rate", "India GDP grows 7%", "Rupee falls", "GST collections rise"
NOT: company news, global economy, stock prices

Finance: Stock markets, Sensex, Nifty, IPOs, mutual funds, personal investing, banking results
Examples: "Sensex hits 80000", "IPO subscribed 10x", "SBI profit", "Mutual fund inflows"
NOT: company strategy, economy policy

Tech: Technology products, AI, software, apps, gadgets, internet, cybersecurity
Examples: "Apple launches iPhone", "OpenAI raises funding", "Google AI update", "Meta launches"
NOT: food, agriculture, non-tech business

Sports: Any sport — cricket, football, tennis, Olympics, IPL, kabaddi
Examples: "Virat Kohli century", "India beats Pakistan", "Messi scores", "French Open"
NOT: sports business deals

Government: ONLY India government — parliament bills, ministry schemes, elections, court verdicts, BJP/Congress, India policy
Examples: "Parliament passes bill", "PM Modi launches scheme", "Supreme Court verdict", "BJP wins"
NOT: economic analysis, employment trends, foreign governments, social issues

International: ONLY foreign country news — USA, China, UK, Russia, Middle East, Europe, Africa
Examples: "Trump signs order", "China GDP slows", "Iran attacks US base", "EU sanctions"
NOT: Indian news with global context, employment trends, coffee prices

Climate: Environment, pollution, climate change, weather events, renewable energy, wildlife, heatwave, natural disasters
Examples: "Heatwave hits Delhi", "Cyclone Odisha", "Solar power rises", "Air pollution"
NOT: space news, food/fruit agriculture

Startups & Auto: Startup funding, VC investments, unicorns AND car launches, EV news, automobile industry
Examples: "Byju's raises funds", "Ola Electric IPO", "Tata Nexon EV review", "Startup Series B"
NOT: food, fruit, agriculture, non-startup business

Science & Health: Scientific research, space, ISRO, NASA, medical discoveries, disease, hospitals, fitness
Examples: "ISRO launches satellite", "NASA moon mission", "Cancer vaccine", "Dengue cases rise"
NOT: weather, tech products

Entertainment: Films, OTT, Bollywood, music, celebrities, awards, TV, streaming
Examples: "Pathaan box office", "Netflix show launch", "Grammy winners", "Ranveer Singh film"
NOT: sports, hard news

IMPORTANCE SCORING for Indian students and professionals:
🔴 MUST COVER — Breaking news, directly affects India/Indians, trending everywhere, high reader interest
🟡 GOOD TO COVER — Relevant and interesting but not breaking, good for variety
⚪ SKIP — Too niche, too old, irrelevant to Indian audience, low interest

STORY:
Headline: "${headline}"
Summary: "${(summary || '').slice(0, 200)}"

Reply in EXACTLY this format — nothing else:
CATEGORY: [category name]
IMPORTANCE: [🔴 MUST COVER or 🟡 GOOD TO COVER or ⚪ SKIP]
REASON: [one short sentence why]`;

  try {
    const result = await callClaudeAPI(prompt, 100);
    const lines = result.split('\n');
    let category = null, importance = '🟡', reason = '';

    for (const line of lines) {
      if (line.startsWith('CATEGORY:')) {
        const cat = line.replace('CATEGORY:', '').trim();
        if (VALID_CATEGORIES.includes(cat)) category = cat;
        else {
          const match = VALID_CATEGORIES.find(c =>
            cat.toLowerCase().includes(c.toLowerCase()) ||
            c.toLowerCase().includes(cat.toLowerCase())
          );
          category = match || null;
        }
      }
      if (line.startsWith('IMPORTANCE:')) {
        const imp = line.replace('IMPORTANCE:', '').trim();
        if (imp.includes('🔴')) importance = '🔴';
        else if (imp.includes('🟡')) importance = '🟡';
        else if (imp.includes('⚪')) importance = '⚪';
        else if (imp.includes('MUST')) importance = '🔴';
        else if (imp.includes('GOOD')) importance = '🟡';
        else if (imp.includes('SKIP')) importance = '⚪';
      }
      if (line.startsWith('REASON:')) {
        reason = line.replace('REASON:', '').trim();
      }
    }

    return { category, importance, reason };
  } catch (err) {
    return { category: null, importance: '🟡', reason: '' };
  }
}

// ── SAVE STORIES TO SUPABASE ──────────────────────────────────────────────────
async function saveStoriesToSupabase(stories, runDate) {
  try {
    // Clear today's pending stories first
    await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?run_date=eq.${runDate}&status=eq.pending`,
      {
        method: 'DELETE',
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
      }
    );

    // Insert new stories in batches of 20
    const batchSize = 20;
    for (let i = 0; i < stories.length; i += batchSize) {
      const batch = stories.slice(i, i + batchSize);
      const res = await fetch(`${SUPA_URL}/rest/v1/daily_stories`, {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(batch)
      });
      if (!res.ok) {
        const err = await res.text();
        console.log(`⚠️  Batch save error: ${err}`);
      }
    }
    console.log(`✅ ${stories.length} stories saved to Supabase`);
  } catch (err) {
    console.log(`❌ Supabase save failed: ${err.message}`);
  }
}

// ── LOAD PREVIOUS DAY STORIES ─────────────────────────────────────────────────
async function loadPreviousDayStories(category) {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yDate = yesterday.toISOString().split('T')[0];

    const res = await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?category=eq.${encodeURIComponent(category)}&run_date=eq.${yDate}&status=eq.approved&select=*&limit=20`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data || [];
  } catch (err) {
    return [];
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌅 The Dawn Brief — Fetch & Score Run');
  console.log('='.repeat(50));
  console.log(`Claude API: ${CLAUDE_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`Supabase: ${SUPA_KEY ? '✅ Connected' : '❌ Missing'}`);

  const runDate = new Date().toISOString().split('T')[0];
  const runDateIST = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Kolkata'
  });

  // ── STEP 1: Fetch all stories ─────────────────────────────────────────────
  console.log('\n📡 Fetching from all feeds...');
  const rawItems = [];
  for (const url of BROAD_FEEDS) {
    const items = await fetchFeed(url);
    rawItems.push(...items);
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`✓ Fetched ${rawItems.length} raw stories`);

  // ── STEP 2: Deduplicate ───────────────────────────────────────────────────
  const seen = new Set();
  const uniqueItems = rawItems.filter(i => {
    if (!isEnglishHeadline(i.title)) return false;
    if (!i.title || !i.summary || i.summary.length < 30) return false;
    const key = i.title.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`✓ ${uniqueItems.length} unique English stories`);

  // ── STEP 3: Classify + Score every story ─────────────────────────────────
  console.log('\n🤖 Classifying and scoring stories...');
  const classified = {};
  VALID_CATEGORIES.forEach(c => classified[c] = []);

  for (const item of uniqueItems) {
    const { category, importance, reason } = await classifyAndScore(item.title, item.summary);
    if (category && importance !== '⚪') {
      classified[category].push({
        headline: item.title,
        summary: item.summary.slice(0, 500),
        link: item.link || '',
        pub_date: item.pubDate || '',
        category,
        importance,
        reason,
        run_date: runDate,
        status: 'pending',
        voices: null,
        is_previous_day: false
      });
    }
    await new Promise(r => setTimeout(r, 150));
  }

  // ── STEP 4: Sort by importance, cap at 20 per category ───────────────────
  console.log('\n📊 Category summary:');
  const allStories = [];

  for (const category of VALID_CATEGORIES) {
    const stories = classified[category];

    // Sort: 🔴 first, then 🟡
    stories.sort((a, b) => {
      if (a.importance === '🔴' && b.importance !== '🔴') return -1;
      if (b.importance === '🔴' && a.importance !== '🔴') return 1;
      return 0;
    });

    const top20 = stories.slice(0, 20);

    if (top20.length === 0) {
      // Load previous day stories
      console.log(`   ⚠️  ${category}: 0 stories — loading previous day`);
      const prevStories = await loadPreviousDayStories(category);
      const prevMarked = prevStories.slice(0, 20).map(s => ({
        ...s,
        run_date: runDate,
        status: 'pending',
        is_previous_day: true,
        importance: '🟡',
        reason: 'Previous day story — no fresh news available today'
      }));
      allStories.push(...prevMarked);
      console.log(`   📦 ${category}: ${prevMarked.length} from previous day`);
    } else {
      allStories.push(...top20);
      const mustCount = top20.filter(s => s.importance === '🔴').length;
      const goodCount = top20.filter(s => s.importance === '🟡').length;
      console.log(`   ✅ ${category}: ${top20.length} stories (🔴 ${mustCount} must + 🟡 ${goodCount} good)`);
    }
  }

  // ── STEP 5: Save to Supabase ──────────────────────────────────────────────
  console.log('\n💾 Saving to Supabase...');
  await saveStoriesToSupabase(allStories, runDate);

  // ── STEP 6: Save summary to data-fetch.json for Railway ──────────────────
  const summary = {
    run_date: runDate,
    run_date_display: runDateIST,
    generated: new Date().toISOString(),
    total_stories: allStories.length,
    categories: VALID_CATEGORIES.map(c => ({
      name: c,
      count: allStories.filter(s => s.category === c).length,
      must_cover: allStories.filter(s => s.category === c && s.importance === '🔴').length,
      has_previous_day: allStories.some(s => s.category === c && s.is_previous_day)
    }))
  };

  fs.writeFileSync(
    path.join(__dirname, 'data-fetch.json'),
    JSON.stringify(summary, null, 2)
  );
  console.log('✅ data-fetch.json saved');
  console.log(`\n✅ Total ${allStories.length} stories ready for curation`);
  console.log('🌅 Fetch complete! Admin can now curate at ayushbrief.online/admin.html');
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
