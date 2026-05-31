// ═══════════════════════════════════════════════════════════════════
// CURATION ROUTES
// ═══════════════════════════════════════════════════════════════════

const SUPA_URL = 'https://ygkviidhuqicfnvyuiiu.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;

const VALID_CATEGORIES = [
  'Business', 'Indian Economy', 'Finance', 'Tech', 'Sports',
  'Government', 'International', 'Climate', 'Startups & Auto',
  'Science & Health', 'Entertainment'
];

async function callClaude(prompt, maxTokens = 300) {
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
  if (!res.ok) throw new Error(`Claude error ${res.status}`);
  const data = await res.json();
  return data.content[0].text.trim();
}

async function fetchVoiceSoul(voice) {
  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/voice_library?status=eq.approved&voice=eq.${voice}&select=content&limit=5`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    const data = await res.json();
    if (data && data.length > 0) {
      return data.sort(() => Math.random() - 0.5).slice(0, 3).map(r => r.content).filter(Boolean);
    }
    return [];
  } catch { return []; }
}

async function generateOneVoice(headline, summary, category, role) {
  const voiceType = role === 'student' ? 'student' : 'employee';
  const soulExamples = await fetchVoiceSoul(voiceType);

  const sensitiveWords = ['killed','dead','death','died','fatal','tragedy','disaster','accident','crash','suicide','murder','rape','assault','attack','explosion','massacre','war'];
  const text = (headline + ' ' + summary).toLowerCase();
  const sensitive = sensitiveWords.some(w => new RegExp(`\\b${w}\\b`).test(text));

  const sensitivityNote = sensitive
    ? `\nYeh sensitive/tragic topic hai. Warmth aur dignity se likho. Jokes mat karo.\n`
    : `\nSensitive news ke liye — warmth aur respect. Baaki sab ke liye — full energy aur fun.\n`;

  let persona = '';
  if (role === 'student') {
    persona = `Tu ek Indian PGDM/MBA student ka sabse funny batchmate hai — North ya West India se.
Dono natural Hinglish mein baat karte hain — jaise actually dost bolte hain, forced nahi.
Tera dost campus pe hai — kabhi canteen mein, kabhi hostel mein, kabhi exam ke beech mein.
IMPORTANT: Placement ka angle sirf tab use karo jab news directly jobs, salary, economy se related ho. Har news pe placement mat thoso — forced lagta hai aur boring ho jaata hai.
Variety rakho — kabhi professor se connect karo, kabhi hostel ki baat, kabhi "yaar ye sun", kabhi exam stress, kabhi future ki tension, kabhi bas masti.
Har news pe ALAG angle dhundho — same pattern mat repeat karo.
Punchline unexpected honi chahiye — subscriber ko genuinely hasana hai, smile nahi — HASA.
Energy = batchmate jo class mein peeche baithta hai aur sabse achhe jokes marta hai.
Language: Natural Hinglish. Short punchy sentences. Zero corporate language. Zero formal tone.
${sensitivityNote}`;
  } else {
    persona = `Tu ek working professional ka sharp funny colleague hai — North ya West India se.
Dono Hinglish mein baat karte hain — chai break conversation, formal briefing nahi.
Tera dost boss pressure, salary tension, appraisals, office politics se deal karta hai daily.
Har news ko uski real work life se connect karo — EMI, targets, woh ek annoying manager.
30 seconds mein poori picture, ek joke jo dard ko bearable banaye.
Language: Natural Hinglish. Punchy. Real. End mein ek line jo usse lagey "yaar bilkul sahi bola".
${sensitivityNote}`;
  }

  let soulContext = '';
  if (soulExamples.length > 0) {
    soulContext = `\nIs tarah ki energy aur rhythm study karo — copy mat karo:\n${soulExamples.map((ex, i) => `Example ${i+1}: ${ex}`).join('\n')}\n`;
  }

  const prompt = `${persona}
${soulContext}
AAJ KI NEWS:
Headline: "${headline}"
Kya hua: "${summary}"
Category: ${category}

Is specific news pe 2-3 line ka reaction likho us dost ki tarah.
Fresh likho — upar ke examples sirf feeling dikhane ke liye hain, copy nahi karne.
Is actual news pe react karo. Is insaan ki real life se connect karo.
Koi preamble nahi. Koi "Yahan summary hai" nahi. Seedha likho.
Maximum 55 words.
Poori cheez ko quotes mein mat wrap karo.`;

  return await callClaude(prompt);
}

// ── KHATARNAK VOICE — short punchy for Bhai Mode ─────────────────────────────
async function generateOneKhatarnakVoice(headline, summary, category, role) {
  const voiceType = role === 'student' ? 'student' : 'employee';
  const soulExamples = await fetchVoiceSoul(voiceType);

  const sensitiveWords = ['killed','dead','death','died','fatal','tragedy','disaster','accident','crash','suicide','murder','rape','assault','attack','explosion','massacre','war'];
  const text = (headline + ' ' + summary).toLowerCase();
  const sensitive = sensitiveWords.some(w => new RegExp(`\\b${w}\\b`).test(text));

  let soulContext = '';
  if (soulExamples.length > 0) {
    soulContext = `\nIs energy se inspire ho — copy mat karo:\n${soulExamples.map((ex, i) => `Example ${i+1}: ${ex}`).join('\n')}\n`;
  }

  const persona = role === 'student'
    ? `Tu ek PGDM student ka chuddy buddy dost hai. Hinglish. Seedha, punchy, dramatic. Jaise breaking news sun ke bol raha ho — "bhai ye sun, ye bada waala hai."`
    : `Tu ek professional ka chuddy buddy dost hai. Hinglish. Seedha, punchy, dramatic. Jaise chai pe bol raha ho — "yaar ye news dekhi, ye serious hai."`;

  const sensitivityNote = sensitive
    ? `Ye sensitive news hai. Warmth aur gravity se bol. Drama nahi, but seriousness zaroor.`
    : `Full energy. Bhai mode mein sunne wali news. Punchy aur memorable.`;

  const prompt = `${persona}
${soulContext}

KHATARNAK NEWS — BHAI MODE KE LIYE:
Headline: "${headline}"
Kya hua: "${summary}"
Category: ${category}

${sensitivityNote}

RULES:
- Maximum 35 words — ye bolne ke liye hai, padhne ke liye nahi
- Ek line headline reaction + ek line context
- Hinglish only
- Dramatic opening — jaise "Bhai sun," ya "Yaar ye dekh," ya seedha khabar
- Koi preamble nahi, koi quotes nahi
- Punchy end — subscriber ko lagey "ye important hai"`;

  return await callClaude(prompt, 150);
}

// ── ROUTE 1: Get today's stories for admin ────────────────────────────────────
async function getAdminStories(req, res) {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const response = await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?run_date=eq.${date}&select=*&order=importance.asc,id.asc`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    const stories = await response.json();
    const grouped = {};
    VALID_CATEGORIES.forEach(c => grouped[c] = []);
    stories.forEach(s => { if (grouped[s.category]) grouped[s.category].push(s); });
    res.json({ success: true, date, grouped, total: stories.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── ROUTE 2: Generate voice summaries for selected 5 stories ─────────────────
async function generateVoices(req, res) {
  try {
    const { story_ids } = req.body;
    if (!story_ids || story_ids.length === 0) return res.status(400).json({ error: 'No story IDs provided' });
    if (story_ids.length > 5) return res.status(400).json({ error: 'Maximum 5 stories' });

    const ids = story_ids.join(',');
    const response = await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?id=in.(${ids})&select=*`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    const stories = await response.json();
    const results = [];

    for (const story of stories) {
      console.log(`🤖 Generating voices for: ${story.headline.slice(0, 50)}...`);
      const voices = {};

      try {
        voices['student'] = await generateOneVoice(story.headline, story.summary, story.category, 'student');
      } catch (err) {
        voices['student'] = story.summary.slice(0, 200);
      }
      await new Promise(r => setTimeout(r, 300));

      try {
        voices['professional'] = await generateOneVoice(story.headline, story.summary, story.category, 'professional');
      } catch (err) {
        voices['professional'] = story.summary.slice(0, 200);
      }
      await new Promise(r => setTimeout(r, 300));

      await fetch(`${SUPA_URL}/rest/v1/daily_stories?id=eq.${story.id}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ voices, status: 'voices_generated' })
      });

      results.push({ id: story.id, headline: story.headline, voices });
    }

    res.json({ success: true, stories: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── ROUTE 3: Regenerate one voice with feedback ───────────────────────────────
async function regenerateVoice(req, res) {
  try {
    const { story_id, voice_key, feedback } = req.body;

    const response = await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?id=eq.${story_id}&select=*`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    const stories = await response.json();
    if (!stories || stories.length === 0) return res.status(404).json({ error: 'Story not found' });

    const story = stories[0];
    const role = voice_key === 'student' ? 'student' : 'professional';
    const voiceType = role === 'student' ? 'student' : 'employee';
    const soulExamples = await fetchVoiceSoul(voiceType);

    let soulContext = '';
    if (soulExamples.length > 0) {
      soulContext = `\nEnergy study karo — copy mat karo:\n${soulExamples.map((ex, i) => `Example ${i+1}: ${ex}`).join('\n')}\n`;
    }

    const persona = role === 'student'
      ? `Indian PGDM/MBA student ka smart funny batchmate. Hinglish. Placements, campus life se connect karo.`
      : `Working professional ka sharp funny colleague. Hinglish. Boss, salary, EMI se connect karo.`;

    const feedbackNote = feedback ? `\nEditor feedback pichle attempt pe: "${feedback}"\nIs feedback ko zaroor address karo.\n` : '';

    const prompt = `${persona}
${soulContext}
${feedbackNote}
NEWS:
Headline: "${story.headline}"
Kya hua: "${story.summary}"
Category: ${story.category}

Behtar 2-3 line reaction likho. Fresh. Max 55 words. Quotes nahi. Preamble nahi.`;

    const newVoice = await callClaude(prompt);
    const updatedVoices = { ...(story.voices || {}), [voice_key]: newVoice };

    await fetch(`${SUPA_URL}/rest/v1/daily_stories?id=eq.${story_id}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ voices: updatedVoices })
    });

    res.json({ success: true, voice_key, new_voice: newVoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── ROUTE 4: Save edited voice ────────────────────────────────────────────────
async function saveVoice(req, res) {
  try {
    const { story_id, voice_key, voice_text } = req.body;
    const response = await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?id=eq.${story_id}&select=voices`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    const stories = await response.json();
    if (!stories || stories.length === 0) return res.status(404).json({ error: 'Story not found' });
    const updatedVoices = { ...(stories[0].voices || {}), [voice_key]: voice_text };
    await fetch(`${SUPA_URL}/rest/v1/daily_stories?id=eq.${story_id}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ voices: updatedVoices })
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── ROUTE 5: Submit approved stories ─────────────────────────────────────────
async function submitApproved(req, res) {
  try {
    const { approved_ids, date } = req.body;
    if (!approved_ids || approved_ids.length === 0) return res.status(400).json({ error: 'No approved stories' });

    const runDate = date || new Date().toISOString().split('T')[0];
    const ids = approved_ids.join(',');

    await fetch(`${SUPA_URL}/rest/v1/daily_stories?id=in.(${ids})`, {
      method: 'PATCH',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved', approved_at: new Date().toISOString() })
    });

    const response = await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?id=in.(${ids})&select=*`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    const approvedStories = await response.json();

    const formattedStories = approvedStories.map(s => ({
      category: s.category,
      headline: s.headline,
      summary: s.summary,
      link: s.link || '',
      pubDate: s.pub_date || '',
      hasVoice: !!(s.voices && (s.voices.student || s.voices.professional)),
      sensitive: false,
      voices: s.voices || null,
      is_previous_day: s.is_previous_day || false,
      is_khatarnak: s.is_khatarnak || false,
      khatarnak_voice: s.khatarnak_voice || null
    }));

    const dateDisplay = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Kolkata'
    });

    const dataToSave = {
      generated: new Date().toISOString(),
      date: dateDisplay,
      totalStories: formattedStories.length,
      stories: formattedStories,
      submitted_at: new Date().toISOString(),
      can_undo_until: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    };

    require('fs').writeFileSync(
      require('path').join(__dirname, 'data.json'),
      JSON.stringify(dataToSave, null, 2)
    );
    require('fs').writeFileSync(
      require('path').join(__dirname, 'data-backup.json'),
      JSON.stringify(dataToSave, null, 2)
    );

    sendEmailsToSubscribers(formattedStories, dateDisplay);

    res.json({
      success: true,
      stories_published: formattedStories.length,
      can_undo_until: dataToSave.can_undo_until,
      message: `${formattedStories.length} stories published.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── ROUTE 6: Undo submit ──────────────────────────────────────────────────────
async function undoSubmit(req, res) {
  try {
    const date = req.body.date || new Date().toISOString().split('T')[0];
    const dataPath = require('path').join(__dirname, 'data.json');
    if (require('fs').existsSync(dataPath)) {
      const data = JSON.parse(require('fs').readFileSync(dataPath, 'utf8'));
      if (data.can_undo_until && new Date() > new Date(data.can_undo_until)) {
        return res.status(400).json({ error: 'Undo window expired (15 minutes)' });
      }
    }
    await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?run_date=eq.${date}&status=eq.approved`,
      {
        method: 'PATCH',
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'voices_generated', approved_at: null })
      }
    );
    const backupPath = require('path').join(__dirname, 'data-backup.json');
    if (require('fs').existsSync(backupPath)) {
      require('fs').copyFileSync(backupPath, require('path').join(__dirname, 'data.json'));
    }
    res.json({ success: true, message: 'Submit undone.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── ROUTE 7: Auto-fallback ────────────────────────────────────────────────────
async function autoFallback(req, res) {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yDate = yesterday.toISOString().split('T')[0];

    const response = await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?run_date=eq.${yDate}&status=eq.approved&select=*`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    const prevStories = await response.json();
    if (!prevStories || prevStories.length === 0) {
      return res.json({ success: false, message: 'No previous day stories found' });
    }

    const formattedStories = prevStories.map(s => ({
      category: s.category,
      headline: s.headline,
      summary: s.summary,
      link: s.link || '',
      pubDate: s.pub_date || '',
      hasVoice: !!(s.voices),
      sensitive: false,
      voices: s.voices || null,
      is_previous_day: true,
      is_khatarnak: s.is_khatarnak || false,
      khatarnak_voice: s.khatarnak_voice || null
    }));

    const dateDisplay = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Kolkata'
    });

    const dataToSave = {
      generated: new Date().toISOString(),
      date: dateDisplay,
      totalStories: formattedStories.length,
      stories: formattedStories,
      is_auto_fallback: true
    };

    require('fs').writeFileSync(
      require('path').join(__dirname, 'data.json'),
      JSON.stringify(dataToSave, null, 2)
    );

    res.json({ success: true, message: `Auto-fallback: ${formattedStories.length} stories published` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── ROUTE 8: Generate khatarnak voices ───────────────────────────────────────
async function generateKhatarnakVoices(req, res) {
  try {
    const { story_ids } = req.body;
    if (!story_ids || story_ids.length === 0) return res.status(400).json({ error: 'No story IDs provided' });
    if (story_ids.length > 5) return res.status(400).json({ error: 'Maximum 5 khatarnak stories' });

    const ids = story_ids.join(',');
    const response = await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?id=in.(${ids})&select=*`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    const stories = await response.json();
    const results = [];

    for (const story of stories) {
      console.log(`⚡ Generating khatarnak voices for: ${story.headline.slice(0, 50)}...`);
      const voices = {};

      try {
        voices['student'] = await generateOneKhatarnakVoice(story.headline, story.summary, story.category, 'student');
      } catch (err) {
        voices['student'] = story.summary.slice(0, 150);
      }
      await new Promise(r => setTimeout(r, 300));

      try {
        voices['professional'] = await generateOneKhatarnakVoice(story.headline, story.summary, story.category, 'professional');
      } catch (err) {
        voices['professional'] = story.summary.slice(0, 150);
      }
      await new Promise(r => setTimeout(r, 300));

      results.push({ id: story.id, headline: story.headline, voices });
    }

    res.json({ success: true, stories: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── ROUTE 9: Regenerate one khatarnak voice ──────────────────────────────────
async function regenerateKhatarnakVoice(req, res) {
  try {
    const { story_id, voice_key } = req.body;

    const response = await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?id=eq.${story_id}&select=*`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    const stories = await response.json();
    if (!stories || stories.length === 0) return res.status(404).json({ error: 'Story not found' });

    const story = stories[0];
    const role = voice_key === 'student' ? 'student' : 'professional';
    const newVoice = await generateOneKhatarnakVoice(story.headline, story.summary, story.category, role);

    res.json({ success: true, voice_key, new_voice: newVoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── EMAIL SENDER ──────────────────────────────────────────────────────────────
async function sendEmailsToSubscribers(stories, date) {
  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    const subRes = await fetch(
      `${SUPA_URL}/rest/v1/subscribers?is_active=eq.true&select=email,name,role,region`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    const subscribers = await subRes.json();
    console.log(`📧 Sending to ${subscribers.length} subscribers...`);

    for (const subscriber of subscribers) {
      const { email, name, role, region } = subscriber;
      const firstName = (name || 'friend').split(' ')[0];
      const isHinglish = region === 'north' || region === 'west';
      const voiceKey = role === 'student' ? 'student' : 'professional';
      const roleLabel = role === 'student' ? '🎓 Student' : '💼 Professional';
      const roleColor = role === 'student' ? '#FF4D6D' : '#FFAA55';

      const greeting = role === 'student' && isHinglish
        ? `Yaar ${firstName}, aaj ki brief aa gayi. ☀️ 7 minute mein poori duniya.`
        : role === 'student'
        ? `Hey ${firstName}, your daily brief is here. ☀️ 5 minutes. Everything you need.`
        : isHinglish
        ? `${firstName} bhai, chai le aur padh. ☕ Aaj ki brief ready hai.`
        : `Good morning ${firstName}. ☀️ Your daily brief is ready. 5 minutes.`;

      const subject = role === 'student' && isHinglish
        ? `☀️ Yaar sun — aaj ki brief aai hai`
        : role === 'student'
        ? `☀️ Your daily brief is here`
        : isHinglish
        ? `☀️ Chai le aur padh — aaj ki brief`
        : `☀️ Your morning brief — The Dawn Brief`;

      const voiceStories = stories.filter(s => s.hasVoice).slice(0, 6);
      const storyCards = voiceStories.map(s => {
        const voiceText = s.voices && s.voices[voiceKey] ? s.voices[voiceKey] : s.summary;
        return `<tr><td style="padding:0 0 14px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0C0C18;border-radius:12px;border:0.5px solid rgba(255,255,255,.07);overflow:hidden;">
            <tr><td style="height:2px;background:linear-gradient(90deg,#2979FF,#00B4FF);"></td></tr>
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(92,200,255,.6);font-weight:600;">${s.category}${s.is_previous_day?' · Yesterday':''}</p>
              <h3 style="margin:0 0 10px;font-family:Georgia,serif;font-size:15px;color:rgba(255,255,255,.9);line-height:1.4;font-style:italic;">${s.headline}</h3>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,.03);border-radius:8px;border-left:2.5px solid ${roleColor};">
                <tr><td style="padding:10px 13px;">
                  <p style="margin:0 0 4px;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:${roleColor};font-weight:700;">${roleLabel}</p>
                  <p style="margin:0;font-size:13px;color:rgba(255,255,255,.7);line-height:1.7;">${voiceText}</p>
                </td></tr>
              </table>
              <p style="margin:8px 0 0;"><a href="${s.link}" style="color:#5CC8FF;font-size:11px;font-weight:600;text-decoration:none;">Read full story →</a></p>
            </td></tr>
          </table>
        </td></tr>`;
      }).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#07070F;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#07070F;padding:20px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td style="height:1.5px;background:linear-gradient(90deg,transparent,#5CC8FF,#fff,#5CC8FF,transparent);"></td></tr>
        <tr><td style="background:#07070F;padding:24px 28px 16px;text-align:center;border:0.5px solid rgba(255,255,255,.05);border-bottom:none;border-radius:16px 16px 0 0;">
          <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:rgba(92,200,255,.4);">Daily Intelligence · India</p>
          <h1 style="margin:0 0 4px;font-family:Georgia,serif;font-size:26px;color:#E8C558;">☀️ The Dawn Brief</h1>
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,.3);">${date}</p>
        </td></tr>
        <tr><td style="background:#0C0C18;padding:14px 28px;border-left:0.5px solid rgba(255,255,255,.05);border-right:0.5px solid rgba(255,255,255,.05);">
          <p style="margin:0;font-size:14px;color:rgba(255,255,255,.65);line-height:1.65;">${greeting}</p>
        </td></tr>
        <tr><td style="background:#07070F;padding:16px 28px;border:0.5px solid rgba(255,255,255,.05);border-top:none;border-bottom:none;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">${storyCards}</table>
        </td></tr>
        <tr><td style="background:#07070F;padding:16px 28px 20px;text-align:center;border:0.5px solid rgba(255,255,255,.05);border-top:none;border-radius:0 0 16px 16px;">
          <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:14px;color:#E8C558;">☀️ The Dawn Brief</p>
          <p style="margin:0 0 8px;font-size:11px;color:rgba(255,255,255,.2);">News that feels like a friend · ayushbrief.online</p>
          <p style="margin:0;font-size:11px;">
            <a href="https://ayushbrief.online" style="color:#5CC8FF;text-decoration:none;">Read on website</a>
            &nbsp;·&nbsp;
            <a href="https://ayushbrief.online/unsubscribe.html" style="color:rgba(255,255,255,.2);text-decoration:none;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      try {
        await resend.emails.send({
          from: 'The Dawn Brief <newsletter@ayushbrief.online>',
          to: [email],
          subject,
          html
        });
        console.log(`✅ Sent → ${email} [${role}/${region}]`);
      } catch (err) {
        console.log(`❌ Failed → ${email}: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }
    console.log('✅ All emails sent');
  } catch (err) {
    console.log(`❌ Email send failed: ${err.message}`);
  }
}

module.exports = {
  getAdminStories,
  generateVoices,
  regenerateVoice,
  saveVoice,
  submitApproved,
  undoSubmit,
  autoFallback,
  generateKhatarnakVoices,
  regenerateKhatarnakVoice
};
