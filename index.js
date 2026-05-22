const Parser = require('rss-parser');
const { Groq } = require('groq-sdk');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const parser = new Parser({ timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

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

// ── 6 VOICE PROMPTS ───────────────────────────────────────────────────────────
const VOICE_PROMPTS = {
  student: {
    label: 'Student',
    icon: '🎓',
    ending: 'Note kar lo',
    prompt: `You are writing for Indian MBA/PGDM/B.Com students (20-24 years old) preparing for placements and competitive exams.
Write in casual Hinglish (mix of Hindi and English). 2-3 sentences max.
Give exam-relevant context, policy angles, and interview-worthy insight.
End with: "Note kar lo" as a standalone line.
Output ONLY the text, nothing else.`
  },
  'field-sales': {
    label: 'Field Sales',
    icon: '🚴',
    ending: 'Abhi move karo',
    prompt: `You are writing for Indian FMCG field sales representatives doing daily beat plans in tier-2/3 cities.
Write in casual Hinglish. 2-3 sentences max.
Focus on: what this means for retailer conversations TODAY, stock decisions, customer pitch angles.
Be action-oriented — tell them what to DO on their beat.
End with: "Abhi move karo" as a standalone line.
Output ONLY the text, nothing else.`
  },
  manager: {
    label: 'Manager',
    icon: '📋',
    ending: 'Team ko brief karo',
    prompt: `You are writing for Indian FMCG/Sales managers who brief their teams and make strategic decisions.
Write in professional Hinglish or English. 2-3 sentences max.
Focus on: business impact, team briefing angles, strategic implications, numbers where relevant.
End with: "Team ko brief karo" as a standalone line.
Output ONLY the text, nothing else.`
  },
  fresher: {
    label: 'Fresher',
    icon: '🌱',
    ending: 'Samajh ke rakhna',
    prompt: `You are writing for freshers (0-1 year experience) just starting their careers in FMCG, sales, or business.
Write in simple Hinglish. 2-3 sentences max.
Explain the "why this matters" clearly. Help them connect news to their career world.
End with: "Samajh ke rakhna" as a standalone line.
Output ONLY the text, nothing else.`
  },
  distributor: {
    label: 'Distributor',
    icon: '📦',
    ending: 'Dhyan rakh',
    prompt: `You are writing for Indian FMCG distributors who manage stock, credit, and retailer relationships.
Write in simple Hinglish. 2-3 sentences max.
Focus on: stock decisions, demand signals, credit/payment implications, supply chain impact.
End with: "Dhyan rakh" as a standalone line.
Output ONLY the text, nothing else.`
  },
  agent: {
    label: 'Commission Agent',
    icon: '🌾',
    ending: 'Nazar rakhein',
    prompt: `You are writing for Indian commission agents (arhatiya) who work in agricultural mandis and wholesale markets.
Write in simple, clear Hindi (Devanagari script is fine, but use simple words). 2-3 sentences max.
Focus on: mandi impact, trade implications, credit flow, seasonal angles relevant to agricultural markets.
End with: "Nazar rakhein" as a standalone line.
Output ONLY the text, nothing else.`
  }
};

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
      model: 'llama3-8b-8192',
      max_tokens: 200,
      messages: [
        { role: 'system', content: voice.prompt },
        { role: 'user', content: `News: ${title}\n\nContext: ${summary.slice(0, 400)}` }
      ]
    });
    return completion.choices[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.log(`⚠️  Groq failed for ${voiceKey}: ${err.message}`);
    return `${title} — ${voice.ending}`;
  }
}

// ── GENERATE ALL 6 VOICES FOR ONE ARTICLE ────────────────────────────────────
async function generateAllVoices(title, summary) {
  const voiceKeys = Object.keys(VOICE_PROMPTS);
  const voices = {};

  // Run all 6 in parallel
  const results = await Promise.allSettled(
    voiceKeys.map(key => generateVoice(title, summary, key))
  );

  voiceKeys.forEach((key, i) => {
    voices[key] = results[i].status === 'fulfilled' ? results[i].value : `${title}`;
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

  // Take the best article (first one with decent title + summary)
  const best = allItems.find(i => i.title && i.summary && i.summary.length > 50) || allItems[0];

  if (!best || !best.title) return null;

  console.log(`   ✓ Article: ${best.title.slice(0, 60)}...`);
  console.log(`   Generating 6 voices via Groq...`);

  const voices = await generateAllVoices(best.title, best.summary);

  console.log(`   ✓ All 6 voices generated`);

  return {
    category,
    headline: best.title,
    link: best.link,
    pubDate: best.pubDate,
    voices
  };
}

// ── BUILD EMAIL HTML ──────────────────────────────────────────────────────────
function buildEmailHTML(stories, date) {
  const voiceInfo = VOICE_PROMPTS;
  const topStories = stories.slice(0, 6);

  const storyCards = topStories.map(s => `
    <tr>
      <td style="padding:0 0 24px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="background:#FFFFFF;border-radius:12px;border:1px solid #E8DCC8;overflow:hidden;">
          <tr>
            <td style="height:4px;background:#E8A200;"></td>
          </tr>
          <tr>
            <td style="padding:20px 24px;">
              <p style="margin:0 0 8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#D4521A;font-weight:700;">${s.category}</p>
              <h3 style="margin:0 0 16px;font-family:Georgia,serif;font-size:18px;color:#1A1208;line-height:1.3;">${s.headline}</h3>
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background:#EEF4FF;border-radius:8px;border-left:3px solid #4A7FE8;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0 0 4px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#4A7FE8;font-weight:700;">🎓 Student Voice</p>
                    <p style="margin:0;font-size:14px;color:#1A1208;line-height:1.65;">${s.voices.student}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0;">
                <a href="${s.link}" style="color:#E8A200;font-size:13px;font-weight:600;text-decoration:none;">Read full story →</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5EDD8;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5EDD8;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- HEADER -->
        <tr>
          <td style="background:#0D0A05;border-radius:16px 16px 0 0;padding:32px 32px 28px;text-align:center;">
            <p style="margin:0 0 8px;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#E8A200;">Daily Intelligence</p>
            <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:32px;font-weight:900;color:#E8A200;">☀ The Dawn Brief</h1>
            <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.4);">${date} · India's Morning Intelligence</p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="background:#FAF6EE;padding:32px;">
            <p style="margin:0 0 24px;font-size:15px;color:#5C4A2A;line-height:1.6;">
              Good morning. Here are today's most important stories — written in your voice.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              ${storyCards}
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#0D0A05;border-radius:0 0 16px 16px;padding:24px 32px;text-align:center;">
            <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:18px;color:#E8A200;">☀ The Dawn Brief</p>
            <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);">
              India's daily intelligence · Built by Ayush Bansal · Kaithal, Haryana<br>
              <a href="https://ayushbrief.online" style="color:#E8A200;">ayushbrief.online</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌅 The Dawn Brief — Starting build...');
  console.log('='.repeat(50));

  const date = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const stories = [];

  // Process all 16 categories
  for (const [category, urls] of Object.entries(RSS_FEEDS)) {
    try {
      const story = await processCategory(category, urls);
      if (story) stories.push(story);
      // Small delay to be polite to RSS servers
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.log(`❌ Failed: ${category} — ${err.message}`);
    }
  }

  console.log(`\n✅ ${stories.length} stories processed`);

  // Save data.json for the website to fetch
  const dataOutput = {
    generated: new Date().toISOString(),
    date,
    stories
  };

  fs.writeFileSync(
    path.join(__dirname, 'data.json'),
    JSON.stringify(dataOutput, null, 2)
  );
  console.log('✅ data.json saved');

  // Send email if stories exist
  if (stories.length > 0 && process.env.MY_EMAIL) {
    try {
      console.log('\n📧 Sending email via Resend...');
      const emailHTML = buildEmailHTML(stories, date);

      const { data, error } = await resend.emails.send({
        from: 'The Dawn Brief <newsletter@ayushbrief.online>',
        to: [process.env.MY_EMAIL],
        subject: `☀ The Dawn Brief — ${date}`,
        html: emailHTML
      });

      if (error) {
        console.log('❌ Email error:', error);
      } else {
        console.log('✅ Email sent! ID:', data?.id);
      }
    } catch (err) {
      console.log('❌ Email failed:', err.message);
    }
  }

  console.log('\n🌅 Build complete!');
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
