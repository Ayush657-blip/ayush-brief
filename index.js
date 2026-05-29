const Parser = require('rss-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const parser = new Parser({ timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
const resend = new Resend(process.env.RESEND_API_KEY);
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;

const SUPA_URL = 'https://ygkviidhuqicfnvyuiiu.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY;

// ── VALID CATEGORIES ──────────────────────────────────────────────────────────
const VALID_CATEGORIES = [
  'Business', 'Indian Economy', 'Finance', 'Tech', 'Sports',
  'Government', 'International', 'Climate', 'Startups & Auto',
  'Science & Health', 'Entertainment'
];

// ── BROAD RSS FEEDS — cast wide net, Claude classifies ────────────────────────
const BROAD_FEEDS = [
  // Business & Economy
  'https://feeds.bbci.co.uk/news/business/rss.xml',
  'https://www.livemint.com/rss/companies',
  'https://www.livemint.com/rss/economy',
  'https://www.livemint.com/rss/market',
  'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms',
  // Tech & Startups
  'https://feeds.bbci.co.uk/news/technology/rss.xml',
  'https://techcrunch.com/feed/',
  'https://timesofindia.indiatimes.com/rssfeeds/66949542.cms',
  // Sports
  'https://feeds.bbci.co.uk/sport/rss.xml',
  'https://timesofindia.indiatimes.com/rssfeeds/4719161.cms',
  // India News & Government
  'https://feeds.feedburner.com/ndtvnews-india-news',
  'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms',
  'https://www.thehindu.com/news/national/feeder/default.rss',
  // World News
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  // Climate & Environment
  'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
  'https://www.theguardian.com/environment/climate-crisis/rss',
  // Science & Health
  'https://feeds.bbci.co.uk/news/health/rss.xml',
  'https://www.thehindu.com/sci-tech/science/feeder/default.rss',
  'https://www.thehindu.com/sci-tech/health/feeder/default.rss',
  'https://www.theguardian.com/science/rss',
  'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml',
  // Auto — hidden in industry/business feeds
  'https://www.thehindu.com/business/Industry/feeder/default.rss',
  // Entertainment
  'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
  'https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms',
];

// ── SENSITIVE TOPICS ──────────────────────────────────────────────────────────
const SENSITIVE_WORDS = [
  'killed','dead','death','died','dies','fatal','tragedy','tragic',
  'disaster','accident','crash','fire','flood','earthquake','cyclone',
  'suicide','murder','rape','assault','attack','explosion','blast',
  'massacre','genocide','war','conflict','refugees','missing','abducted'
];

function isSensitiveTopic(headline, summary) {
  const text = ((headline||'') + ' ' + (summary||'')).toLowerCase();
  return SENSITIVE_WORDS.some(word => new RegExp(`\\b${word}\\b`).test(text));
}

// ── IS ENGLISH HEADLINE ───────────────────────────────────────────────────────
function isEnglishHeadline(title) {
  if (!title) return false;
  const latinChars = (title.match(/[a-zA-Z]/g) || []).length;
  const totalChars = title.replace(/\s/g, '').length;
  return totalChars === 0 || (latinChars / totalChars) > 0.5;
}

// ── FETCH RSS FEED ────────────────────────────────────────────────────────────
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
    console.log(`⚠️  Feed failed: ${url.slice(0,60)} — ${err.message}`);
    return [];
  }
}

// ── CALL CLAUDE API ───────────────────────────────────────────────────────────
async function callClaudeAPI(prompt, maxTokens = 300) {
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

// ── CLASSIFY STORY CATEGORY ───────────────────────────────────────────────────
async function classifyStory(headline, summary) {
  const prompt = `You are a news classifier. Read this headline and summary, then assign it to exactly ONE category from the list below.

CATEGORIES:
- Business: Company news, corporate strategy, mergers, acquisitions, profits, losses
- Indian Economy: India GDP, RBI, inflation, rupee, trade, economic policy, budget
- Finance: Stock markets, Sensex, Nifty, mutual funds, IPO, personal finance, banking
- Tech: Technology, AI, software, apps, gadgets, internet, cybersecurity, social media
- Sports: Cricket, football, tennis, Olympics, IPL, any sport
- Government: India government, parliament, ministry, elections, BJP, Congress, policy, law
- International: World news, geopolitics, USA, China, Russia, war, diplomacy
- Climate: Environment, pollution, climate change, renewable energy, carbon, wildlife
- Startups & Auto: Startups, funding rounds, VC, EVs, electric vehicles, cars, automobiles
- Science & Health: Science, space, ISRO, NASA, medical research, health, disease, medicine
- Entertainment: Films, OTT, Bollywood, music, celebrities, TV shows, awards

HEADLINE: "${headline}"
SUMMARY: "${(summary || '').slice(0, 150)}"

Reply with ONLY the category name. Nothing else. No explanation.`;

  try {
    const result = await callClaudeAPI(prompt, 20);
    const cleaned = result.trim().replace(/['"]/g, '');
    if (VALID_CATEGORIES.includes(cleaned)) return cleaned;
    // fuzzy match
    const match = VALID_CATEGORIES.find(c =>
      cleaned.toLowerCase().includes(c.toLowerCase()) ||
      c.toLowerCase().includes(cleaned.toLowerCase())
    );
    return match || null;
  } catch (err) {
    return null;
  }
}

// ── FETCH VOICE SOUL FROM LIBRARY ─────────────────────────────────────────────
async function fetchVoiceSoul(voice) {
  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/voice_library?status=eq.approved&voice=eq.${voice}&select=content&limit=5`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    if (!res.ok) throw new Error('Supabase error');
    const data = await res.json();
    if (data && data.length > 0) {
      const shuffled = data.sort(() => Math.random() - 0.5).slice(0, 3);
      return shuffled.map(r => r.content).filter(Boolean);
    }
    return [];
  } catch (err) {
    return [];
  }
}

// ── GENERATE VOICE SUMMARY ────────────────────────────────────────────────────
async function generateVoiceSummary(headline, plainSummary, category, role, region) {
  const isHinglish = region === 'north' || region === 'west';
  const voiceType = role === 'student' ? 'student' : 'employee';
  const soulExamples = await fetchVoiceSoul(voiceType);
  const sensitive = isSensitiveTopic(headline, plainSummary);

  let soulContext = '';
  if (soulExamples.length > 0) {
    soulContext = `
Here is how this person naturally talks and feels about news.
Study the energy, rhythm, humor, and emotion. Do NOT copy these. Just feel them:

${soulExamples.map((ex, i) => `Example ${i+1}: ${ex}`).join('\n')}

`;
  }

  const sensitivityNote = sensitive
    ? `\nIMPORTANT: This news involves a sensitive or tragic topic. Do NOT make jokes. Write with warmth, empathy, and human dignity. Keep it brief and respectful.\n`
    : `\nIMPORTANT: If this news involves death or tragedy — write with warmth and respect. For all other news — full energy, full fun.\n`;

  let persona = '';
  if (role === 'student' && isHinglish) {
    persona = `You are the smart funny batchmate of an Indian PGDM/MBA student from North or West India.
You both speak Hinglish naturally — not forced, not translated, just how you actually talk.
Your friend is stressed about placements, assignments, campus life.
Every big news you connect to his real life — college, future, money he doesn't have yet.
You make him laugh at the situation because that's how you both survive it together.
Language: Natural Hinglish. Short punchy sentences. One unexpected punchline at the end.
${sensitivityNote}`;
  } else if (role === 'student' && !isHinglish) {
    persona = `You are the sharp funny friend of an Indian college student from South or East India.
You both speak in Comedy English — clean, punchy, like a smart WhatsApp message.
Your friend is dealing with placements, assignments, that one professor who never passes anyone.
Every news you connect to his real campus life and future worries.
Language: Comedy English. Short sharp sentences. Dry humor. One line that hits at the end.
${sensitivityNote}`;
  } else if (role === 'professional' && isHinglish) {
    persona = `You are the sharp funny colleague of a working professional from North or West India.
You both speak Hinglish — like chai break conversation, not a formal briefing.
Your friend deals with boss pressure, salary tension, appraisals, office politics daily.
Every news you connect to his real work life — EMI, targets, that one annoying manager.
Language: Natural Hinglish. Punchy. Real. One line punchline that makes him go "yaar bilkul sahi bola".
${sensitivityNote}`;
  } else {
    persona = `You are the smart colleague of a working professional from South or East India.
You both speak in sharp Comedy English — like two colleagues at the coffee machine.
Your friend deals with deadlines, boss moods, appraisal season, office politics.
Every news you connect to his real professional life — salary, career, work stress.
Language: Comedy English. Sharp and warm. Short sentences. One punchline at end.
${sensitivityNote}`;
  }

  const prompt = `${persona}

${soulContext}
TODAY'S NEWS:
Headline: "${headline}"
What happened: "${plainSummary}"
Category: ${category}

Write a 2-3 line reaction to THIS specific news as that friend.
Write fresh — do not copy the examples above, they are just to show you the feeling.
React to this actual news. Connect it to this person's real life.
No preamble. No "Here is the summary". Just write it directly.
Maximum 55 words.
Do not use quotation marks to wrap the whole thing.`;

  try {
    const summary = await callClaudeAPI(prompt);
    return summary.replace(/^["'""]|["'""]$/g, '').trim();
  } catch (err) {
    console.log(`⚠️  Voice failed for "${headline.slice(0, 40)}..."`);
    return plainSummary.slice(0, 200);
  }
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
  if (!story.hasVoice || !story.voices) return story.summary || story.headline;
  const isHinglish = region === 'north' || region === 'west';
  const regionGroup = isHinglish ? 'north' : 'south';
  const key = `${role}_${regionGroup}`;
  if (story.voices[key]) return story.voices[key];
  if (story.voices[role]) return story.voices[role];
  return story.summary || story.headline;
}

// ── BUILD EMAIL HTML ──────────────────────────────────────────────────────────
function buildEmailHTML(stories, date, subscriber) {
  const { name, role, region } = subscriber;
  const firstName = ((name || 'friend').split(' ')[0]);
  const isHinglish = region === 'north' || region === 'west';
  const voiceStories = stories.filter(s => s.hasVoice).slice(0, 6);
  const roleLabel = role === 'student' ? '🎓 Student' : '💼 Professional';
  const roleColor = role === 'student' ? '#FF4D6D' : '#FFAA55';

  const greeting = role === 'student' && isHinglish
    ? `Yaar ${firstName}, aaj ki brief aa gayi. ☀️ 7 minute mein poori duniya.`
    : role === 'student'
    ? `Hey ${firstName}, your daily brief is here. ☀️ 5 minutes. Everything you need.`
    : isHinglish
    ? `${firstName} bhai, chai le aur padh. ☕ Aaj ki brief ready hai.`
    : `Good morning ${firstName}. ☀️ Your daily brief is ready. 5 minutes.`;

  const storyCards = voiceStories.map(s => {
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
    if (error) console.log(`❌ Failed for ${email}: ${JSON.stringify(error)}`);
    else console.log(`✅ Sent → ${email} [${role}/${region}]`);
  } catch (err) {
    console.log(`❌ Error for ${email}: ${err.message}`);
  }
}

// ── LOAD BACKUP ───────────────────────────────────────────────────────────────
function loadBackup() {
  try {
    const backupPath = path.join(__dirname, 'data-backup.json');
    if (fs.existsSync(backupPath)) {
      const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      return data.stories || [];
    }
  } catch (err) {}
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

  console.log('\n👥 Fetching subscribers...');
  const subscribers = await fetchSubscribers();
  if (subscribers.length === 0) { console.log('❌ No subscribers. Exiting.'); return; }

  // ── STEP 1: Fetch all stories from all broad feeds ─────────────────────────
  console.log('\n📡 Fetching from all feeds...');
  const rawItems = [];
  for (const url of BROAD_FEEDS) {
    const items = await fetchFeed(url);
    rawItems.push(...items);
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`✓ Fetched ${rawItems.length} raw stories`);

  // ── STEP 2: Filter English + deduplicate ──────────────────────────────────
  const seen = new Set();
  const uniqueItems = rawItems.filter(i => {
    if (!isEnglishHeadline(i.title)) return false;
    if (!i.title || !i.summary || i.summary.length < 30) return false;
    const key = i.title.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`✓ ${uniqueItems.length} unique English stories after dedup`);

  // ── STEP 3: Claude classifies every story ─────────────────────────────────
  console.log('\n🤖 Classifying stories...');
  const classified = {}; // { category: [stories] }
  VALID_CATEGORIES.forEach(c => classified[c] = []);

  let classifyCount = 0;
  for (const item of uniqueItems) {
    const category = await classifyStory(item.title, item.summary);
    if (category) {
      classified[category].push({ ...item, category });
      classifyCount++;
    }
    await new Promise(r => setTimeout(r, 150));
  }
  console.log(`✓ ${classifyCount} stories classified`);

  // Log category counts
  VALID_CATEGORIES.forEach(c => {
    console.log(`   ${c}: ${classified[c].length} stories`);
  });

  // ── STEP 4: Generate voices for top 5 per category ────────────────────────
  console.log('\n🎙️ Generating voice summaries...');
  const allStories = [];

  for (const category of VALID_CATEGORIES) {
    const pool = classified[category].slice(0, 10);
    if (pool.length === 0) {
      console.log(`⚠️  ${category}: no stories — will use backup`);
      continue;
    }
    console.log(`\n📰 ${category}: ${pool.length} stories`);

    for (let idx = 0; idx < pool.length; idx++) {
      const item = pool[idx];
      const plainSummary = item.summary.slice(0, 250);
      const isVoiceStory = idx < 5;
      const sensitive = isSensitiveTopic(item.title, plainSummary);

      if (isVoiceStory) {
        console.log(`   🤖 [${idx+1}/5] ${sensitive ? '🕊️ ' : ''}${item.title.slice(0, 50)}...`);
        const voices = {};
        const combos = [
          { role: 'student', region: 'north' },
          { role: 'student', region: 'south' },
          { role: 'professional', region: 'north' },
          { role: 'professional', region: 'south' }
        ];
        for (const combo of combos) {
          const key = `${combo.role}_${combo.region}`;
          voices[key] = await generateVoiceSummary(item.title, plainSummary, category, combo.role, combo.region);
          await new Promise(r => setTimeout(r, 200));
        }
        voices['student'] = voices['student_north'];
        voices['professional'] = voices['professional_south'];

        allStories.push({
          category, headline: item.title, link: item.link || '',
          pubDate: item.pubDate || '', summary: plainSummary,
          hasVoice: true, sensitive, voices
        });
      } else {
        allStories.push({
          category, headline: item.title, link: item.link || '',
          pubDate: item.pubDate || '', summary: plainSummary,
          hasVoice: false, sensitive, voices: null
        });
      }
      await new Promise(r => setTimeout(r, 300));
    }
    console.log(`   ✅ ${category}: ${Math.min(pool.length,5)} voice + ${Math.max(0,pool.length-5)} plain`);
  }

  // ── STEP 5: Fill missing categories from backup ───────────────────────────
  const coveredCats = new Set(allStories.map(s => s.category));
  const missingCats = VALID_CATEGORIES.filter(c => !coveredCats.has(c));
  if (missingCats.length > 0) {
    console.log(`\n⚠️  Missing categories: ${missingCats.join(', ')} — filling from backup`);
    const backupStories = loadBackup();
    for (const cat of missingCats) {
      const backupForCat = backupStories.filter(s => s.category === cat).slice(0, 10);
      allStories.push(...backupForCat);
      if (backupForCat.length > 0) console.log(`   ✓ ${cat}: ${backupForCat.length} from backup`);
    }
  }

  console.log(`\n✅ Total: ${allStories.length} stories (${allStories.filter(s=>s.hasVoice).length} voice, ${allStories.filter(s=>!s.hasVoice).length} plain)`);

  // ── STEP 6: Save data ─────────────────────────────────────────────────────
  const dataToSave = {
    generated: new Date().toISOString(),
    date,
    totalStories: allStories.length,
    stories: allStories
  };
  fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(dataToSave, null, 2));
  console.log('✅ data.json saved');
  if (allStories.length >= 5) {
    fs.writeFileSync(path.join(__dirname, 'data-backup.json'), JSON.stringify(dataToSave, null, 2));
    console.log('✅ data-backup.json updated');
  }

  // ── STEP 7: Send emails ───────────────────────────────────────────────────
  const voiceStories = allStories.filter(s => s.hasVoice);
  if (voiceStories.length > 0) {
    console.log(`\n📧 Sending to ${subscribers.length} subscribers...`);
    console.log('─'.repeat(50));
    for (const subscriber of subscribers) {
      await sendToSubscriber(subscriber, allStories, date);
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
