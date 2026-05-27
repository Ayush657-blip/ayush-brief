const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

const SUPA_URL = 'https://ygkviidhuqicfnvyuiiu.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY;
const PORT = process.env.PORT || 3000;

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
  const { email, name, role, region } = req.body;
  console.log(`📥 Subscribe attempt: ${email} [${role}] [${region}]`);

  // Validate required fields
  if (!email || !name || !role) {
    return res.status(400).json({ error: 'Name, email and role are required.' });
  }

  // Validate role — student or professional only
  if (!['student', 'professional'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be student or professional.' });
  }

  // Validate region — optional but must be valid if provided
  const validRegions = ['north', 'south', 'east', 'west'];
  if (region && !validRegions.includes(region)) {
    return res.status(400).json({ error: 'Invalid region.' });
  }

  try {
    // Check duplicate email
    console.log(`🔍 Checking duplicate email...`);
    const emailCheck = await supabaseQuery(`subscribers?email=eq.${encodeURIComponent(email)}&select=email,is_active`);

    if (emailCheck && emailCheck.length > 0) {
      const existing = emailCheck[0];
      if (existing.is_active) {
        // Already active subscriber
        console.log(`Already subscribed: ${email}`);
        return res.status(400).json({ error: 'Yaar you are already in the gang! Login instead.' });
      } else {
        // Was unsubscribed — reactivate
        await fetch(`${SUPA_URL}/rest/v1/subscribers?email=eq.${encodeURIComponent(email)}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: true, role, region: region || 'north', name })
        });
        console.log(`✅ Reactivated: ${email}`);
        return res.json({ success: true, message: 'Welcome back to the gang!' });
      }
    }

    // Save new subscriber
    console.log(`💾 Saving new subscriber...`);
    await supabaseQuery('subscribers', 'POST', {
      email,
      name,
      role,
      region: region || 'north',
      segment: role,
      source: 'website',
      is_active: true
    });
    console.log(`✅ Subscribed: ${email} [${role}] [${region}]`);

    // Send welcome email
    try {
      const firstName = name.split(' ')[0];
      const roleLabels = { student: '🎓 Student', professional: '💼 Professional' };
      const regionLabels = { north: '🏔️ North India', west: '🌊 West India', south: '🌴 South India', east: '🌿 East India' };
      const isHinglish = region === 'north' || region === 'west';

      await resend.emails.send({
        from: 'The Dawn Brief <newsletter@ayushbrief.online>',
        to: [email],
        subject: `☀️ Aye ${firstName}, welcome to the gang.`,
        html: `
          <div style="background:#07070F;min-height:100vh;padding:48px 24px;font-family:Arial,sans-serif;text-align:center;">
            <h1 style="color:#E8C558;font-size:32px;margin-bottom:4px;">☀️ The Dawn Brief</h1>
            <p style="color:rgba(255,255,255,.4);font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:40px;">News that feels like a friend</p>
            <div style="background:#0C0C1A;border:0.5px solid rgba(255,255,255,.1);border-radius:16px;padding:36px;max-width:480px;margin:0 auto;">
              <div style="font-size:48px;margin-bottom:16px;">🎉</div>
              <h2 style="color:#fff;font-size:24px;font-weight:300;font-style:italic;margin-bottom:12px;">Welcome to the gang, ${firstName}.</h2>
              <p style="color:rgba(255,255,255,.6);font-size:15px;line-height:1.7;margin-bottom:24px;">${isHinglish ? `Kal subah 6 AM pe teri pehli brief aayegi. Set kar le alarm.` : `Your first brief arrives tomorrow at 6 AM. Do not miss it.`}</p>
              <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-bottom:28px;">
                <span style="background:rgba(41,121,255,.15);border:0.5px solid rgba(92,200,255,.3);color:#5CC8FF;font-size:12px;padding:6px 14px;border-radius:100px;">${roleLabels[role] || role}</span>
                <span style="background:rgba(41,121,255,.15);border:0.5px solid rgba(92,200,255,.3);color:#5CC8FF;font-size:12px;padding:6px 14px;border-radius:100px;">${regionLabels[region] || region}</span>
              </div>
              <a href="https://ayushbrief.online" style="display:inline-block;background:#2979FF;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:500;">Read today's brief →</a>
            </div>
            <p style="color:rgba(255,255,255,.2);font-size:11px;margin-top:32px;">© 2026 The Dawn Brief · ayushbrief.online</p>
            <p style="margin-top:8px;"><a href="https://ayushbrief.online/unsubscribe.html" style="color:rgba(255,255,255,.2);font-size:11px;">Unsubscribe</a></p>
          </div>
        `
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
    const fs = require('fs');
    const path = require('path');
    const dataPath = path.join(__dirname, 'data.json');
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      res.json(data);
    } else {
      res.json({ stories: [], date: '' });
    }
  } catch (err) {
    res.json({ stories: [], date: '' });
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

app.listen(PORT, () => console.log(`\n🌅 Dawn Brief API running on port ${PORT} | SUPABASE_KEY: ${SUPA_KEY ? 'SET ✅' : 'MISSING ❌'}`));
