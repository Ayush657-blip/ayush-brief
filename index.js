const Parser = require('rss-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const parser = new Parser({ timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
const resend = new Resend(process.env.RESEND_API_KEY);

// ── SUPABASE CONFIG ───────────────────────────────────────────────────────────
const SUPA_URL = 'https://ygkviidhuqicfnvyuiiu.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY || 'sb_publishable_mklkZ61P5MmwCA7UyIEOEQ_rmFbaV3k';

// ── 16 CATEGORIES WITH RSS FEEDS ─────────────────────────────────────────────
const RSS_FEEDS = {
  'Auto': [
    'https://economictimes.indiatimes.com/industry/auto/rss.cms',
    'https://feeds.bbci.co.uk/news/business/rss.xml'
  ],
  'Business': [
    'https://economictimes.indiatimes.com/markets/rss.cms',
    'https://www.livemint.com/rss/companies',
    'https://www.business-standard.com/rss/companies-101.rss'
  ],
  'Climate': [
    'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
    'https://economictimes.indiatimes.com/industry/energy/rss.cms'
  ],
  'Culture': [
    'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
    'https://economictimes.indiatimes.com/industry/media/entertainment/rss.cms'
  ],
  'Entertainment': [
    'https://economictimes.indiatimes.com/industry/media/entertainment/media/rss.cms',
    'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'
  ],
  'Finance': [
    'https://economictimes.indiatimes.com/markets/stocks/rss.cms',
    'https://www.livemint.com/rss/market',
    'https://www.business-standard.com/rss/finance-321.rss'
  ],
  'Government': [
    'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3',
    'https://economictimes.indiatimes.com/news/politics-and-nation/rss.cms'
  ],
  'International': [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'
  ],
  'Lifestyle': [
    'https://feeds.bbci.co.uk/news/health/rss.xml',
    'https://economictimes.indiatimes.com/magazines/panache/rss.cms'
  ],
  'Media': [
    'https://economictimes.indiatimes.com/industry/media/entertainment/media/rss.cms',
    'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'
  ],
  'Real Estate': [
    'https://economictimes.indiatimes.com/industry/services/property-/-cstruction/rss.cms',
    'https://www.livemint.com/rss/industry'
  ],
  'Science': [
    'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
    'https://www.thehindu.com/sci-tech/science/feeder/default.rss'
  ],
  'Sports': [
    'https://feeds.bbci.co.uk/sport/rss.xml',
    'https://economictimes.indiatimes.com/news/sports/rss.cms'
  ],
  'Tech': [
    'https://economictimes.indiatimes.com/tech/rss.cms',
    'https://feeds.bbci.co.uk/news/technology/rss.xml',
    'https://techcrunch.com/feed/'
  ],
  'Travel': [
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://economictimes.indiatimes.com/industry/transportation/airlines-/-aviation/rss.cms'
  ],
  'Indian Economy': [
    'https://economictimes.indiatimes.com/economy/rss.cms',
    'https://www.livemint.com/rss/economy',
    'https://www.business-standard.com/rss/economy-102.rss'
  ]
};

// ── 3 VOICE CONFIG ────────────────────────────────────────────────────────────
const VOICE_CONFIG = {
  'student': {
    label: '🎓 Student',
    color: '#FF4D6D',
    bg: '#FFF0F3'
  },
  'employee': {
    label: '💼 Employee',
    color: '#FFAA55',
    bg: '#FFF8EE'
  },
  'agent': {
    label: '🌾 Commission Agent',
    color: '#E8C558',
    bg: '#FFFBEE'
  }
};

// ── VALID VOICE KEYS ──────────────────────────────────────────────────────────
const VALID_VOICE_KEYS = ['student', 'employee', 'agent'];

// ── GET VOICE KEY ─────────────────────────────────────────────────────────────
function getVoiceKey(role) {
  if (role && VALID_VOICE_KEYS.includes(role)) return role;
  // Fallback for old subscribers
  if (role && role.includes('student')) return 'student';
  if (role && role.includes('employee')) return 'employee';
  if (role === 'agent') return 'agent';
  return 'student';
}

// ── FETCH RSS FEED ────────────────────────────────────────────────────────────
async function fetchFeed(url) {
  try {
    const feed = await parser.parseURL(url);
    return feed.items.slice(0, 3).map(item => ({
      title: item.title || '',
      summary: item.contentSnippet || item.content || item.summary || '',
      link: item.link || '',
      pubDate: item.pubDate || item.isoDate || ''
    }));
  } catch (err) {
    console.log(`⚠️  Feed failed: ${url} — ${err.message}`);
    return [];
  }
}

// ── DETECT NEWS TYPE ──────────────────────────────────────────────────────────
function detectNewsType(title, category) {
  const t = title.toLowerCase();

  // Economy & Money
  if (t.includes('sensex') && (t.includes('up') || t.includes('rise') || t.includes('gain') || t.includes('high') || t.includes('surge'))) return 1;
  if (t.includes('sensex') && (t.includes('down') || t.includes('fall') || t.includes('crash') || t.includes('drop') || t.includes('plunge'))) return 2;
  if (t.includes('interest rate') || t.includes('repo rate') || t.includes('rbi rate')) return 3;
  if (t.includes('inflation') && (t.includes('rise') || t.includes('high') || t.includes('up') || t.includes('surge'))) return 4;
  if (t.includes('inflation') && (t.includes('fall') || t.includes('low') || t.includes('down') || t.includes('ease'))) return 5;
  if (t.includes('rupee') && (t.includes('fall') || t.includes('weak') || t.includes('low') || t.includes('drop'))) return 6;
  if (t.includes('rupee') && (t.includes('rise') || t.includes('strong') || t.includes('high') || t.includes('gain'))) return 7;
  if (t.includes('tax') && t.includes('polic')) return 8;
  if (t.includes('budget')) return 9;
  if (t.includes('bank') && (t.includes('scam') || t.includes('fraud'))) return 10;

  // Government & Politics
  if (t.includes('government') && t.includes('polic')) return 11;
  if (t.includes('election') && t.includes('result')) return 12;
  if (t.includes('scam') || t.includes('corruption')) return 13;
  if (t.includes('scheme') && t.includes('launch')) return 14;
  if (t.includes('court') || t.includes('judgment') || t.includes('verdict')) return 15;
  if (t.includes('parliament') || t.includes('lok sabha') || t.includes('rajya sabha')) return 16;

  // Business & Corporate
  if (t.includes('profit') || t.includes('record quarter') || t.includes('earnings up')) return 17;
  if (t.includes('loss') || t.includes('earnings down') || t.includes('revenue fall')) return 18;
  if (t.includes('launch') && (t.includes('product') || t.includes('new'))) return 19;
  if (t.includes('price') && (t.includes('hike') || t.includes('rise') || t.includes('increase'))) return 20;
  if (t.includes('price') && (t.includes('cut') || t.includes('fall') || t.includes('reduce'))) return 21;
  if (t.includes('merger') || t.includes('acquisition') || t.includes('acqui')) return 22;
  if (t.includes('funding') || t.includes('investment') || t.includes('series')) return 23;
  if (t.includes('layoff') || t.includes('shutdown') || t.includes('fired') || t.includes('job cut')) return 24;
  if (t.includes('ceo') && (t.includes('resign') || t.includes('quit') || t.includes('step'))) return 25;

  // FMCG & Retail
  if (t.includes('fmcg') || t.includes('hul') || t.includes('itc') || t.includes('nestle') || t.includes('marico')) return 26;
  if (t.includes('rural') && (t.includes('demand') || t.includes('growth') || t.includes('consumption')) && !t.includes('fall') && !t.includes('down')) return 27;
  if (t.includes('rural') && (t.includes('demand') || t.includes('slow')) && (t.includes('fall') || t.includes('down') || t.includes('decline'))) return 28;
  if (t.includes('blinkit') || t.includes('zepto') || t.includes('quick commerce') || t.includes('q-commerce')) return 29;
  if (t.includes('supply chain') || t.includes('distribution')) return 30;
  if (t.includes('gst') && t.includes('consumer')) return 31;

  // International
  if (t.includes('war') || t.includes('attack') || t.includes('missile') || t.includes('strike')) return 32;
  if (t.includes('ceasefire') || t.includes('peace') || t.includes('deal')) return 33;
  if (t.includes('recession') || t.includes('global slowdown')) return 34;
  if (t.includes('oil') && (t.includes('rise') || t.includes('high') || t.includes('up'))) return 35;
  if (t.includes('oil') && (t.includes('fall') || t.includes('low') || t.includes('down'))) return 36;
  if (t.includes('trade') && (t.includes('deal') || t.includes('tariff'))) return 37;
  if (t.includes('tension') || t.includes('geopolit')) return 38;

  // Technology
  if (t.includes('ai') || t.includes('artificial intelligence') || t.includes('tech launch')) return 39;
  if (t.includes('cyber') || t.includes('hack') || t.includes('data breach')) return 40;
  if (t.includes('social media') || t.includes('instagram') || t.includes('twitter') || t.includes('facebook')) return 41;
  if (t.includes('isro') || t.includes('space') || t.includes('satellite')) return 42;

  // Society & India
  if (t.includes('flood') || t.includes('earthquake') || t.includes('cyclone') || t.includes('disaster')) return 43;
  if (t.includes('accident') || t.includes('crash') || t.includes('tragedy')) return 44;
  if (t.includes('death') || t.includes('died') || t.includes('passes away')) return 45;
  if (t.includes('communal') || t.includes('riot') || t.includes('religious')) return 46;
  if (t.includes('disease') || t.includes('virus') || t.includes('outbreak') || t.includes('health')) return 47;
  if (t.includes('education') && t.includes('polic')) return 48;
  if (t.includes('farmer') || t.includes('agriculture') || t.includes('kisan')) return 49;
  if (t.includes('weather') || t.includes('climate') || t.includes('monsoon') || t.includes('rain')) return 50;

  // Sports
  if (t.includes('india') && t.includes('win') && t.includes('cricket')) return 51;
  if (t.includes('india') && t.includes('lose') && t.includes('cricket')) return 52;
  if (t.includes('india') && t.includes('win') && !t.includes('cricket')) return 53;
  if (t.includes('india') && t.includes('lose') && !t.includes('cricket')) return 54;
  if (t.includes('injur') || t.includes('controversy') && t.includes('player')) return 55;
  if (t.includes('ipl') || t.includes('tournament')) return 56;

  // Entertainment & Culture
  if (t.includes('film') || t.includes('movie') || t.includes('bollywood') || t.includes('release')) return 57;
  if (t.includes('celebrity') || t.includes('actor') || t.includes('controversy')) return 58;
  if (t.includes('ott') || t.includes('netflix') || t.includes('amazon prime') || t.includes('streaming')) return 59;
  if (t.includes('music') || t.includes('award') || t.includes('grammy')) return 60;

  // Jobs & Career
  if (t.includes('layoff') || t.includes('job cut') || t.includes('retrench')) return 61;
  if (t.includes('hiring') || t.includes('job') && t.includes('creat')) return 62;
  if (t.includes('salary') || t.includes('appraisal') || t.includes('increment')) return 63;
  if (t.includes('work from home') || t.includes('wfh') || t.includes('remote work') || t.includes('office')) return 64;

  // Health & Medicine
  if (t.includes('drug') || t.includes('medicine') || t.includes('breakthrough') || t.includes('vaccine')) return 65;
  if (t.includes('hospital') && (t.includes('scam') || t.includes('fraud'))) return 66;
  if (t.includes('mental health') || t.includes('depression') || t.includes('anxiety')) return 67;
  if (t.includes('food') && (t.includes('safety') || t.includes('adulterat'))) return 68;

  // Infrastructure
  if (t.includes('road') || t.includes('highway') || t.includes('bridge')) return 69;
  if (t.includes('railway') || t.includes('metro') || t.includes('train')) return 70;
  if (t.includes('airport') || t.includes('aviation') || t.includes('airline')) return 71;
  if (t.includes('power') || t.includes('electricity') || t.includes('energy')) return 72;

  // Mandi & Agriculture
  if (t.includes('crop') && (t.includes('price') || t.includes('rate')) && !t.includes('fall') && !t.includes('down')) return 73;
  if (t.includes('crop') && (t.includes('price') || t.includes('rate')) && (t.includes('fall') || t.includes('down'))) return 74;
  if (t.includes('monsoon') || t.includes('rainfall') || t.includes('forecast')) return 75;
  if (t.includes('fertiliser') || t.includes('pesticide') || t.includes('fertilizer')) return 76;
  if (t.includes('grain') && (t.includes('export') || t.includes('import'))) return 77;

  // Banking & Personal Finance
  if (t.includes('home loan') || t.includes('emi') || t.includes('mortgage')) return 78;
  if (t.includes('gold') && (t.includes('rise') || t.includes('high') || t.includes('up'))) return 79;
  if (t.includes('gold') && (t.includes('fall') || t.includes('low') || t.includes('down'))) return 80;
  if (t.includes('petrol') || t.includes('diesel') || t.includes('fuel')) return 81;
  if (t.includes('lpg') || t.includes('cng') || t.includes('gas price')) return 82;

  // Social Media & Viral
  if (t.includes('viral') || t.includes('cancel') || t.includes('trend')) return 83;
  if (t.includes('influencer') || t.includes('creator') || t.includes('youtuber')) return 84;

  // Crime
  if (t.includes('scam') && t.includes('expos')) return 85;
  if (t.includes('kidnap') || t.includes('murder') || t.includes('crime')) return 86;
  if (t.includes('cyber fraud') || t.includes('online fraud') || t.includes('phishing')) return 87;

  // Category-based fallback
  const categoryMap = {
    'Finance': 1,
    'Business': 17,
    'Indian Economy': 9,
    'Government': 11,
    'International': 38,
    'Tech': 39,
    'Sports': 56,
    'Entertainment': 57,
    'Auto': 19,
    'Science': 42,
    'Climate': 50,
    'Real Estate': 78,
    'Travel': 71,
    'Lifestyle': 47,
    'Media': 41,
    'Culture': 57
  };

  return categoryMap[category] || 17;
}

// ── FETCH VOICE FROM SUPABASE ─────────────────────────────────────────────────
async function fetchVoiceFromSupabase(newsTypeId, voiceKey) {
  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/voice_library?news_type_id=eq.${newsTypeId}&voice=eq.${voiceKey}&select=content,status`,
      {
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`
        }
      }
    );
    if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
    const data = await res.json();
    if (data.length > 0 && data[0].content && data[0].status === 'approved') {
      return data[0].content;
    }
    return null;
  } catch (err) {
    console.log(`⚠️  Supabase voice fetch failed: ${err.message}`);
    return null;
  }
}

// ── PROCESS ONE CATEGORY ──────────────────────────────────────────────────────
async function processCategory(category, urls) {
  console.log(`\n📰 Processing: ${category}`);
  const allItems = [];
  for (const url of urls) {
    const items = await fetchFeed(url);
    allItems.push(...items);
  }
  if (allItems.length === 0) {
    console.log(`   No items found for ${category}`);
    return null;
  }
  const best = allItems.find(i => i.title && i.summary && i.summary.length > 50) || allItems[0];
  if (!best || !best.title) return null;

  const newsTypeId = detectNewsType(best.title, category);
  console.log(`   ✓ ${best.title.slice(0, 60)}... [Type: ${newsTypeId}]`);

  // Fetch voices from Supabase for all 3 voice keys
  const voices = {};
  for (const voiceKey of VALID_VOICE_KEYS) {
    const content = await fetchVoiceFromSupabase(newsTypeId, voiceKey);
    voices[voiceKey] = content || best.summary.slice(0, 150);
    if (content) {
      console.log(`   ✓ ${voiceKey} voice loaded from Supabase`);
    } else {
      console.log(`   ⚠️  ${voiceKey} voice not found — using summary fallback`);
    }
  }

  return { category, headline: best.title, link: best.link, pubDate: best.pubDate, newsTypeId, voices };
}

// ── FETCH ALL ACTIVE SUBSCRIBERS FROM SUPABASE ────────────────────────────────
async function fetchSubscribers() {
  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/subscribers?is_active=eq.true&select=email,name,role`,
      {
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`
        }
      }
    );
    if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
    const data = await res.json();
    console.log(`✅ ${data.length} active subscribers fetched`);
    return data;
  } catch (err) {
    console.log(`❌ Failed to fetch subscribers: ${err.message}`);
    if (process.env.MY_EMAIL) {
      return [{ email: process.env.MY_EMAIL, name: 'Ayush', role: 'student' }];
    }
    return [];
  }
}

// ── BUILD EMAIL HTML FOR ONE SUBSCRIBER ──────────────────────────────────────
function buildEmailHTML(stories, date, subscriber) {
  const { name, role } = subscriber;
  const voiceKey = getVoiceKey(role);
  const voice = VOICE_CONFIG[voiceKey];
  const firstName = ((name || 'friend').split(' ')[0].charAt(0).toUpperCase() + (name || 'friend').split(' ')[0].slice(1));
  const topStories = stories.slice(0, 6);

  const greetings = {
    'student':  `Yaar ${firstName}, aaj ki brief aa gayi — 7 minute mein poori duniya. ☀`,
    'employee': `${firstName} bhai, chai le aur yeh padh — aaj ki brief ready hai. ☕`,
    'agent':    `${firstName} bhai, aaj ki zaroori khabrein — mandi ke kaam ki. 🌾`
  };

  const greeting = greetings[voiceKey] || `Good morning ${firstName}!`;

  const storyCards = topStories.map(s => {
    const voiceText = s.voices[voiceKey] || s.headline;
    return `
    <tr>
      <td style="padding:0 0 16px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="background:#0C0C18;border-radius:12px;border:.5px solid rgba(255,255,255,.07);overflow:hidden;">
          <tr><td style="height:2px;background:linear-gradient(90deg,#2979FF,#00B4FF);"></td></tr>
          <tr>
            <td style="padding:18px 22px;">
              <p style="margin:0 0 8px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(92,200,255,.55);font-weight:600;">${s.category}</p>
              <h3 style="margin:0 0 12px;font-family:Georgia,serif;font-size:16px;color:rgba(255,255,255,.9);line-height:1.4;">${s.headline}</h3>
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background:${voice.bg};border-radius:8px;border-left:3px solid ${voice.color};">
                <tr>
                  <td style="padding:12px 14px;">
                    <p style="margin:0 0 5px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${voice.color};font-weight:700;">${voice.label}</p>
                    <p style="margin:0;font-size:14px;color:#1A1208;line-height:1.7;">${voiceText}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:10px 0 0;">
                <a href="${s.link}" style="color:#5CC8FF;font-size:12px;font-weight:600;text-decoration:none;">Read full story →</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#07070F;font-family:-apple-system,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#07070F;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <tr><td style="height:1.5px;background:linear-gradient(90deg,transparent,#5CC8FF,#fff,#5CC8FF,transparent);"></td></tr>

        <tr>
          <td style="background:#07070F;border-radius:16px 16px 0 0;padding:28px 32px 20px;text-align:center;border:.5px solid rgba(255,255,255,.05);">
            <p style="margin:0 0 6px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:rgba(92,200,255,.5);">Daily Intelligence · India</p>
            <h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:28px;font-weight:900;color:#E8C558;">☀ The Dawn Brief</h1>
            <p style="margin:0;font-size:13px;color:rgba(255,255,255,.35);">${date}</p>
          </td>
        </tr>

        <tr>
          <td style="background:#0C0C18;padding:18px 32px;border-left:.5px solid rgba(255,255,255,.05);border-right:.5px solid rgba(255,255,255,.05);">
            <p style="margin:0;font-size:14px;color:rgba(255,255,255,.7);line-height:1.65;">${greeting}</p>
          </td>
        </tr>

        <tr>
          <td style="background:#07070F;padding:20px 32px;border:.5px solid rgba(255,255,255,.05);border-top:none;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              ${storyCards}
            </table>
          </td>
        </tr>

        <tr>
          <td style="background:#07070F;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;border:.5px solid rgba(255,255,255,.05);border-top:none;">
            <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:15px;color:#E8C558;">☀ The Dawn Brief</p>
            <p style="margin:0 0 10px;font-size:11px;color:rgba(255,255,255,.2);">Built by Ayush Bansal · Kaithal, Haryana</p>
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,.2);">
              <a href="https://ayushbrief.online" style="color:#5CC8FF;text-decoration:none;">ayushbrief.online</a>
              &nbsp;·&nbsp;
              <a href="https://ayushbrief.online/unsubscribe" style="color:rgba(255,255,255,.2);text-decoration:none;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── SEND EMAIL TO ONE SUBSCRIBER ──────────────────────────────────────────────
async function sendToSubscriber(subscriber, stories, date) {
  const { email, role } = subscriber;
  const voiceKey = getVoiceKey(role);

  const subjects = {
    'student':  `☀ Yaar sun — aaj ki brief aai hai`,
    'employee': `☀ Chai le aur padh — aaj ki brief`,
    'agent':    `☀ Aaj ki zaroori khabrein — The Dawn Brief`
  };

  const subject = subjects[voiceKey] || `☀ The Dawn Brief — ${date}`;

  try {
    const html = buildEmailHTML(stories, date, subscriber);
    const { data, error } = await resend.emails.send({
      from: 'The Dawn Brief <newsletter@ayushbrief.online>',
      to: [email],
      subject,
      html
    });
    if (error) {
      console.log(`❌ Failed for ${email}: ${JSON.stringify(error)}`);
    } else {
      console.log(`✅ Sent → ${email} [${voiceKey}] ID: ${data?.id}`);
    }
  } catch (err) {
    console.log(`❌ Error for ${email}: ${err.message}`);
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌅 The Dawn Brief — Starting build...');
  console.log('='.repeat(50));

  const date = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Step 1 — Subscribers
  console.log('\n👥 Fetching subscribers from Supabase...');
  const subscribers = await fetchSubscribers();
  if (subscribers.length === 0) { console.log('❌ No subscribers. Exiting.'); return; }

  // Step 2 — News
  console.log('\n📰 Fetching news...');
  const stories = [];
  for (const [category, urls] of Object.entries(RSS_FEEDS)) {
    try {
      const story = await processCategory(category, urls);
      if (story) stories.push(story);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.log(`❌ ${category}: ${err.message}`);
    }
  }
  console.log(`\n✅ ${stories.length} stories processed`);

  // Step 3 — Save data.json
  fs.writeFileSync(
    path.join(__dirname, 'data.json'),
    JSON.stringify({ generated: new Date().toISOString(), date, totalStories: stories.length, stories }, null, 2)
  );
  console.log('✅ data.json saved');

  // Step 4 — Send personalised emails
  if (stories.length > 0) {
    console.log(`\n📧 Sending to ${subscribers.length} subscribers...`);
    console.log('─'.repeat(50));
    for (const subscriber of subscribers) {
      await sendToSubscriber(subscriber, stories, date);
      await new Promise(r => setTimeout(r, 300));
    }
    console.log('─'.repeat(50));
    console.log('✅ All emails sent');
  }

  console.log('\n🌅 Build complete!');
  console.log('='.repeat(50));
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
