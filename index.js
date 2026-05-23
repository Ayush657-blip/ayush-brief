const Parser = require('rss-parser');
const { Groq } = require('groq-sdk');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const parser = new Parser({ timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
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

// ── 5 VOICE PROMPTS ───────────────────────────────────────────────────────────
const VOICE_PROMPTS = {

  'student-frustrated': {
    label: '🎓 Student',
    color: '#4A7FE8',
    bg: '#EEF4FF',
    prompt: `You are texting a frustrated Indian student (20-24 years old) who is stressed about exams, placements, and life in general.
They don't want to be taught. They want 10 minutes of relief and something to smile about.
Write like their funniest, most relaxed friend who just read the news — casual Hinglish, warm, slightly funny.
Find the most relatable or absurd angle in this news. Make them smile or go "yaar sahi hai."
ONE sharp useful thing at the end — something they can actually use.
Max 3 lines. No catchphrase at the end. End naturally like a WhatsApp message.
Output ONLY the text, nothing else.`
  },

  'student-happy': {
    label: '🎓 Student',
    color: '#4A7FE8',
    bg: '#EEF4FF',
    prompt: `You are writing for an Indian student (20-24 years old) who is in a good mood today.
Write in clear simple Hinglish. Explain what happened and why it matters for their career or studies.
Give one interview or GD-worthy insight.
Max 3 lines. Straightforward. Respectful. No forced jokes.
Output ONLY the text, nothing else.`
  },

  'employee-frustrated': {
    label: '💼 Employee',
    color: '#D4521A',
    bg: '#FFF4EE',
    prompt: `You are texting a frustrated Indian FMCG employee who is having a tough week.
Targets are not met. Manager is asking. Life is hard.
Write like their street-smart colleague who just read the news on his chai break — punchy, slightly funny, real.
Find what this news means for their actual work day TODAY. One action or one observation.
Max 3 lines. Hinglish. No jargon. End naturally. No catchphrase.
Output ONLY the text, nothing else.`
  },

  'employee-happy': {
    label: '💼 Employee',
    color: '#D4521A',
    bg: '#FFF4EE',
    prompt: `You are writing for an Indian FMCG employee who is having a good week — confident, open, ready to learn.
Write in professional but warm Hinglish. Give them one sharp business insight from this news.
What does this mean for their work, their market, their targets?
Max 3 lines. Clean and direct. No fluff.
Output ONLY the text, nothing else.`
  },

  'agent': {
    label: '🌾 Commission Agent',
    color: '#C94A1A',
    bg: '#FEF3EE',
    prompt: `You are writing for an Indian commission agent (arhatiya) in their late 40s who works at a mandi or wholesale market.
Write in very simple, easy Hinglish — the kind of language used at a chai stall near the mandi.
No English business words. No jargon. Short sentences.
Tell them ONE thing from this news that affects their trade, their buyers, or the market price.
Max 2-3 lines. Warm and honest. Like a trusted friend at the mandi telling them something useful.
Output ONLY the text, nothing else.`
  }
};

// ── GET VOICE KEY FROM IDENTITY + MOOD ───────────────────────────────────────
function getVoiceKey(identity, mood) {
  if (identity === 'agent') return 'agent';
  if (identity === 'student') return mood === 'happy' ? 'student-happy' : 'student-frustrated';
  if (identity === 'employee') return mood === 'happy' ? 'employee-happy' : 'employee-frustrated';
  return 'student-frustrated';
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

// ── GENERATE ONE VOICE ────────────────────────────────────────────────────────
async function generateVoice(title, summary, voiceKey) {
  const voice = VOICE_PROMPTS[voiceKey];
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 200,
      messages: [
        { role: 'system', content: voice.prompt },
        { role: 'user', content: `News: ${title}\n\nContext: ${summary.slice(0, 400)}` }
      ]
    });
    return completion.choices[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.log(`⚠️  Groq failed for ${voiceKey}: ${err.message}`);
    return summary.slice(0, 150);
  }
}

// ── GENERATE ALL 5 VOICES FOR ONE ARTICLE ────────────────────────────────────
async function generateAllVoices(title, summary) {
  const voiceKeys = Object.keys(VOICE_PROMPTS);
  const voices = {};
  const results = await Promise.allSettled(
    voiceKeys.map(key => generateVoice(title, summary, key))
  );
  voiceKeys.forEach((key, i) => {
    voices[key] = results[i].status === 'fulfilled' ? results[i].value : summary.slice(0, 150);
  });
  return voices;
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
  console.log(`   ✓ ${best.title.slice(0, 60)}...`);
  const voices = await generateAllVoices(best.title, best.summary);
  console.log(`   ✓ All 5 voices generated`);
  return { category, headline: best.title, link: best.link, pubDate: best.pubDate, voices };
}

// ── FETCH ALL ACTIVE SUBSCRIBERS FROM SUPABASE ────────────────────────────────
async function fetchSubscribers() {
  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/subscribers?is_active=eq.true&select=email,name,identity,mood`,
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
      return [{ email: process.env.MY_EMAIL, name: 'Ayush', identity: 'student', mood: 'frustrated' }];
    }
    return [];
  }
}

// ── BUILD EMAIL HTML FOR ONE SUBSCRIBER ──────────────────────────────────────
function buildEmailHTML(stories, date, subscriber) {
  const { name, identity, mood } = subscriber;
  const voiceKey = getVoiceKey(identity, mood);
  const voice = VOICE_PROMPTS[voiceKey];
  const firstName = (name || 'friend').split(' ')[0];
  const topStories = stories.slice(0, 6);

  const greetings = {
    'student-frustrated': `Yaar ${firstName}, ek dum chill kar — aaj ki brief padh aur 10 minute ke liye sab bhool ja.`,
    'student-happy': `Good morning ${firstName}! Aaj ki brief — sharp aur useful.`,
    'employee-frustrated': `Aye ${firstName}, chai le aur yeh padh — aaj ki brief mein kuch kaam ki cheezein hain.`,
    'employee-happy': `Good morning ${firstName}! Aaj ka brief — teri morning ka best 7 minutes.`,
    'agent': `${firstName} bhai, aaj ki zaroori khabrein — mandi ke kaam ki.`
  };

  const greeting = greetings[voiceKey] || `Good morning ${firstName}!`;

  const moodToggle = identity !== 'agent'
    ? `<p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.35);">
        Reading in <strong style="color:rgba(255,255,255,.5);">${mood === 'frustrated' ? 'Fun' : 'Normal'} mode</strong> &nbsp;·&nbsp;
        <a href="https://ayushbrief.online" style="color:#5CC8FF;text-decoration:none;">Switch mood on website</a>
       </p>`
    : '';

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
            ${moodToggle}
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
              <a href="https://ayushbrief.online" style="color:rgba(255,255,255,.2);text-decoration:none;">Change mood</a>
              &nbsp;·&nbsp;
              <a href="https://ayushbrief.online" style="color:rgba(255,255,255,.2);text-decoration:none;">Unsubscribe</a>
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
  const { email, identity, mood } = subscriber;
  const voiceKey = getVoiceKey(identity, mood);

  const subjects = {
    'student-frustrated': `☀ Yaar sun — aaj ki brief aai hai`,
    'student-happy':      `☀ The Dawn Brief — ${date}`,
    'employee-frustrated':`☀ Chai le aur padh — aaj ki brief`,
    'employee-happy':     `☀ The Dawn Brief — ${date}`,
    'agent':              `☀ Aaj ki zaroori khabrein — The Dawn Brief`
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
      console.log(`✅ Sent → ${email} [${identity}/${mood || 'no-mood'}] ID: ${data?.id}`);
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
