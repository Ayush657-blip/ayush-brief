const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

// ── CONFIG ────────────────────────────────────────────────────────────────────
const SUPA_URL = 'https://ygkviidhuqicfnvyuiiu.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY || 'sb_publishable_mklkZ61P5MmwCA7UyIEOEQ_rmFbaV3k';
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors({ origin: ['https://ayushbrief.online', 'http://localhost:3000'] }));
app.use(express.json());

// ── HELPERS ───────────────────────────────────────────────────────────────────
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
    throw new Error(`Supabase error: ${err}`);
  }
  if (method === 'GET') return res.json();
  return null;
}

// ── RATE LIMITING (simple in-memory) ─────────────────────────────────────────
const rateLimitMap = new Map();
function rateLimit(ip, maxRequests = 5, windowMs = 60000) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  record.count++;
  rateLimitMap.set(ip, record);
  return record.count <= maxRequests;
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'The Dawn Brief API' });
});

// ── SEND OTP ──────────────────────────────────────────────────────────────────
app.post('/send-otp', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!rateLimit(ip, 5, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Wait 1 minute.' });
  }

  const { email, name } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required.' });
  }

  try {
    // Check if email already subscribed
    const existing = await supabaseQuery(`subscribers?email=eq.${encodeURIComponent(email)}&select=email`);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Email already subscribed.' });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    // Delete old OTPs for this email
    await fetch(`${SUPA_URL}/rest/v1/otp_store?email=eq.${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`
      }
    });

    // Save new OTP to Supabase
    await supabaseQuery('otp_store', 'POST', { email, otp, expires_at: expiresAt, used: false });

    // Send OTP email via Resend
    const firstName = (name || 'friend').split(' ')[0];
    const { error } = await resend.emails.send({
      from: 'The Dawn Brief <newsletter@ayushbrief.online>',
      to: [email],
      subject: `${otp} — Your Dawn Brief verification code`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#07070F;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#07070F;padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;">
        <tr><td style="height:1.5px;background:linear-gradient(90deg,transparent,#5CC8FF,#fff,#5CC8FF,transparent);"></td></tr>
        <tr>
          <td style="background:#07070F;border-radius:16px;padding:40px 36px;text-align:center;border:.5px solid rgba(255,255,255,.08);">
            <p style="margin:0 0 8px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:rgba(92,200,255,.5);font-family:'Courier New',monospace;">The Dawn Brief</p>
            <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;color:#E8C558;">☀ Verify Your Email</h1>
            <p style="margin:0 0 24px;font-size:14px;color:rgba(255,255,255,.6);line-height:1.7;">Yaar ${firstName}, yeh raha tera verification code:</p>
            <div style="background:#0C0C18;border:.5px solid rgba(92,200,255,.3);border-radius:12px;padding:24px;margin:0 0 24px;">
              <p style="margin:0;font-family:'Courier New',monospace;font-size:42px;font-weight:bold;color:#5CC8FF;letter-spacing:8px;">${otp}</p>
            </div>
            <p style="margin:0 0 8px;font-size:12px;color:rgba(255,255,255,.3);">Yeh code 10 minutes mein expire ho jaayega.</p>
            <p style="margin:0;font-size:12px;color:rgba(255,255,255,.3);">Agar tune subscribe nahi kiya toh ignore karo.</p>
          </td>
        </tr>
        <tr><td style="height:1px;background:linear-gradient(90deg,transparent,rgba(92,200,255,.15),transparent);"></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
    });

    if (error) throw new Error(error.message);

    console.log(`✅ OTP sent to ${email}`);
    res.json({ success: true, message: 'OTP sent successfully.' });

  } catch (err) {
    console.error(`❌ Send OTP error: ${err.message}`);
    res.status(500).json({ error: 'Failed to send OTP. Try again.' });
  }
});

// ── VERIFY OTP ────────────────────────────────────────────────────────────────
app.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP required.' });
  }

  try {
    const records = await supabaseQuery(
      `otp_store?email=eq.${encodeURIComponent(email)}&otp=eq.${otp}&used=eq.false&select=id,expires_at`
    );

    if (!records || records.length === 0) {
      return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    }

    const record = records[0];
    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    }

    // Mark OTP as used
    await fetch(`${SUPA_URL}/rest/v1/otp_store?id=eq.${record.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ used: true })
    });

    console.log(`✅ OTP verified for ${email}`);
    res.json({ success: true, message: 'Email verified successfully.' });

  } catch (err) {
    console.error(`❌ Verify OTP error: ${err.message}`);
    res.status(500).json({ error: 'Verification failed. Try again.' });
  }
});

// ── SUBSCRIBE ─────────────────────────────────────────────────────────────────
app.post('/subscribe', async (req, res) => {
  const { email, name, phone, role } = req.body;

  if (!email || !name || !phone || !role) {
    return res.status(400).json({ error: 'All fields required.' });
  }

  if (!['student', 'employee', 'agent'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  // Validate phone — 10 digits
  const phoneClean = phone.replace(/\D/g, '');
  if (phoneClean.length !== 10) {
    return res.status(400).json({ error: 'Valid 10 digit phone number required.' });
  }

  try {
    // Check email unique
    const emailCheck = await supabaseQuery(`subscribers?email=eq.${encodeURIComponent(email)}&select=email`);
    if (emailCheck && emailCheck.length > 0) {
      return res.status(400).json({ error: 'Email already subscribed.' });
    }

    // Check phone unique
    const phoneCheck = await supabaseQuery(`subscribers?phone=eq.${phoneClean}&select=phone`);
    if (phoneCheck && phoneCheck.length > 0) {
      return res.status(400).json({ error: 'Phone number already registered.' });
    }

    // Save subscriber
    await supabaseQuery('subscribers', 'POST', {
      email,
      name,
      phone: phoneClean,
      role,
      segment: role,
      source: 'website',
      is_active: true
    });

    // Send welcome email
    const firstName = name.split(' ')[0];
    const voiceLabels = { student: '🎓 Student', employee: '💼 Employee', agent: '🌾 Commission Agent' };
    await resend.emails.send({
      from: 'The Dawn Brief <newsletter@ayushbrief.online>',
      to: [email],
      subject: `☀ Welcome to The Dawn Brief, ${firstName}!`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#07070F;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#07070F;padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;">
        <tr><td style="height:1.5px;background:linear-gradient(90deg,transparent,#5CC8FF,#fff,#5CC8FF,transparent);"></td></tr>
        <tr>
          <td style="background:#07070F;border-radius:16px;padding:40px 36px;text-align:center;border:.5px solid rgba(255,255,255,.08);">
            <p style="margin:0 0 8px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:rgba(92,200,255,.5);font-family:'Courier New',monospace;">Welcome</p>
            <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;color:#E8C558;">☀ The Dawn Brief</h1>
            <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,.75);line-height:1.75;">Yaar ${firstName}, tu officially Dawn Brief family mein aa gaya. 🎉</p>
            <div style="background:#0C0C18;border:.5px solid rgba(92,200,255,.2);border-radius:12px;padding:20px;margin:0 0 24px;text-align:left;">
              <p style="margin:0 0 6px;font-size:11px;color:rgba(92,200,255,.6);letter-spacing:2px;text-transform:uppercase;">Your Voice</p>
              <p style="margin:0;font-size:18px;color:#fff;">${voiceLabels[role]}</p>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,.5);">Kal subah 6 AM pe teri pehli brief aayegi.</p>
            <p style="margin:0;font-size:13px;color:rgba(255,255,255,.5);">Aaj ke liye bas itna — kal milte hain. ☀</p>
          </td>
        </tr>
        <tr><td style="height:1px;background:linear-gradient(90deg,transparent,rgba(92,200,255,.15),transparent);"></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
    });

    console.log(`✅ Subscribed: ${email} [${role}]`);
    res.json({ success: true, message: 'Subscribed successfully!' });

  } catch (err) {
    console.error(`❌ Subscribe error: ${err.message}`);
    res.status(500).json({ error: 'Subscription failed. Try again.' });
  }
});

// ── UNSUBSCRIBE ───────────────────────────────────────────────────────────────
app.post('/unsubscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required.' });

  try {
    await fetch(`${SUPA_URL}/rest/v1/subscribers?email=eq.${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ is_active: false })
    });

    console.log(`✅ Unsubscribed: ${email}`);
    res.json({ success: true, message: 'Unsubscribed successfully.' });

  } catch (err) {
    console.error(`❌ Unsubscribe error: ${err.message}`);
    res.status(500).json({ error: 'Failed to unsubscribe.' });
  }
});

// ── START SERVER ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌅 The Dawn Brief API running on port ${PORT}`);
});
