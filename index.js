const Parser = require('rss-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const parser = new Parser({ timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
const resend = new Resend(process.env.RESEND_API_KEY);
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;

// ── SUPABASE CONFIG ───────────────────────────────────────────────────────────
const SUPA_URL = 'https://ygkviidhuqicfnvyuiiu.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY;

// ── RSS FEEDS ─────────────────────────────────────────────────────────────────
const RSS_FEEDS = {
  'Business': [
    'https://economictimes.indiatimes.com/markets/rss.cms',
    'https://www.livemint.com/rss/companies',
    'https://www.business-standard.com/rss/companies-101.rss'
  ],
  'Indian Economy': [
    'https://economictimes.indiatimes.com/economy/rss.cms',
    'https://www.livemint.com/rss/economy',
    'https://www.business-standard.com/rss/economy-102.rss'
  ],
  'Finance': [
    'https://economictimes.indiatimes.com/markets/stocks/rss.cms',
    'https://www.livemint.com/rss/market',
    'https://www.business-standard.com/rss/finance-321.rss'
  ],
  'Tech': [
    'https://economictimes.indiatimes.com/tech/rss.cms',
    'https://feeds.bbci.co.uk/news/technology/rss.xml',
    'https://techcrunch.com/feed/'
  ],
  'Sports': [
    'https://feeds.bbci.co.uk/sport/rss.xml',
    'https://economictimes.indiatimes.com/news/sports/rss.cms'
  ],
  'Government': [
    'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3',
    'https://economictimes.indiatimes.com/news/politics-and-nation/rss.cms'
  ],
  'International': [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'
  ],
  'Climate': [
    'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
    'https://economictimes.indiatimes.com/industry/energy/rss.cms'
  ],
  'Auto': [
    'https://economictimes.indiatimes.com/industry/auto/rss.cms',
    'https://feeds.bbci.co.uk/news/business/rss.xml'
  ],
  'Science': [
    'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
    'https://www.thehindu.com/sci-tech/science/feeder/default.rss'
  ],
  'Entertainment': [
    'https://economictimes.indiatimes.com/industry/media/entertainment/media/rss.cms',
    'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'
  ]
};

// ── FETCH RSS FEED ────────────────────────────────────────────────────────────
async function fetchFeed(url) {
  try {
    const feed = await parser.parseURL(url);
    return feed.items.slice(0, 5).map(item => ({
      title: (item.title || '').trim(),
      summary: (item.contentSnippet || item.content || item.summary || '').trim(),
      link: item.link || '',
      pubDate: item.pubDate || item.isoDate || ''
    }));
  } catch (err) {
    console.log(`⚠️  Feed failed: ${url} — ${err.message}`);
    return [];
  }
}

// ── CALL CLAUDE API ───────────────────────────────────────────────────────────
async function callClaudeAPI(prompt) {
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
      max_tokens: 300,
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

// ── GENERATE VOICE SUMMARY ────────────────────────────────────────────────────
async function generateVoiceSummary(headline, plainSummary, category, role, region) {
  const isHinglish = region === 'north' || region === 'west';

  let voiceInstruction = '';

  if (role === 'student' && isHinglish) {
    voiceInstruction = `You are writing for an Indian PGDM/MBA student from North or West India.
Write in Hinglish (mix of Hindi and English) — casual, funny, like a WhatsApp message from a smart batchmate.
Reference college life, placement pressure, assignments, exams, or campus life where relevant.
Example style: "Bhai yeh sun — RBI ne rate cut kar diya. Teri EMI toh baad mein, pehle placement ho jaaye."`;
  } else if (role === 'student' && !isHinglish) {
    voiceInstruction = `You are writing for an Indian college student from South or East India.
Write in Comedy English — sharp, punchy, funny, like a WhatsApp message from a smart friend.
Reference college life, placement pressure, assignments, or campus life where relevant.
Example style: "RBI cut rates. Your education loan gets cheaper. Your placement anxiety does not. Unrelated."`;
  } else if (role === 'professional' && isHinglish) {
    voiceInstruction = `You are writing for an Indian working professional from North or West India.
Write in Hinglish (mix of Hindi and English) — sharp, funny, like a message from a smart office colleague.
Reference boss, salary, appraisals, office politics, targets, or work life where relevant.
Example style: "Rate cut ho gaya bhai. EMI thodi kam hogi. Boss phir bhi raise nahi dega. Alag baat hai."`;
  } else {
    voiceInstruction = `You are writing for an Indian working professional from South or East India.
Write in Comedy English — sharp, punchy, funny, like a message from a smart colleague at the coffee machine.
Reference boss, salary, appraisals, office politics, or work life where relevant.
Example style: "RBI cut rates. Your home loan EMI drops a little. Your boss will not give you a raise though. Totally unrelated."`;
  }

  const prompt = `${voiceInstruction}

NEWS HEADLINE: "${headline}"
PLAIN SUMMARY: "${plainSummary}"
CATEGORY: ${category}

Write a 2-3 line summary about THIS SPECIFIC story. 
Stay exactly on this headline and topic. Do not talk about anything else.
Do not use quotation marks around the summary.
Do not add any preamble like "Here is the summary" or "Sure".
Just write the summary directly.
Maximum 60 words.`;

  try {
    const summary = await callClaudeAPI(prompt);
    // Clean up any accidental quotes
    return summary.replace(/^["'""]|["'""]$/g, '').trim();
  } catch (err) {
    console.log(`⚠️  Claude failed for "${headline.slice(0, 40)}..." — using plain summary`);
    return plainSummary.slice(0, 200);
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
    console.log(`   ⚠️  No items found for ${category}`);
    return null;
  }

  // Pick the best story — has both title and summary
  const best = allItems.find(i => i.title && i.summary && i.summary.length > 30) || allItems.find(i => i.title) || allItems[0];
  if (!best || !best.title) return null;

  console.log(`   ✓ "${best.title.slice(0, 70)}..."`);

  // Plain summary — always available as fallback
  const plainSummary = best.summary ? best.summary.slice(0, 250) : best.title;

  // Generate voice summaries using Claude API
  // 4 combinations: student+north/west, student+south/east, professional+north/west, professional+south/east
  console.log(`   🤖 Generating voice summaries...`);
  const voices = {};

  const combinations = [
    { role: 'student', region: 'north' },
    { role: 'student', region: 'south' },
    { role: 'professional', region: 'north' },
    { role: 'professional', region: 'south' }
  ];

  for (const combo of combinations) {
    const key = `${combo.role}_${combo.region}`;
    voices[key] = await generateVoiceSummary(best.title, plainSummary, category, combo.role, combo.region);
    console.log(`   ✓ ${key} voice generated`);
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  // Also keep simple student/professional keys for backward compatibility
  voices['student'] = voices['student_north'];
  voices['professional'] = voices['professional_south'];

  return {
    category,
    headline: best.title,
    link: best.link || '',
    pubDate: best.pubDate || '',
    summary: plainSummary,
    voices
  };
}

// ── FETCH SUBSCRIBERS ─────────────────────────────────────────────────────────
async function fetchSubscribers() {
  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/subscribers?is_active=eq.true&select=email,name,role,region`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
    const data = await res.json();
    console.log(`✅ ${data.length} active subscribers fetched`);
    return data;
  } catch (err) {
    console.log(`❌ Failed to fetch subscribers: ${err.message}`);
    if (process.env.MY_EMAIL) {
      return [{ email: process.env.MY_EMAIL, name: 'Ayush', role: 'student', region: 'north' }];
    }
    return [];
  }
}

// ── GET VOICE TEXT FOR SUBSCRIBER ─────────────────────────────────────────────
function getVoiceText(story, role, region) {
  const isHinglish = region === 'north' || region === 'west';
  const regionGroup = isHinglish ? 'north' : 'south';
  const key = `${role}_${regionGroup}`;

  // Try exact match first
  if (story.voices && story.voices[key]) return story.voices[key];

  // Fallback to role only
  if (story.voices && story.voices[role]) return story.voices[role];

  // Final fallback — plain summary
  return story.summary || story.headline;
}

// ── BUILD EMAIL HTML ──────────────────────────────────────────────────────────
function buildEmailHTML(stories, date, subscriber) {
  const { name, role, region } = subscriber;
  const firstName = ((name || 'friend').split(' ')[0]);
  const isHinglish = region === 'north' || region === 'west';
  const topStories = stories.slice(0, 6);

  const roleLabel = role === 'student' ? '🎓 Student' : '💼 Professional';
  const roleColor = role === 'student' ? '#FF4D6D' : '#FFAA55';

  const greeting = role === 'student' && isHinglish
    ? `Yaar ${firstName}, aaj ki brief aa gayi. ☀️ 7 minute mein poori duniya.`
    : role === 'student'
    ? `Hey ${firstName}, your daily brief is here. ☀️ 5 minutes. Everything you need.`
    : isHinglish
    ? `${firstName} bhai, chai le aur padh. ☕ Aaj ki brief ready hai.`
    : `Good morning ${firstName}. ☀️ Your daily brief is ready. 5 minutes.`;

  const storyCards = topStories.map(s => {
    const voiceText = getVoiceText(s, role, region);
    return `
    <tr>
      <td style="padding:0 0 14px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="background:#0C0C18;border-radius:12px;border:0.5px solid rgba(255,255,255,.07);overflow:hidden;">
          <tr><td style="height:2px;background:linear-gradient(90deg,#2979FF,#00B4FF);"></td></tr>
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(92,200,255,.6);font-weight:600;">${s.category}</p>
              <h3 style="margin:0 0 10px;font-family:Georgia,serif;font-size:15px;color:rgba(255,255,255,.9);line-height:1.4;font-style:italic;">${s.headline}</h3>
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background:rgba(255,255,255,.03);border-radius:8px;border-left:2.5px solid ${roleColor};">
                <tr>
                  <td style="padding:10px 13px;">
                    <p style="margin:0 0 4px;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:${roleColor};font-weight:700;">${roleLabel}</p>
                    <p style="margin:0;font-size:13px;color:rgba(255,255,255,.7);line-height:1.7;">${voiceText}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:8px 0 0;">
                <a href="${s.link}" style="color:#5CC8FF;font-size:11px;font-weight:600;text-decoration:none;">Read full story →</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#07070F;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#07070F;padding:20px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <tr><td style="height:1.5px;background:linear-gradient(90deg,transparent,#5CC8FF,#fff,#5CC8FF,transparent);"></td></tr>

        <tr>
          <td style="background:#07070F;padding:24px 28px 16px;text-align:center;border:0.5px solid rgba(255,255,255,.05);border-bottom:none;border-radius:16px 16px 0 0;">
            <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:rgba(92,200,255,.4);">Daily Intelligence · India</p>
            <h1 style="margin:0 0 4px;font-family:Georgia,serif;font-size:26px;color:#E8C558;">☀️ The Dawn Brief</h1>
            <p style="margin:0;font-size:12px;color:rgba(255,255,255,.3);">${date}</p>
          </td>
        </tr>

        <tr>
          <td style="background:#0C0C18;padding:14px 28px;border-left:0.5px solid rgba(255,255,255,.05);border-right:0.5px solid rgba(255,255,255,.05);">
            <p style="margin:0;font-size:14px;color:rgba(255,255,255,.65);line-height:1.65;">${greeting}</p>
          </td>
        </tr>

        <tr>
          <td style="background:#07070F;padding:16px 28px;border:0.5px solid rgba(255,255,255,.05);border-top:none;border-bottom:none;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">${storyCards}</table>
          </td>
        </tr>

        <tr>
          <td style="background:#07070F;padding:16px 28px 20px;text-align:center;border:0.5px solid rgba(255,255,255,.05);border-top:none;border-radius:0 0 16px 16px;">
            <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:14px;color:#E8C558;">☀️ The Dawn Brief</p>
            <p style="margin:0 0 8px;font-size:11px;color:rgba(255,255,255,.2);">News that feels like a friend · ayushbrief.online</p>
            <p style="margin:0;font-size:11px;">
              <a href="https://ayushbrief.online" style="color:#5CC8FF;text-decoration:none;">Read on website</a>
              &nbsp;·&nbsp;
              <a href="https://ayushbrief.online/unsubscribe.html" style="color:rgba(255,255,255,.2);text-decoration:none;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── SEND EMAIL ────────────────────────────────────────────────────────────────
async function sendToSubscriber(subscriber, stories, date) {
  const { email, role, region } = subscriber;
  const isHinglish = region === 'north' || region === 'west';

  const subject = role === 'student' && isHinglish
    ? `☀️ Yaar sun — aaj ki brief aai hai`
    : role === 'student'
    ? `☀️ Your daily brief is here`
    : isHinglish
    ? `☀️ Chai le aur padh — aaj ki brief`
    : `☀️ Your morning brief — The Dawn Brief`;

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
      console.log(`✅ Sent → ${email} [${role}/${region}]`);
    }
  } catch (err) {
    console.log(`❌ Error for ${email}: ${err.message}`);
  }
}

// ── VALIDATE DATA ─────────────────────────────────────────────────────────────
function validateStories(stories) {
  if (!stories || stories.length < 3) {
    console.log(`⚠️  Only ${stories?.length || 0} stories — minimum 3 required`);
    return false;
  }
  return true;
}

// ── LOAD BACKUP ───────────────────────────────────────────────────────────────
function loadBackup() {
  try {
    const backupPath = path.join(__dirname, 'data-backup.json');
    if (fs.existsSync(backupPath)) {
      const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      console.log(`📦 Loaded backup with ${data.stories?.length || 0} stories`);
      return data.stories || [];
    }
  } catch (err) {
    console.log(`⚠️  Could not load backup: ${err.message}`);
  }
  return [];
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌅 The Dawn Brief — Starting build...');
  console.log('='.repeat(50));
  console.log(`Claude API: ${CLAUDE_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`Supabase: ${SUPA_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`Resend: ${process.env.RESEND_API_KEY ? '✅ Connected' : '❌ Missing'}`);

  const date = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Kolkata'
  });

  // Step 1 — Fetch subscribers
  console.log('\n👥 Fetching subscribers...');
  const subscribers = await fetchSubscribers();
  if (subscribers.length === 0) {
    console.log('❌ No subscribers. Exiting.');
    return;
  }

  // Step 2 — Fetch and process news
  console.log('\n📰 Fetching and processing news...');
  const stories = [];
  for (const [category, urls] of Object.entries(RSS_FEEDS)) {
    try {
      const story = await processCategory(category, urls);
      if (story) stories.push(story);
      // Delay between categories to be respectful to RSS servers
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.log(`❌ ${category}: ${err.message}`);
    }
  }
  console.log(`\n✅ ${stories.length} stories processed`);

  // Step 3 — Validate before saving
  let finalStories = stories;
  if (!validateStories(stories)) {
    console.log('⚠️  Not enough stories — loading from backup');
    const backupStories = loadBackup();
    if (backupStories.length > 0) {
      finalStories = backupStories;
      console.log(`✅ Using ${backupStories.length} backup stories`);
    } else {
      console.log('❌ No backup available. Exiting.');
      return;
    }
  }

  // Step 4 — Save data.json
  const dataToSave = {
    generated: new Date().toISOString(),
    date,
    totalStories: finalStories.length,
    stories: finalStories
  };
  fs.writeFileSync(
    path.join(__dirname, 'data.json'),
    JSON.stringify(dataToSave, null, 2)
  );
  console.log('✅ data.json saved');

  // Step 5 — Save backup (only if fresh stories)
  if (stories.length >= 3) {
    fs.writeFileSync(
      path.join(__dirname, 'data-backup.json'),
      JSON.stringify(dataToSave, null, 2)
    );
    console.log('✅ data-backup.json updated');
  }

  // Step 6 — Send emails
  if (finalStories.length > 0) {
    console.log(`\n📧 Sending to ${subscribers.length} subscribers...`);
    console.log('─'.repeat(50));
    for (const subscriber of subscribers) {
      await sendToSubscriber(subscriber, finalStories, date);
      await new Promise(r => setTimeout(r, 300));
    }
    console.log('─'.repeat(50));
    console.log('✅ All emails sent');
  }

  console.log('\n🌅 Build complete!');
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
