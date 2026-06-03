const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const webpush = require('web-push');

// ── WEB PUSH CONFIG ───────────────────────────────────────────────────────────
webpush.setVapidDetails(
  'mailto:ayush@ayushbrief.online',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

const SUPA_URL = 'https://ygkviidhuqicfnvyuiiu.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY;
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = 'dawnbrief2026';

// ── HTTPS ENFORCEMENT ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(301, 'https://' + req.headers.host + req.url);
  }
  next();
});

// ── SECURITY HEADERS (CSP) ────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' https://*.supabase.co https://api.anthropic.com https://api.resend.com https://api.elevenlabs.io; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "frame-ancestors 'none';"
  );
  next();
});

app.use(cors());
app.use(express.json());

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function supabaseQuery(endpoint, method = 'GET', body = null) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${endpoint}`, {
    method,
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=minimal' : ''
    },
    body: body ? JSON.stringify(body) : null
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`SUPABASE ${method} ${endpoint} FAILED [${res.status}]: ${err}`);
    throw new Error(`Supabase error [${res.status}]: ${err}`);
  }
  if (method === 'GET') return res.json();
  return null;
}

const rateLimitMap = new Map();
function rateLimit(ip, maxRequests = 5, windowMs = 60000) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  rateLimitMap.set(ip, record);
  return record.count <= maxRequests;
}

// ── ADMIN AUTH MIDDLEWARE ─────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'The Dawn Brief API', supabase_key_set: !!SUPA_KEY });
});

app.post('/send-otp', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!rateLimit(ip, 5, 60000)) return res.status(429).json({ error: 'Too many requests.' });
  const { email, name } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required.' });
  try {
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await fetch(`${SUPA_URL}/rest/v1/otp_store?email=eq.${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
    });
    await supabaseQuery('otp_store', 'POST', { email, otp, expires_at: expiresAt, used: false });
    const firstName = (name || 'friend').split(' ')[0];
    const { error } = await resend.emails.send({
      from: 'The Dawn Brief <newsletter@ayushbrief.online>',
      to: [email],
      subject: `${otp} — Your Dawn Brief verification code`,
      html: `<div style="background:#07070F;padding:40px;text-align:center;font-family:Arial,sans-serif;"><h1 style="color:#E8C558;font-size:28px;margin-bottom:8px;">☀️ The Dawn Brief</h1><p style="color:rgba(255,255,255,.8);font-size:16px;margin-bottom:24px;">Yaar ${firstName}, tera secret code:</p><div style="background:#0C0C18;border:1px solid #5CC8FF;border-radius:12px;padding:24px;margin:20px auto;max-width:280px;"><p style="color:#5CC8FF;font-size:40px;font-weight:bold;letter-spacing:10px;margin:0;">${otp}</p></div><p style="color:rgba(255,255,255,.4);font-size:12px;margin-top:16px;">10 minutes mein expire hoga. Jaldi kar.</p></div>`
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
    console.log(`✅ OTP sent to ${email}`);
    res.json({ success: true, message: 'OTP sent successfully.' });
  } catch (err) {
    console.error(`❌ Send OTP error: ${err.message}`);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required.' });
  try {
    const records = await supabaseQuery(`otp_store?email=eq.${encodeURIComponent(email)}&otp=eq.${otp}&used=eq.false&select=id,expires_at`);
    if (!records || records.length === 0) return res.status(400).json({ error: 'Invalid code. Please try again.' });
    const record = records[0];
    if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: 'Code expired. Request a new one.' });
    await fetch(`${SUPA_URL}/rest/v1/otp_store?id=eq.${record.id}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ used: true })
    });
    console.log(`✅ OTP verified for ${email}`);
    res.json({ success: true, message: 'Email verified successfully.' });
  } catch (err) {
    console.error(`❌ Verify OTP error: ${err.message}`);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.post('/subscribe', async (req, res) => {
  const { email, name, role, region, ref } = req.body;
  console.log(`📥 Subscribe attempt: ${email} [${role}] [${region}]`);
  if (!email || !name || !role) return res.status(400).json({ error: 'Name, email and role are required.' });
  if (!['student', 'professional'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  const validRegions = ['north', 'south', 'east', 'west'];
  if (region && !validRegions.includes(region)) return res.status(400).json({ error: 'Invalid region.' });
  try {
    const emailCheck = await supabaseQuery(`subscribers?email=eq.${encodeURIComponent(email)}&select=email,is_active,region`);
    if (emailCheck && emailCheck.length > 0) {
      const existing = emailCheck[0];
      if (existing.is_active && existing.region) {
        return res.status(400).json({ error: 'Yaar you are already in the gang! Login instead.' });
      } else if (existing.is_active && !existing.region) {
        await fetch(`${SUPA_URL}/rest/v1/subscribers?email=eq.${encodeURIComponent(email)}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ region: region || 'north', role, name })
        });
        return res.json({ success: true, message: 'Profile updated successfully!' });
      } else {
        await fetch(`${SUPA_URL}/rest/v1/subscribers?email=eq.${encodeURIComponent(email)}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: true, role, region: region || 'north', name })
        });
        return res.json({ success: true, message: 'Welcome back to the gang!' });
      }
    }
    const referralCode = require('crypto').createHash('md5').update(email).digest('hex').slice(0, 8);
    await supabaseQuery('subscribers', 'POST', {
      email, name, role, region: region || 'north', segment: role,
      source: ref ? 'referral' : 'website',
      is_active: true,
      referral_code: referralCode,
      referral_count: 0
    });
    if (ref) {
      try {
        await fetch(`${SUPA_URL}/rest/v1/referrals`, {
          method: 'POST',
          headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ referrer_email: ref, referred_email: email })
        });
        const referrers = await supabaseQuery(`subscribers?referral_code=eq.${encodeURIComponent(ref)}&select=email,referral_count`);
        if (referrers && referrers.length > 0) {
          const referrer = referrers[0];
          await fetch(`${SUPA_URL}/rest/v1/subscribers?email=eq.${encodeURIComponent(referrer.email)}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ referral_count: (referrer.referral_count || 0) + 1 })
          });
          console.log(`✅ Referral counted: ${referrer.email} referred ${email}`);
        }
      } catch (refErr) {
        console.error(`⚠️ Referral tracking failed (non-critical): ${refErr.message}`);
      }
    }
    console.log(`✅ Subscribed: ${email} [${role}] [${region}]`);
    try {
      const firstName = name.split(' ')[0];
      const roleLabels = { student: '🎓 Student', professional: '💼 Professional' };
      const regionLabels = { north: '🏔️ North India', west: '🌊 West India', south: '🌴 South India', east: '🌿 East India' };
      const isHinglish = region === 'north' || region === 'west';
      await resend.emails.send({
        from: 'The Dawn Brief <newsletter@ayushbrief.online>',
        to: [email],
        subject: `☀️ Aye ${firstName}, welcome to the gang.`,
        html: `<div style="background:#07070F;min-height:100vh;padding:48px 24px;font-family:Arial,sans-serif;text-align:center;"><h1 style="color:#E8C558;font-size:32px;margin-bottom:4px;">☀️ The Dawn Brief</h1><p style="color:rgba(255,255,255,.4);font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:40px;">News that feels like a friend</p><div style="background:#0C0C1A;border:0.5px solid rgba(255,255,255,.1);border-radius:16px;padding:36px;max-width:480px;margin:0 auto;"><div style="font-size:48px;margin-bottom:16px;">🎉</div><h2 style="color:#fff;font-size:24px;font-weight:300;font-style:italic;margin-bottom:12px;">Welcome to the gang, ${firstName}.</h2><p style="color:rgba(255,255,255,.6);font-size:15px;line-height:1.7;margin-bottom:24px;">${isHinglish ? `Kal subah 6 AM pe teri pehli brief aayegi. Set kar le alarm.` : `Your first brief arrives tomorrow at 6 AM. Do not miss it.`}</p><div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-bottom:28px;"><span style="background:rgba(41,121,255,.15);border:0.5px solid rgba(92,200,255,.3);color:#5CC8FF;font-size:12px;padding:6px 14px;border-radius:100px;">${roleLabels[role]||role}</span><span style="background:rgba(41,121,255,.15);border:0.5px solid rgba(92,200,255,.3);color:#5CC8FF;font-size:12px;padding:6px 14px;border-radius:100px;">${regionLabels[region]||region}</span></div><a href="https://ayushbrief.online" style="display:inline-block;background:#2979FF;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:500;">Read today's brief →</a></div><p style="color:rgba(255,255,255,.2);font-size:11px;margin-top:32px;">© 2026 The Dawn Brief · ayushbrief.online</p><p style="margin-top:8px;"><a href="https://ayushbrief.online/unsubscribe.html" style="color:rgba(255,255,255,.2);font-size:11px;">Unsubscribe</a></p></div>`
      });
      console.log(`✅ Welcome email sent to ${email}`);
    } catch (emailErr) {
      console.error(`⚠️ Welcome email failed (non-critical): ${emailErr.message}`);
    }
    res.json({ success: true, message: 'Subscribed successfully!' });
  } catch (err) {
    console.error(`❌ Subscribe error: ${err.message}`);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── DATA.JSON PROXY ───────────────────────────────────────────────────────────
app.get('/data', async (req, res) => {
  try {
    const todayIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const today = todayIST.toISOString().split('T')[0];

    const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };
    const fetchApprovedFor = async (date) => {
      const r = await fetch(
        `${SUPA_URL}/rest/v1/daily_stories?run_date=eq.${date}&status=eq.approved&select=*&order=importance.asc,id.asc`,
        { headers }
      );
      return r.ok ? await r.json() : [];
    };

    // 1) Today's approved stories
    let servedDate = today;
    let stories = await fetchApprovedFor(today);

    // 2) Fallback: most recent approved day from Supabase (keeps real images)
    if (!stories || stories.length === 0) {
      const latestR = await fetch(
        `${SUPA_URL}/rest/v1/daily_stories?status=eq.approved&select=run_date&order=run_date.desc&limit=1`,
        { headers }
      );
      const latest = latestR.ok ? await latestR.json() : [];
      if (latest && latest.length > 0 && latest[0].run_date) {
        servedDate = latest[0].run_date;
        stories = await fetchApprovedFor(servedDate);
      }
    }

    // 3) Last resort: legacy disk file
    if (!stories || stories.length === 0) {
      const fs = require('fs');
      const path = require('path');
      const dataPath = path.join(__dirname, 'data.json');
      if (fs.existsSync(dataPath)) {
        return res.json(JSON.parse(fs.readFileSync(dataPath, 'utf8')));
      }
      return res.json({ stories: [], date: '' });
    }

    const formatted = stories.map(s => ({
      id: s.id,
      category: s.category,
      headline: s.headline,
      summary: s.summary,
      link: s.link || '',
      pubDate: s.pub_date || '',
      run_date: s.run_date || '',
      image_url: s.image_url || null,
      image_source: s.image_source || null,
      hasVoice: !!(s.voices && (s.voices.student || s.voices.professional)),
      sensitive: false,
      voices: s.voices || null,
      is_previous_day: s.is_previous_day || false,
      is_khatarnak: s.is_khatarnak || false,
      khatarnak_voice: s.khatarnak_voice || null
    }));

    // Display the actual date of the served news (today or the fallback day)
    const dispDate = new Date(servedDate + 'T06:00:00+05:30');
    const dateDisplay = dispDate.toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata'
    });

    res.json({
      generated: new Date().toISOString(),
      date: dateDisplay,
      totalStories: formatted.length,
      stories: formatted
    });
  } catch (err) {
    // Last-resort fallback to disk file
    try {
      const fs = require('fs');
      const path = require('path');
      const dataPath = path.join(__dirname, 'data.json');
      if (fs.existsSync(dataPath)) {
        return res.json(JSON.parse(fs.readFileSync(dataPath, 'utf8')));
      }
    } catch (e) {}
    res.json({ stories: [], date: '' });
  }
});

// ── ARCHIVE: last 30 days of approved stories (newest day first) ───────────────
app.get('/archive', async (req, res) => {
  try {
    const cat = req.query.cat || null;
    const todayIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const cutoffDate = new Date(todayIST.getTime() - 29 * 24 * 60 * 60 * 1000);
    const cutoff = cutoffDate.toISOString().split('T')[0];

    let url = `${SUPA_URL}/rest/v1/daily_stories?status=eq.approved&run_date=gte.${cutoff}&select=*&order=run_date.desc,importance.asc,id.asc`;
    if (cat) url += `&category=eq.${encodeURIComponent(cat)}`;

    const r = await fetch(url, { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } });
    const rows = r.ok ? await r.json() : [];

    const fmtDate = (d) => {
      try {
        return new Date(d + 'T06:00:00+05:30').toLocaleDateString('en-IN', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata'
        });
      } catch (e) { return d; }
    };

    const stories = rows.map(s => ({
      id: s.id,
      category: s.category,
      headline: s.headline,
      summary: s.summary,
      link: s.link || '',
      run_date: s.run_date || '',
      date_display: fmtDate(s.run_date),
      pubDate: s.pub_date || '',
      image_url: s.image_url || null,
      image_source: s.image_source || null,
      is_previous_day: s.is_previous_day || false
    }));

    res.json({ cutoff, category: cat, totalStories: stories.length, stories });
  } catch (err) {
    res.json({ stories: [], category: req.query.cat || null });
  }
});

// ── SINGLE STORY by permanent Supabase id (+ a few more) ──────────────────────
app.get('/story', async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    const r = await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?id=eq.${id}&select=*`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    const rows = r.ok ? await r.json() : [];
    if (!rows || rows.length === 0) return res.json({ story: null, more: [] });
    const s = rows[0];

    const fmtDate = (d) => {
      try {
        return new Date(d + 'T06:00:00+05:30').toLocaleDateString('en-IN', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata'
        });
      } catch (e) { return d; }
    };

    const story = {
      id: s.id,
      category: s.category,
      headline: s.headline,
      summary: s.summary,
      link: s.link || '',
      run_date: s.run_date || '',
      date_display: fmtDate(s.run_date),
      image_url: s.image_url || null,
      voices: s.voices || null,
      khatarnak_voice: s.khatarnak_voice || null
    };

    // a few other recent approved stories (newest first), excluding this one
    let more = [];
    try {
      const mr = await fetch(
        `${SUPA_URL}/rest/v1/daily_stories?status=eq.approved&id=neq.${id}&select=id,category,headline&order=run_date.desc,importance.asc,id.asc&limit=4`,
        { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
      );
      more = mr.ok ? await mr.json() : [];
    } catch (e) {}

    res.json({ story, more });
  } catch (err) {
    res.json({ story: null, more: [] });
  }
});

// ── UNSUBSCRIBE ───────────────────────────────────────────────────────────────
app.post('/unsubscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required.' });
  try {
    await fetch(`${SUPA_URL}/rest/v1/subscribers?email=eq.${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false })
    });
    console.log(`✅ Unsubscribed: ${email}`);
    res.json({ success: true, message: 'Unsubscribed successfully.' });
  } catch (err) {
    console.error(`❌ Unsubscribe error: ${err.message}`);
    res.status(500).json({ error: 'Failed to unsubscribe.' });
  }
});

// ── TRACK EVENTS ──────────────────────────────────────────────────────────────
app.post('/track', async (req, res) => {
  try {
    const { event, data, url, email } = req.body;
    await supabaseQuery('page_visits', 'POST', { event, data: JSON.stringify(data), url, user_email: email || null });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post('/track-click', async (req, res) => {
  try {
    const { headline, category, story_index, email } = req.body;
    await supabaseQuery('story_clicks', 'POST', { headline, category, story_index, user_email: email || null });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post('/track-feedback', async (req, res) => {
  try {
    const { story_index, feedback, email, headline } = req.body;
    await supabaseQuery('story_feedback', 'POST', { story_index, feedback, user_email: email || null, headline: headline || null });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

// ════════════════════════════════════════════════════════════════════
// ADMIN ROUTES — all protected by adminAuth middleware
// ════════════════════════════════════════════════════════════════════

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const all = await supabaseQuery('subscribers?select=id,is_active,created_at');
    const total = all.length;
    const active = all.filter(s => s.is_active).length;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const newToday = all.filter(s => new Date(s.created_at) >= todayStart).length;
    res.json({ total, active, newToday });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/breakdown', adminAuth, async (req, res) => {
  try {
    const all = await supabaseQuery('subscribers?is_active=eq.true&select=role,region');
    const total = all.length;
    const student = all.filter(s => s.role === 'student').length;
    const professional = all.filter(s => s.role === 'professional').length;
    const north = all.filter(s => s.region === 'north').length;
    const south = all.filter(s => s.region === 'south').length;
    const east = all.filter(s => s.region === 'east').length;
    const west = all.filter(s => s.region === 'west').length;
    res.json({ total, student, professional, north, south, east, west });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/funnel', adminAuth, async (req, res) => {
  try {
    const visits = await supabaseQuery('page_visits?select=event');
    const count = (evt) => visits.filter(v => v.event === evt).length;
    const subs = await supabaseQuery('subscribers?select=id');
    const step5real = count('onboarding_complete') || subs.length;
    res.json({
      step1: count('onboarding_start') || step5real,
      step2: count('otp_sent') || step5real,
      step3: count('otp_verified') || step5real,
      step4: count('role_selected') || step5real,
      step5: step5real
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/analytics', adminAuth, async (req, res) => {
  try {
    const clicks = await supabaseQuery('story_clicks?select=headline,category');
    const clickMap = {};
    clicks.forEach(c => {
      const key = c.headline || 'Unknown';
      if (!clickMap[key]) clickMap[key] = { headline: key, category: c.category || '', count: 0 };
      clickMap[key].count++;
    });
    const topClicks = Object.values(clickMap).sort((a, b) => b.count - a.count).slice(0, 6);
    const feedback = await supabaseQuery('story_feedback?select=story_index,feedback,headline');
    const fbMap = {};
    feedback.forEach(f => {
      const key = f.headline || `story_${f.story_index}`;
      if (!fbMap[key]) fbMap[key] = { headline: key, story_index: f.story_index, up: 0, down: 0 };
      if (f.feedback === 'up') fbMap[key].up++;
      else fbMap[key].down++;
    });
    const topFeedback = Object.values(fbMap).sort((a, b) => (b.up + b.down) - (a.up + a.down)).slice(0, 6);
    res.json({ clicks: topClicks, feedback: topFeedback });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/sent-log', adminAuth, async (req, res) => {
  try {
    const events = await supabaseQuery('page_visits?event=eq.newsletter_sent&select=data,created_at&order=created_at.desc&limit=10');
    const log = events.map(e => {
      let parsed = {};
      try { parsed = JSON.parse(e.data || '{}'); } catch {}
      return {
        label: parsed.label || 'Newsletter',
        time: new Date(e.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        count: parsed.count || 0,
        success: parsed.success !== false
      };
    });
    res.json({ log });
  } catch (err) {
    res.json({ log: [] });
  }
});

app.post('/api/trigger-newsletter', adminAuth, async (req, res) => {
  try {
    const { execFile } = require('child_process');
    console.log('🔔 Manual newsletter trigger by admin');
    execFile('node', ['index.js'], { cwd: __dirname, timeout: 300000 }, (err, stdout, stderr) => {
      if (err) console.error('Newsletter trigger error:', err.message);
      else console.log('Newsletter triggered successfully');
    });
    res.json({ success: true, message: 'Newsletter triggered. Check Railway logs.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── REFERRAL SYSTEM ───────────────────────────────────────────────────────────
app.get('/referral/:code', async (req, res) => {
  const { code } = req.params;
  res.redirect(302, `https://ayushbrief.online/?ref=${code}`);
});

app.get('/api/referral/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const data = await supabaseQuery(
      `subscribers?email=eq.${encodeURIComponent(email)}&select=referral_code,referral_count&is_active=eq.true`
    );
    if (!data || data.length === 0) return res.status(404).json({ error: 'Subscriber not found.' });
    const { referral_code, referral_count } = data[0];
    res.json({
      referral_code,
      referral_count: referral_count || 0,
      referral_link: `https://ayushbrief.online/?ref=${referral_code}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/referral/track', async (req, res) => {
  const { referral_code, referred_email } = req.body;
  if (!referral_code || !referred_email) return res.json({ success: false });
  try {
    const referrers = await supabaseQuery(
      `subscribers?referral_code=eq.${encodeURIComponent(referral_code)}&select=email,referral_count`
    );
    if (!referrers || referrers.length === 0) return res.json({ success: false });
    const referrer = referrers[0];
    await supabaseQuery('referrals', 'POST', {
      referrer_email: referrer.email,
      referred_email
    });
    await fetch(`${SUPA_URL}/rest/v1/subscribers?email=eq.${encodeURIComponent(referrer.email)}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ referral_count: (referrer.referral_count || 0) + 1 })
    });
    console.log(`✅ Referral tracked: ${referrer.email} referred ${referred_email}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`❌ Referral track error: ${err.message}`);
    res.json({ success: false });
  }
});

app.get('/api/admin/referrals', adminAuth, async (req, res) => {
  try {
    const data = await supabaseQuery(
      'subscribers?is_active=eq.true&select=email,name,referral_count&order=referral_count.desc&limit=10'
    );
    res.json({ referrers: data.filter(s => (s.referral_count || 0) > 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUSH NOTIFICATION ROUTES ──────────────────────────────────────────────────
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', async (req, res) => {
  const { subscription, email } = req.body;
  if (!subscription) return res.status(400).json({ error: 'Subscription required.' });
  try {
    const subStr = JSON.stringify(subscription);
    await fetch(`${SUPA_URL}/rest/v1/subscribers?email=eq.${encodeURIComponent(email || '')}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ push_subscription: subStr })
    });
    console.log(`✅ Push subscription saved for ${email || 'anonymous'}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`❌ Push subscribe error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/push/send-all', adminAuth, async (req, res) => {
  const { title, body, url } = req.body;
  try {
    const subscribers = await supabaseQuery('subscribers?is_active=eq.true&select=email,push_subscription');
    const withPush = subscribers.filter(s => s.push_subscription);
    console.log(`📲 Sending push to ${withPush.length} subscribers`);
    let sent = 0; let failed = 0;
    for (const sub of withPush) {
      try {
        const subscription = JSON.parse(sub.push_subscription);
        await webpush.sendNotification(subscription, JSON.stringify({
          title: title || '☀️ The Dawn Brief',
          body: body || 'Tera brief ready hai. Dekh le.',
          url: url || 'https://ayushbrief.online'
        }));
        sent++;
      } catch (err) {
        failed++;
        if (err.statusCode === 410) {
          await fetch(`${SUPA_URL}/rest/v1/subscribers?email=eq.${encodeURIComponent(sub.email)}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ push_subscription: null })
          });
        }
      }
    }
    res.json({ success: true, sent, failed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// BHAI MODE — VOICE ROUTES
// ════════════════════════════════════════════════════════════════════

// POST /api/voice/speak — text ko ElevenLabs se audio mein convert karo
app.post('/api/voice/speak', async (req, res) => {
  try {
    const { text, voice_sample } = req.body;
    if (!text) return res.status(400).json({ error: 'Text required.' });

    const VOICE_IDS = {
      'sample1': '9lB2zeiclGQj6fcbsPT2',
      'sample2': 'LexxJMz1bqPc5O2p2GbV'
    };
    const voiceId = VOICE_IDS[voice_sample] || VOICE_IDS['sample1'];

    const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8,
          style: 0.5,
          use_speaker_boost: true
        }
      })
    });

    if (!elRes.ok) {
      const err = await elRes.text();
      console.error(`❌ ElevenLabs error: ${err}`);
      return res.status(500).json({ error: 'Voice generation failed.' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    elRes.body.pipe(res);

  } catch (err) {
    console.error(`❌ Voice speak error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/voice/stories — aaj ki approved stories voice mode ke liye
app.get('/api/voice/stories', async (req, res) => {
  try {
    const { email } = req.query;

    // Subscriber ka role fetch karo
    let role = 'student';
    if (email) {
      const subData = await supabaseQuery(
        `subscribers?email=eq.${encodeURIComponent(email)}&select=role&is_active=eq.true`
      );
      if (subData && subData.length > 0) role = subData[0].role || 'student';
    }

    // Aaj ki approved stories
    const today = new Date().toISOString().split('T')[0];
    const response = await fetch(
      `${SUPA_URL}/rest/v1/daily_stories?run_date=eq.${today}&status=eq.approved&select=*`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
    );
    const stories = await response.json();

    // Category wise group karo
    const byCategory = {};
    stories.forEach(s => {
      if (!byCategory[s.category]) byCategory[s.category] = [];
      byCategory[s.category].push({
        id: s.id,
        headline: s.headline,
        voice_summary: s.voices && s.voices[role] ? s.voices[role] : s.summary,
        is_khatarnak: s.is_khatarnak || false
      });
    });

    // Khatarnak 5 — manually selected by admin
    const khatarnak = stories
      .filter(s => s.is_khatarnak)
      .slice(0, 5)
      .map(s => ({
        id: s.id,
        headline: s.headline,
        voice_summary: s.khatarnak_voice && s.khatarnak_voice[role]
          ? s.khatarnak_voice[role]
          : (s.voices && s.voices[role] ? s.voices[role] : s.summary),
        category: s.category
      }));

    res.json({
      success: true,
      role,
      khatarnak,
      categories: byCategory,
      available_categories: Object.keys(byCategory)
    });

  } catch (err) {
    console.error(`❌ Voice stories error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});


// ── MARKET DATA PROXY ─────────────────────────────────────────────────────────
app.get('/api/market', async (req, res) => {
  try {
    // NSE India official API — free, no key needed
    const nseUrl = 'https://www.nseindia.com/api/allIndices';
    const nseRes = await fetch(nseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/',
        'Connection': 'keep-alive'
      }
    });
    if (!nseRes.ok) throw new Error(`NSE error ${nseRes.status}`);
    const nseData = await nseRes.json();
    const indices = nseData.data || [];

    const result = {};

    // Find NIFTY 50 and SENSEX
    indices.forEach(idx => {
      if (idx.index === 'NIFTY 50') {
        result['nifty'] = {
          price: idx.last,
          change: idx.change,
          changePct: idx.percentChange
        };
      }
      if (idx.index === 'SENSEX') {
        result['sensex'] = {
          price: idx.last,
          change: idx.change,
          changePct: idx.percentChange
        };
      }
      if (idx.index === 'NIFTY IT') {
        result['giftnifty'] = {
          price: idx.last,
          change: idx.change,
          changePct: idx.percentChange,
          label: 'NIFTY IT'
        };
      }
    });

    // Gold & Silver from NSE commodity or static fallback
    // Using MCX data from NSE
    const mcxUrl = 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20COMMODITIES';
    try {
      const mcxRes = await fetch(mcxUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'https://www.nseindia.com/',
          'Accept': 'application/json'
        }
      });
      if (mcxRes.ok) {
        const mcxData = await mcxRes.json();
        // Gold/Silver from commodity indices
      }
    } catch(e) {}

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ success: true, data: result });
  } catch(err) {
    console.error('Market data error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN CONFIG — secure keys for frontend ──────────────────────────────────
app.get('/api/admin/config', adminAuth, (req, res) => {
  res.json({
    deepgramKey: process.env.DEEPGRAM_KEY || ''
  });
});



// ── IMAGE MANAGEMENT ──────────────────────────────────────────────────────────
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

// Pexels search proxy
app.get('/api/images/pexels', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Query required' });
    if (!PEXELS_KEY) return res.status(500).json({ error: 'Pexels key not set' });
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=9&orientation=landscape`, {
      headers: { 'Authorization': PEXELS_KEY }
    });
    if (!r.ok) throw new Error(`Pexels error ${r.status}`);
    const data = await r.json();
    const photos = (data.photos || []).map(p => ({
      id: p.id,
      url: p.src.medium,
      thumb: p.src.small,
      photographer: p.photographer,
      source: 'pexels'
    }));
    res.json({ success: true, photos });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List GitHub category images
app.get('/api/images/github/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const folder = CATEGORY_FOLDER_MAP[category] || category.toLowerCase();
    // Return numbered images 1-20
    const images = [];
    for (let i = 1; i <= 20; i++) {
      images.push({
        url: `${GITHUB_RAW}/${folder}/${i}.jpg`,
        thumb: `${GITHUB_RAW}/${folder}/${i}.jpg`,
        source: 'github',
        name: `${i}.jpg`
      });
    }
    res.json({ success: true, images, folder });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update story image
app.post('/api/admin/update-image', adminAuth, async (req, res) => {
  try {
    const { story_id, image_url, image_source } = req.body;
    if (!story_id || !image_url) return res.status(400).json({ error: 'story_id and image_url required' });
    const r = await fetch(`${SUPA_URL}/rest/v1/daily_stories?id=eq.${story_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ image_url, image_source: image_source || 'manual' })
    });
    if (!r.ok) throw new Error(`Supabase error ${r.status}`);
    console.log(`✅ Image updated for story ${story_id}`);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Remove story image
app.delete('/api/admin/remove-image/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const r = await fetch(`${SUPA_URL}/rest/v1/daily_stories?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ image_url: null, image_source: null })
    });
    if (!r.ok) throw new Error(`Supabase error ${r.status}`);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── MANUAL STORY ADD ──────────────────────────────────────────────────────────
app.post('/api/admin/add-story', adminAuth, async (req, res) => {
  try {
    const { headline, summary, link, source, category } = req.body;
    if (!headline || !category) return res.status(400).json({ error: 'Headline and category required' });
    const runDate = new Date().toISOString().split('T')[0];
    const story = {
      headline: headline.trim(),
      summary: (summary || '').trim(),
      link: link || '',
      pub_date: new Date().toISOString(),
      source: source || 'Manual',
      category,
      importance: '🔴',
      reason: 'Manually added by editor',
      run_date: runDate,
      status: 'pending',
      voices: null,
      is_previous_day: false
    };
    const r = await fetch(`${SUPA_URL}/rest/v1/daily_stories`, {
      method: 'POST',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(story)
    });
    const data = await r.json();
    console.log(`✅ Manual story added: ${headline}`);
    res.json({ success: true, story: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE STORY ──────────────────────────────────────────────────────────────
app.delete('/api/admin/delete-story/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await fetch(`${SUPA_URL}/rest/v1/daily_stories?id=eq.${id}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
    });
    console.log(`✅ Story deleted: ${id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CURATION ROUTES ───────────────────────────────────────────────────────────
const curation = require('./curation-routes');
app.get('/api/admin/stories', adminAuth, (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  next();
}, curation.getAdminStories);
app.post('/api/admin/generate-voices', adminAuth, curation.generateVoices);
app.post('/api/admin/save-summary', adminAuth, curation.saveSummary);
app.post('/api/admin/regenerate-summary', adminAuth, curation.regenerateSummary);
app.post('/api/admin/backfill-summaries', adminAuth, curation.backfillSummaries);
app.post('/api/admin/regenerate-voice', adminAuth, curation.regenerateVoice);
app.post('/api/admin/save-voice', adminAuth, curation.saveVoice);
app.post('/api/admin/submit', adminAuth, curation.submitApproved);
app.post('/api/admin/undo-submit', adminAuth, curation.undoSubmit);
app.post('/api/admin/auto-fallback', adminAuth, curation.autoFallback);
app.post('/api/admin/generate-khatarnak-voices', adminAuth, (req, res, next) => {
  req.setTimeout(300000); // 5 minutes
  res.setTimeout(300000);
  next();
}, curation.generateKhatarnakVoices);
app.post('/api/admin/regenerate-khatarnak-voice', adminAuth, curation.regenerateKhatarnakVoice);

app.listen(PORT, () => console.log(`\n🌅 Dawn Brief API running on port ${PORT} | SUPABASE_KEY: ${SUPA_KEY ? 'SET ✅' : 'MISSING ❌'}`));
