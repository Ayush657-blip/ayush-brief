// ═══════════════════════════════════════════════════════════════════
// CURATION ROUTES — Add these to your existing server.js
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

async function generateOneVoice(headline, summary, category, role, region) {
  const isHinglish = region === 'north' || region === 'west';
  const voiceType = role === 'student' ? 'student' : 'employee';
  const soulExamples = await fetchVoiceSoul(voiceType);

  const sensitiveWords = ['killed','dead','death','died','fatal','tragedy','disaster','accident','crash','suicide','murder','rape','assault','attack','explosion','massacre','war'];
  const text = (headline + ' ' + summary).toLowerCase();
  const sensitive = sensitiveWords.some(w => new RegExp(`\\b${w}\\b`).test(text));

  const sensitivityNote = sensitive
    ? `\nThis is a sensitive/tragic topic. Write with warmth and dignity. No jokes.\n`
    : `\nFor sensitive/tragic news — warmth and respect. For all other news — full energy and fun.\n`;

  let persona = '';
  if (role === 'student' && isHinglish) {
    persona = `You are the smart funny batchmate of an Indian PGDM/MBA student from North or West India. You speak Hinglish naturally. Connect news to college life, placements, campus stress. Short punchy sentences. One punchline at end.${sensitivityNote}`;
  } else if (role === 'student' && !isHinglish) {
    persona = `You are the sharp funny friend of an Indian college student from South or East India. Comedy English. Connect to campus life, placements. Short sharp sentences. Dry humor.${sensitivityNote}`;
  } else if (role === 'professional' && isHinglish) {
    persona = `You are the sharp funny colleague of a working professional from North or West India. Hinglish like chai break conversation. Connect to boss, salary, EMI, appraisals. One punchline that makes him go "yaar bilkul sahi bola".${sensitivityNote}`;
  } else {
    persona = `You are the smart colleague of a working professional from South or East India. Comedy English like coffee machine conversation. Connect to salary, boss, deadlines. One warm punchline.${sensitivityNote}`;
  }

  let soulContext = '';
  if (soulExamples.length > 0) {
    soulContext = `\nStudy the energy and rhythm — do NOT copy:\n${soulExamples.map((ex, i) => `Example ${i+1}: ${ex}`).join('\n')}\n`;
  }

  const prompt = `${persona}
${soulContext}
NEWS:
Headline: "${headline}"
What happened: "${summary}"
Category: ${category}

Write 2-3 line reaction as that friend. Fresh, specific to this news. Max 55 words. No quotes around it. No preamble.`;

  return await callClaude(prompt);
}

// ── ROUTE 1: Get today's stories for admin ────────────────────────────────────
// GET /api/admin/stories?date=2026-05-29
async function getAdminStories(req, res) {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const response = await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?run_date=eq.${date}&select=*&order=importance.asc,id.asc`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    const stories = await response.json();

    // Group by category
    const grouped = {};
    VALID_CATEGORIES.forEach(c => grouped[c] = []);
    stories.forEach(s => {
      if (grouped[s.category]) grouped[s.category].push(s);
    });

    res.json({ success: true, date, grouped, total: stories.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── ROUTE 2: Generate voice summaries for selected stories ────────────────────
// POST /api/admin/generate-voices
// Body: { story_ids: [1, 2, 3, 4, 5] }
async function generateVoices(req, res) {
  try {
    const { story_ids } = req.body;
    if (!story_ids || story_ids.length === 0) {
      return res.status(400).json({ error: 'No story IDs provided' });
    }
    if (story_ids.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 stories per category' });
    }

    // Fetch stories from Supabase
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
      const combos = [
        { role: 'student', region: 'north' },
        { role: 'student', region: 'south' },
        { role: 'professional', region: 'north' },
        { role: 'professional', region: 'south' }
      ];

      for (const combo of combos) {
        const key = `${combo.role}_${combo.region}`;
        try {
          voices[key] = await generateOneVoice(
            story.headline, story.summary, story.category, combo.role, combo.region
          );
        } catch (err) {
          voices[key] = story.summary.slice(0, 200);
        }
        await new Promise(r => setTimeout(r, 200));
      }
      voices['student'] = voices['student_north'];
      voices['professional'] = voices['professional_south'];

      // Save voices to Supabase
      await fetch(`${SUPA_URL}/rest/v1/daily_stories?id=eq.${story.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ voices, status: 'voices_generated' })
      });

      results.push({ id: story.id, headline: story.headline, voices });
      await new Promise(r => setTimeout(r, 300));
    }

    res.json({ success: true, stories: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── ROUTE 3: Regenerate one voice with feedback ───────────────────────────────
// POST /api/admin/regenerate-voice
// Body: { story_id, voice_key, feedback }
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
    const [role, region] = voice_key.split('_');

    const isHinglish = region === 'north' || region === 'west';
    const voiceType = role === 'student' ? 'student' : 'employee';
    const soulExamples = await fetchVoiceSoul(voiceType);

    let soulContext = '';
    if (soulExamples.length > 0) {
      soulContext = `\nStudy the energy — do NOT copy:\n${soulExamples.map((ex, i) => `Example ${i+1}: ${ex}`).join('\n')}\n`;
    }

    let persona = '';
    if (role === 'student' && isHinglish) {
      persona = `Smart funny batchmate of PGDM/MBA student from North/West India. Hinglish. Connect to placements, campus life.`;
    } else if (role === 'student') {
      persona = `Sharp funny friend of college student from South/East India. Comedy English. Connect to campus life.`;
    } else if (isHinglish) {
      persona = `Sharp funny colleague of working professional from North/West India. Hinglish. Connect to boss, salary, EMI.`;
    } else {
      persona = `Smart colleague of working professional from South/East India. Comedy English. Connect to work stress.`;
    }

    const feedbackNote = feedback ? `\nEditor feedback on previous attempt: "${feedback}"\nMake sure to address this feedback.\n` : '';

    const prompt = `${persona}
${soulContext}
${feedbackNote}
NEWS:
Headline: "${story.headline}"
What happened: "${story.summary}"
Category: ${story.category}

Write a better 2-3 line reaction. Fresh. Max 55 words. No quotes. No preamble.`;

    const newVoice = await callClaude(prompt);

    // Update in Supabase
    const updatedVoices = { ...(story.voices || {}), [voice_key]: newVoice };
    await fetch(`${SUPA_URL}/rest/v1/daily_stories?id=eq.${story_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ voices: updatedVoices })
    });

    res.json({ success: true, voice_key, new_voice: newVoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── ROUTE 4: Save edited voice ────────────────────────────────────────────────
// POST /api/admin/save-voice
// Body: { story_id, voice_key, voice_text }
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
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ voices: updatedVoices })
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── ROUTE 5: Submit approved stories ─────────────────────────────────────────
// POST /api/admin/submit
// Body: { approved_ids: [1,2,3,...], date: '2026-05-29' }
async function submitApproved(req, res) {
  try {
    const { approved_ids, date } = req.body;
    if (!approved_ids || approved_ids.length === 0) {
      return res.status(400).json({ error: 'No approved stories' });
    }

    const runDate = date || new Date().toISOString().split('T')[0];

    // Mark approved stories
    const ids = approved_ids.join(',');
    await fetch(`${SUPA_URL}/rest/v1/daily_stories?id=in.(${ids})`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'approved', approved_at: new Date().toISOString() })
    });

    // Fetch approved stories
    const response = await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?id=in.(${ids})&select=*`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    const approvedStories = await response.json();

    // Build data.json
    const formattedStories = approvedStories.map(s => ({
      category: s.category,
      headline: s.headline,
      summary: s.summary,
      link: s.link || '',
      pubDate: s.pub_date || '',
      hasVoice: !!(s.voices),
      sensitive: false,
      voices: s.voices || null,
      is_previous_day: s.is_previous_day || false
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

    // Save data.json
    require('fs').writeFileSync(
      require('path').join(__dirname, 'data.json'),
      JSON.stringify(dataToSave, null, 2)
    );

    // Update data-backup.json
    require('fs').writeFileSync(
      require('path').join(__dirname, 'data-backup.json'),
      JSON.stringify(dataToSave, null, 2)
    );

    // Trigger email sending
    sendEmailsToSubscribers(formattedStories, dateDisplay);

    res.json({
      success: true,
      stories_published: formattedStories.length,
      can_undo_until: dataToSave.can_undo_until,
      message: `${formattedStories.length} stories published. 15 minutes to undo.`
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── ROUTE 6: Undo submit ──────────────────────────────────────────────────────
// POST /api/admin/undo-submit
// Body: { date: '2026-05-29' }
async function undoSubmit(req, res) {
  try {
    const date = req.body.date || new Date().toISOString().split('T')[0];

    // Check if within 15 minute window
    const dataPath = require('path').join(__dirname, 'data.json');
    if (require('fs').existsSync(dataPath)) {
      const data = JSON.parse(require('fs').readFileSync(dataPath, 'utf8'));
      if (data.can_undo_until) {
        const undoDeadline = new Date(data.can_undo_until);
        if (new Date() > undoDeadline) {
          return res.status(400).json({ error: 'Undo window expired (15 minutes)' });
        }
      }
    }

    // Reset approved stories back to voices_generated
    await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?run_date=eq.${date}&status=eq.approved`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'voices_generated', approved_at: null })
      }
    );

    // Restore backup
    const backupPath = require('path').join(__dirname, 'data-backup.json');
    if (require('fs').existsSync(backupPath)) {
      require('fs').copyFileSync(backupPath, require('path').join(__dirname, 'data.json'));
    }

    res.json({ success: true, message: 'Submit undone. Stories back to review.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── ROUTE 7: Auto-fallback (called by cron if no submit by 6:45 AM) ───────────
// POST /api/admin/auto-fallback
async function autoFallback(req, res) {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yDate = yesterday.toISOString().split('T')[0];

    // Fetch yesterday's approved stories
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
      is_previous_day: true
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

    res.json({
      success: true,
      message: `Auto-fallback: ${formattedStories.length} previous day stories published`
    });
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
      const roleKey = role === 'student' ? 'student' : 'professional';
      const regionKey = isHinglish ? 'north' : 'south';
      const voiceKey = `${roleKey}_${regionKey}`;
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
        const voiceText = s.voices && s.voices[voiceKey]
          ? s.voices[voiceKey]
          : s.voices && s.voices[roleKey]
          ? s.voices[roleKey]
          : s.summary;

        return `<tr><td style="padding:0 0 14px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0C0C18;border-radius:12px;border:0.5px solid rgba(255,255,255,.07);overflow:hidden;">
            <tr><td style="height:2px;background:linear-gradient(90deg,#2979FF,#00B4FF);"></td></tr>
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(92,200,255,.6);font-weight:600;">${s.category}${s.is_previous_day ? ' · Yesterday' : ''}</p>
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
  autoFallback
};
