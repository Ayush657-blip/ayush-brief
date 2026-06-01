const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const parser = new Parser({ timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
const SUPA_URL = 'https://ygkviidhuqicfnvyuiiu.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY;
const NEWSDATA_KEY = process.env.NEWSDATA_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_EMAIL = process.env.MY_EMAIL || 'ayush@ayushbrief.online';

const VALID_CATEGORIES = [
  'Business', 'Indian Economy', 'Finance', 'Tech', 'Sports',
  'Government', 'International', 'Climate', 'Startups & Auto',
  'Science & Health', 'Entertainment'
];

// ── CATEGORY-SPECIFIC RSS FEEDS ───────────────────────────────────────────────
const CATEGORY_FEEDS = {
  'Business': [
    { url: 'https://www.livemint.com/rss/companies', source: 'Livemint' },
    { url: 'https://www.thehindu.com/business/Industry/feeder/default.rss', source: 'The Hindu' },
    { url: 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms', source: 'Times of India' },
  ],
  'Indian Economy': [
    { url: 'https://www.livemint.com/rss/economy', source: 'Livemint' },
    { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC Business' },
  ],
  'Finance': [
    { url: 'https://www.livemint.com/rss/market', source: 'Livemint' },
    { url: 'http://www.moneycontrol.com/rss/latestnews.xml', source: 'Moneycontrol' },
    { url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', source: 'Economic Times' },
  ],
  'Tech': [
    { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', source: 'BBC Tech' },
    { url: 'https://techcrunch.com/feed/', source: 'TechCrunch' },
    { url: 'https://timesofindia.indiatimes.com/rssfeeds/66949542.cms', source: 'Times of India Tech' },
  ],
  'Sports': [
    { url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml', source: 'ESPNcricinfo' },
    { url: 'https://sportstar.thehindu.com/feeder/default.rss', source: 'Sportstar' },
    { url: 'https://www.ndtv.com/rss/sports', source: 'NDTV Sports' },
  ],
  'Government': [
    { url: 'https://feeds.feedburner.com/ndtvnews-india-news', source: 'NDTV' },
    { url: 'https://www.thehindu.com/news/national/feeder/default.rss', source: 'The Hindu' },
    { url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms', source: 'Times of India' },
  ],
  'International': [
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', source: 'NY Times' },
  ],
  'Climate': [
    { url: 'https://www.theguardian.com/environment/climate-crisis/rss', source: 'The Guardian' },
    { url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', source: 'BBC Science' },
  ],
  'Startups & Auto': [
    { url: 'https://techcrunch.com/feed/', source: 'TechCrunch' },
    { url: 'https://timesofindia.indiatimes.com/rssfeeds/66949542.cms', source: 'Times of India' },
  ],
  'Science & Health': [
    { url: 'https://www.thehindu.com/sci-tech/science/feeder/default.rss', source: 'The Hindu' },
    { url: 'https://feeds.bbci.co.uk/news/health/rss.xml', source: 'BBC Health' },
    { url: 'https://www.theguardian.com/science/rss', source: 'The Guardian' },
  ],
  'Entertainment': [
    { url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', source: 'BBC Entertainment' },
    { url: 'https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms', source: 'Times of India' },
  ]
};

// NewsData.io categories — for fallback + low-story categories
const NEWSDATA_CATEGORY_MAP = {
  'Business': 'business',
  'Indian Economy': 'business',
  'Finance': 'business',
  'Tech': 'technology',
  'Sports': 'sports',
  'Government': 'politics',
  'International': 'world',
  'Climate': 'environment',
  'Startups & Auto': 'technology',
  'Science & Health': 'science',
  'Entertainment': 'entertainment'
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
function isEnglishHeadline(title) {
  if (!title) return false;
  const latinChars = (title.match(/[a-zA-Z]/g) || []).length;
  const totalChars = title.replace(/\s/g, '').length;
  return totalChars === 0 || (latinChars / totalChars) > 0.5;
}

function isRecent(pubDate) {
  if (!pubDate) return false;
  try {
    const date = new Date(pubDate);
    if (isNaN(date.getTime())) return false;
    const now = new Date();
    const diffHours = (now - date) / (1000 * 60 * 60);
    return diffHours >= 0 && diffHours <= 36;
  } catch (e) {
    return false;
  }
}

function extractSource(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    const sourceMap = {
      'espncricinfo.com': 'ESPNcricinfo',
      'sportstar.thehindu.com': 'Sportstar',
      'thehindu.com': 'The Hindu',
      'livemint.com': 'Livemint',
      'moneycontrol.com': 'Moneycontrol',
      'ndtv.com': 'NDTV',
      'timesofindia.indiatimes.com': 'Times of India',
      'economictimes.indiatimes.com': 'Economic Times',
      'techcrunch.com': 'TechCrunch',
      'bbci.co.uk': 'BBC',
      'bbc.co.uk': 'BBC',
      'theguardian.com': 'The Guardian',
      'nytimes.com': 'NY Times',
      'feedburner.com': 'NDTV',
    };
    for (const [key, val] of Object.entries(sourceMap)) {
      if (domain.includes(key)) return val;
    }
    return domain;
  } catch (e) {
    return 'Unknown';
  }
}

async function fetchFeed(url, sourceName) {
  try {
    const feed = await parser.parseURL(url);
    return feed.items.slice(0, 15).map(item => ({
      title: (item.title || '').trim(),
      summary: (item.contentSnippet || item.content || item.summary || '').trim(),
      link: item.link || '',
      pubDate: item.pubDate || item.isoDate || '',
      source: sourceName || extractSource(url),
      _raw: item
    })).filter(item => isRecent(item.pubDate));
  } catch (err) {
    console.log(`⚠️  Feed failed: ${url.slice(0, 60)}`);
    return [];
  }
}

// ── NEWSDATA.IO FETCH ─────────────────────────────────────────────────────────
async function fetchNewsData(category) {
  if (!NEWSDATA_KEY) return [];
  try {
    const ndCategory = NEWSDATA_CATEGORY_MAP[category] || 'top';
    const url = `https://newsdata.io/api/1/news?apikey=${NEWSDATA_KEY}&country=in&category=${ndCategory}&language=en&timeframe=24`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NewsData error ${res.status}`);
    const data = await res.json();
    if (data.status !== 'success') throw new Error('NewsData returned error');
    return (data.results || []).slice(0, 10).map(item => ({
      title: (item.title || '').trim(),
      summary: (item.description || item.content || '').trim(),
      link: item.link || '',
      pubDate: item.pubDate || '',
      source: item.source_name || 'NewsData'
    })).filter(item => item.title && item.summary);
  } catch (err) {
    console.log(`⚠️  NewsData failed for ${category}: ${err.message}`);
    return [];
  }
}


const PEXELS_KEY = process.env.PEXELS_KEY;
const GITHUB_RAW = 'https://raw.githubusercontent.com/Ayush657-blip/ayush-brief/main/images';

const CATEGORY_FOLDER_MAP = {
  'Business': 'business',
  'Indian Economy': 'economy',
  'Finance': 'finance',
  'Tech': 'tech',
  'Sports': 'sports',
  'Government': 'government',
  'International': 'international',
  'Climate': 'climate',
  'Startups & Auto': 'startup',
  'Science & Health': 'science',
  'Entertainment': 'entertainment'
};

const PEXELS_CATEGORY_QUERIES = {
  'Business': 'india business corporate office',
  'Indian Economy': 'india economy market finance',
  'Finance': 'stock market trading finance india',
  'Tech': 'technology computer india',
  'Sports': 'cricket india sports stadium',
  'Government': 'india parliament government delhi',
  'International': 'world globe international news',
  'Climate': 'nature environment india climate',
  'Startups & Auto': 'startup entrepreneur india car',
  'Science & Health': 'science laboratory health india',
  'Entertainment': 'bollywood entertainment india cinema'
};

// Extract image from RSS item
function extractRSSImage(item) {
  try {
    if (item['media:content'] && item['media:content']['$'] && item['media:content']['$'].url) {
      return item['media:content']['$'].url;
    }
    if (item.enclosure && item.enclosure.url) return item.enclosure.url;
    if (item['media:thumbnail'] && item['media:thumbnail']['$']) return item['media:thumbnail']['$'].url;
    return null;
  } catch(e) { return null; }
}

// Fetch image from Pexels
async function fetchPexelsImage(category) {
  if (!PEXELS_KEY) return null;
  try {
    const query = PEXELS_CATEGORY_QUERIES[category] || category;
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`, {
      headers: { 'Authorization': PEXELS_KEY }
    });
    if (!r.ok) return null;
    const data = await r.json();
    const photos = data.photos || [];
    if (photos.length === 0) return null;
    // Pick random from top 15
    const photo = photos[Math.floor(Math.random() * photos.length)];
    return { url: photo.src.medium, source: 'pexels', photographer: photo.photographer };
  } catch(e) { return null; }
}

// Get GitHub fallback image
function getGithubFallbackImage(category) {
  const folder = CATEGORY_FOLDER_MAP[category] || 'business';
  const num = Math.floor(Math.random() * 10) + 1;
  return { url: `${GITHUB_RAW}/${folder}/${num}.jpg`, source: 'github' };
}

async function fetchImageForStory(item, category) {
  // Layer 1: RSS image
  const rssImage = extractRSSImage(item._raw || item);
  if (rssImage) return { url: rssImage, source: 'rss' };

  // Layer 2: Pexels
  const pexelsImage = await fetchPexelsImage(category);
  if (pexelsImage) return pexelsImage;

  // Layer 3: GitHub fallback
  return getGithubFallbackImage(category);
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
  if (!res.ok) throw new Error(`Claude API error ${res.status}`);
  const data = await res.json();
  return data.content[0].text.trim();
}

// ── EMAIL ALERT ───────────────────────────────────────────────────────────────
async function sendAlertEmail(subject, message) {
  if (!RESEND_API_KEY) return;
  try {
    const { Resend } = require('resend');
    const resend = new Resend(RESEND_API_KEY);
    await resend.emails.send({
      from: 'Dawn Brief System <newsletter@ayushbrief.online>',
      to: [ALERT_EMAIL],
      subject: `🚨 Dawn Brief Alert: ${subject}`,
      html: `<div style="font-family:Arial;padding:20px;background:#07070F;color:#fff;">
        <h2 style="color:#FF4D6D;">🚨 Dawn Brief System Alert</h2>
        <p style="color:#fff;">${message}</p>
        <p style="color:rgba(255,255,255,.5);font-size:12px;">Time: ${new Date().toLocaleString('en-IN', {timeZone:'Asia/Kolkata'})} IST</p>
      </div>`
    });
    console.log(`📧 Alert email sent: ${subject}`);
  } catch (err) {
    console.log(`⚠️  Alert email failed: ${err.message}`);
  }
}

// ── CLASSIFY + IMPORTANCE ─────────────────────────────────────────────────────
async function classifyAndScore(headline, summary, expectedCategory) {
  const prompt = `You are a strict news classifier for an Indian newsletter.

TASK: Classify this story AND assign importance. Today is ${new Date().toISOString().split('T')[0]}.

IMPORTANT: If the headline or summary mentions a year like 2023, 2024, or clearly refers to a past event that is not relevant today, mark importance as ⚪ SKIP.

CATEGORIES: Business, Indian Economy, Finance, Tech, Sports, Government, International, Climate, Startups & Auto, Science & Health, Entertainment

Expected category hint: ${expectedCategory}

IMPORTANCE:
🔴 MUST COVER — Breaking, trending, directly affects Indians today
🟡 GOOD TO COVER — Relevant but not breaking
⚪ SKIP — Old news, irrelevant, non-Indian, mentions past years explicitly

STORY:
Headline: "${headline}"
Summary: "${(summary || '').slice(0, 200)}"

Reply EXACTLY:
CATEGORY: [name]
IMPORTANCE: [emoji + label]
REASON: [one line]`;

  try {
    const result = await callClaudeAPI(prompt, 100);
    const lines = result.split('\n');
    let category = expectedCategory, importance = '🟡', reason = '';
    for (const line of lines) {
      if (line.startsWith('CATEGORY:')) {
        const cat = line.replace('CATEGORY:', '').trim();
        if (VALID_CATEGORIES.includes(cat)) category = cat;
      }
      if (line.startsWith('IMPORTANCE:')) {
        const imp = line.replace('IMPORTANCE:', '').trim();
        if (imp.includes('🔴') || imp.includes('MUST')) importance = '🔴';
        else if (imp.includes('🟡') || imp.includes('GOOD')) importance = '🟡';
        else if (imp.includes('⚪') || imp.includes('SKIP')) importance = '⚪';
      }
      if (line.startsWith('REASON:')) reason = line.replace('REASON:', '').trim();
    }
    return { category, importance, reason };
  } catch (err) {
    return { category: expectedCategory, importance: '🟡', reason: '' };
  }
}

// ── SAVE TO SUPABASE ──────────────────────────────────────────────────────────
async function saveStoriesToSupabase(stories, runDate) {
  try {
    await fetch(`${SUPA_URL}/rest/v1/daily_stories?run_date=eq.${runDate}&status=eq.pending`, {
      method: 'DELETE',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
    });
    const batchSize = 20;
    for (let i = 0; i < stories.length; i += batchSize) {
      const batch = stories.slice(i, i + batchSize);
      await fetch(`${SUPA_URL}/rest/v1/daily_stories`, {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(batch)
      });
    }
    console.log(`✅ ${stories.length} stories saved to Supabase`);
  } catch (err) {
    console.log(`❌ Supabase save failed: ${err.message}`);
    throw err;
  }
}

// ── LOAD PREVIOUS DAY ─────────────────────────────────────────────────────────
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
    return await res.json() || [];
  } catch (err) {
    return [];
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌅 The Dawn Brief — Fetch & Score Run');
  console.log('='.repeat(50));
  const runDate = new Date().toISOString().split('T')[0];
  const failedCategories = [];
  const allStories = [];

  for (const category of VALID_CATEGORIES) {
    console.log(`\n📡 Fetching: ${category}`);
    let items = [];
    let source = '';

    // ── LAYER 1: RSS feeds ──────────────────────────────────────────────────
    const feeds = CATEGORY_FEEDS[category] || [];
    for (const feed of feeds) {
      const feedItems = await fetchFeed(feed.url, feed.source);
      items.push(...feedItems);
      await new Promise(r => setTimeout(r, 200));
    }

    // Deduplicate
    const seen = new Set();
    items = items.filter(i => {
      if (!isEnglishHeadline(i.title)) return false;
      if (!i.title || !i.summary || i.summary.length < 30) return false;
      const key = i.title.slice(0, 60).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    source = 'RSS';
    console.log(`   RSS: ${items.length} fresh stories`);

    // ── LAYER 2: NewsData.io if RSS has < 5 stories ─────────────────────────
    if (items.length < 5 && NEWSDATA_KEY) {
      console.log(`   ⚠️  RSS low — trying NewsData.io...`);
      const ndItems = await fetchNewsData(category);
      if (ndItems.length > 0) {
        items.push(...ndItems);
        source = 'NewsData+RSS';
        console.log(`   NewsData: +${ndItems.length} stories`);
      }
    }

    // ── LAYER 3: NewsData.io only if RSS completely failed ──────────────────
    if (items.length === 0 && NEWSDATA_KEY) {
      console.log(`   ⚠️  RSS failed — trying NewsData.io only...`);
      const ndItems = await fetchNewsData(category);
      items = ndItems;
      source = 'NewsData';
      if (items.length > 0) {
        await sendAlertEmail(
          `RSS failed for ${category}`,
          `RSS feeds returned 0 stories for <b>${category}</b>. Switched to NewsData.io which returned ${items.length} stories.`
        );
      }
    }

    // ── LAYER 4: Previous day if everything failed ──────────────────────────
    if (items.length === 0) {
      console.log(`   ❌ All sources failed — loading previous day...`);
      const prevStories = await loadPreviousDayStories(category);
      const prevMarked = prevStories.slice(0, 10).map(s => ({
        ...s,
        run_date: runDate,
        status: 'pending',
        is_previous_day: true,
        importance: '🟡',
        reason: 'Previous day story — no fresh news available today'
      }));
      allStories.push(...prevMarked);
      failedCategories.push(category);
      console.log(`   📦 ${category}: ${prevMarked.length} from previous day`);
      continue;
    }

    // ── CLASSIFY ────────────────────────────────────────────────────────────
    const classified = [];
    for (const item of items.slice(0, 20)) {
      const { category: cat, importance, reason } = await classifyAndScore(item.title, item.summary, category);
      if (importance !== '⚪') {
        // Fetch image
      const imgData = await fetchImageForStory(item, cat);
      classified.push({
          headline: item.title,
          summary: item.summary.slice(0, 500),
          link: item.link || '',
          pub_date: item.pubDate || '',
          source: item.source || source,
          category: cat,
          importance,
          reason,
          run_date: runDate,
          status: 'pending',
          voices: null,
          is_previous_day: false,
          image_url: imgData ? imgData.url : null,
          image_source: imgData ? imgData.source : null
        });
      }
      await new Promise(r => setTimeout(r, 150));
    }

    // Sort — 🔴 first
    classified.sort((a, b) => {
      if (a.importance === '🔴' && b.importance !== '🔴') return -1;
      if (b.importance === '🔴' && a.importance !== '🔴') return 1;
      return 0;
    });

    allStories.push(...classified.slice(0, 20));
    console.log(`   ✅ ${category}: ${classified.length} stories (source: ${source})`);
  }

  // ── SEND ALERT if any categories failed ────────────────────────────────────
  if (failedCategories.length > 0) {
    await sendAlertEmail(
      `${failedCategories.length} categories using previous day stories`,
      `The following categories had <b>zero fresh news</b> today and are showing previous day stories:<br><br><b>${failedCategories.join(', ')}</b><br><br>Please check RSS feeds and NewsData.io key.`
    );
  }

  // ── SAVE ────────────────────────────────────────────────────────────────────
  console.log('\n💾 Saving to Supabase...');
  try {
    await saveStoriesToSupabase(allStories, runDate);
  } catch (err) {
    await sendAlertEmail(
      'Supabase save FAILED',
      `Critical error — stories could not be saved to Supabase.<br><br>Error: ${err.message}<br><br>Previous day stories will be served automatically.`
    );
  }

  // ── SUMMARY ─────────────────────────────────────────────────────────────────
  const summary = {
    run_date: runDate,
    generated: new Date().toISOString(),
    total_stories: allStories.length,
    failed_categories: failedCategories,
    categories: VALID_CATEGORIES.map(c => ({
      name: c,
      count: allStories.filter(s => s.category === c).length,
      must_cover: allStories.filter(s => s.category === c && s.importance === '🔴').length,
      has_previous_day: allStories.some(s => s.category === c && s.is_previous_day)
    }))
  };

  fs.writeFileSync(path.join(__dirname, 'data-fetch.json'), JSON.stringify(summary, null, 2));
  console.log(`\n✅ Total ${allStories.length} stories ready`);
  console.log('='.repeat(50));
}

main().catch(async err => {
  console.error('❌ Fatal error:', err);
  await sendAlertEmail('FATAL ERROR in fetch script', `The entire fetch script crashed.<br><br>Error: ${err.message}<br><br>No new stories today. Previous day fallback will activate.`);
  process.exit(1);
});
