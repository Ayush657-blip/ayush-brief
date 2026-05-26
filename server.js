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
      html: `<div style="background:#07070F;padding:40px;text-align:center;font-family:Arial;"><h1 style="color:#E8C558;">☀ The Dawn Brief</h1><p style="color:#fff;">Yaar ${firstName}, tera OTP:</p><div style="background:#0C0C18;border:1px solid #5CC8FF;border-radius:12px;padding:24px;margin:20px 0;"><p style="color:#5CC8FF;font-size:36px;font-weight:bold;letter-spacing:8px;margin:0;">${otp}</p></div><p style="color:rgba(255,255,255,.4);font-size:12px;">10 minutes mein expire hoga.</p></div>`
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
    if (!records || records.length === 0) return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    const record = records[0];
    if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: 'OTP expired. Request a new one.' });
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
  const { email, name, phone, role } = req.body;
  console.log(`📥 Subscribe attempt: ${email} [${role}]`);
  if (!email || !name || !phone || !role) return res.status(400).json({ error: 'All fields required.' });
  if (!['student', 'employee', 'agent'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  const phoneClean = phone.replace(/\D/g, '');
  if (phoneClean.length !== 10) return res.status(400).json({ error: 'Valid 10 digit phone required.' });
  try {
    console.log(`🔍 Checking email duplicate...`);
    const emailCheck = await supabaseQuery(`subscribers?email=eq.${encodeURIComponent(email)}&select=email`);
    if (emailCheck && emailCheck.length > 0) {
      console.log(`Already subscribed: ${email}`);
      return res.json({ success: true, message: 'Subscribed successfully!' });
    }
    console.log(`🔍 Checking phone duplicate...`);
    const phoneCheck = await supabaseQuery(`subscribers?phone=eq.${phoneClean}&select=phone`);
    if (phoneCheck && phoneCheck.length > 0) return res.status(400).json({ error: 'Phone already registered.' });
    console.log(`💾 Saving subscriber...`);
    await supabaseQuery('subscribers', 'POST', { email, name, phone: phoneClean, role, segment: role, source: 'website', is_active: true });
    console.log(`✅ Subscribed: ${email} [${role}]`);
    try {
      const firstName = name.split(' ')[0];
      const voiceLabels = { student: '🎓 Student', employee: '💼 Employee', agent: '🌾 Commission Agent' };
      await resend.emails.send({
        from: 'The Dawn Brief <newsletter@ayushbrief.online>',
        to: [email],
        subject: `☀ Welcome to The Dawn Brief, ${firstName}!`,
        html: `<div style="background:#07070F;padding:40px;text-align:center;font-family:Arial;"><h1 style="color:#E8C558;">☀ Welcome ${firstName}!</h1><p style="color:#fff;">Tu officially Dawn Brief family mein aa gaya. 🎉</p><p style="color:rgba(255,255,255,.6);">Voice: ${voiceLabels[role]}</p><p style="color:rgba(255,255,255,.4);">Kal subah 6 AM pe teri pehli brief aayegi.</p></div>`
      });
      console.log(`✅ Welcome email sent to ${email}`);
    } catch (emailErr) {
      console.error(`⚠️ Welcome email failed (ok): ${emailErr.message}`);
    }
    res.json({ success: true, message: 'Subscribed successfully!' });
  } catch (err) {
    console.error(`❌ Subscribe FINAL error: ${err.message}`);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── DATA.JSON PROXY ──────────────────────────────────────────────────────────
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

app.post('/unsubscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required.' });
  try {
    await fetch(`${SUPA_URL}/rest/v1/subscribers?email=eq.${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false })
    });
    res.json({ success: true, message: 'Unsubscribed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unsubscribe.' });
  }
});

app.listen(PORT, () => console.log(`\n🌅 Dawn Brief API on port ${PORT} | SUPABASE_KEY: ${SUPA_KEY ? 'SET ✅' : 'MISSING ❌'}`));
