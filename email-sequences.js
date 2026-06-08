const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const SUPA_URL = 'https://ygkviidhuqicfnvyuiiu.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY;

// ── HELPERS ───────────────────────────────────────────────────────────────────
async function supaFetch(endpoint) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${endpoint}`, {
    headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  return res.json();
}

function daysSince(dateStr) {
  const created = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - created) / (1000 * 60 * 60 * 24));
}

async function sendEmail(to, subject, html) {
  const { error } = await resend.emails.send({
    from: 'The Dawn Brief <newsletter@thedawnbrief.com>',
    to: [to],
    subject,
    html
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

// ── EMAIL TEMPLATES ───────────────────────────────────────────────────────────

function day1Email(name, role, region) {
  const firstName = (name || 'friend').split(' ')[0];
  const isHinglish = region === 'north' || region === 'west';
  const subject = isHinglish
    ? `☀️ Pehli brief kaisi lagi?`
    : `☀️ Your first brief — how was it?`;
  const body = isHinglish
    ? `Yaar ${firstName}, aaj teri pehli Dawn Brief aayi. Kaisi lagi? Agar kuch boring laga ya kuch aur chahiye tha — bata. Hum improve karte rehte hain. Kal bhi aayegi, same time. ☀️`
    : `Hey ${firstName}, your first Dawn Brief arrived today. How was it? If something felt off or you wanted more of something — let us know. We keep getting better. See you tomorrow at 6 AM. ☀️`;

  return {
    subject,
    html: baseTemplate(firstName, subject, body, 'Day 1')
  };
}

function day3Email(name, role, region) {
  const firstName = (name || 'friend').split(' ')[0];
  const isHinglish = region === 'north' || region === 'west';
  const subject = isHinglish
    ? `☀️ 3 din ho gaye — still here?`
    : `☀️ 3 days in — still here?`;
  const body = isHinglish
    ? `${firstName} bhai, 3 din ho gaye. Tu abhi bhi gang mein hai. That means something. Zyada log day 1 ke baad hi chale jaate hain. Tu nahi gaya. Yeh teri consistency hai. Kal bhi milenge. ☀️`
    : `${firstName}, 3 days in. You are still here. That means something. Most people bail after day one. You did not. That is your consistency showing. See you tomorrow. ☀️`;

  return {
    subject,
    html: baseTemplate(firstName, subject, body, 'Day 3')
  };
}

function day7Email(name, role, region) {
  const firstName = (name || 'friend').split(' ')[0];
  const isHinglish = region === 'north' || region === 'west';
  const subject = isHinglish
    ? `☀️ Ek hafte — officially habit ban gayi`
    : `☀️ One week — you have officially made it a habit`;
  const body = isHinglish
    ? `${firstName}, ek poora hafte ho gaya. Research kehti hai — 7 consecutive days kuch karne se habit ban jaati hai. Tu already wahan pahunch gaya. The Dawn Brief ab teri morning ka part hai. Welcome to the gang — properly. ☀️`
    : `${firstName}, one full week. Research says it takes 7 consecutive days to form a habit. You are already there. The Dawn Brief is now part of your morning. Welcome to the gang — properly. ☀️`;

  return {
    subject,
    html: baseTemplate(firstName, subject, body, 'Day 7')
  };
}

function reengagement7Email(name, role, region) {
  const firstName = (name || 'friend').split(' ')[0];
  const isHinglish = region === 'north' || region === 'west';
  const subject = isHinglish
    ? `☀️ Yaar kahin kho gaye?`
    : `☀️ Hey, where did you go?`;
  const body = isHinglish
    ? `${firstName} bhai, 7 din se teri koi khabar nahi. Brief aati rahi, tu nahi aaya. Koi baat nahi — busy hote hain. Yeh rahi is hafte ki 3 best stories jo tune miss ki. Wapas aa. Gang wait kar rahi hai. ☀️`
    : `${firstName}, it has been 7 days. Your brief kept coming. You stopped reading. No judgment — life gets busy. Here are the 3 best stories you missed this week. Come back. The gang is waiting. ☀️`;

  return {
    subject,
    html: baseTemplate(firstName, subject, body, 'Re-engagement')
  };
}

function reengagement14Email(name, role, region) {
  const firstName = (name || 'friend').split(' ')[0];
  const isHinglish = region === 'north' || region === 'west';
  const subject = isHinglish
    ? `☀️ Last call — kya hum tumhe jaane dein?`
    : `☀️ Last call — should we let you go?`;
  const body = isHinglish
    ? `${firstName}, 14 din ho gaye. Hum samajhte hain — inbox mein bohot kuch hota hai. Agar Dawn Brief kaam nahi aa rahi, toh koi baat nahi — unsubscribe kar sakte ho. Lekin agar tu wapas aana chahta hai — hum yahan hain. Roz subah 6 baje. ☀️`
    : `${firstName}, 14 days. We get it — inboxes get crowded. If The Dawn Brief is not working for you, no hard feelings — you can unsubscribe below. But if you want to come back — we are here. Every morning at 6 AM. ☀️`;

  return {
    subject,
    html: baseTemplate(firstName, subject, body, 'Last Call', true)
  };
}

function baseTemplate(firstName, subject, body, tag, showUnsub = false) {
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
            <p style="margin:0 0 4px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:rgba(92,200,255,.4);">The Dawn Brief · ${tag}</p>
            <h1 style="margin:0 0 4px;font-family:Georgia,serif;font-size:26px;color:#E8C558;">☀️ The Dawn Brief</h1>
          </td>
        </tr>
        <tr>
          <td style="background:#0C0C18;padding:28px;border-left:0.5px solid rgba(255,255,255,.05);border-right:0.5px solid rgba(255,255,255,.05);">
            <p style="margin:0;font-size:15px;color:rgba(255,255,255,.75);line-height:1.85;">${body}</p>
            <p style="margin:24px 0 0;text-align:center;">
              <a href="https://thedawnbrief.com" style="display:inline-block;background:#2979FF;color:#fff;text-decoration:none;padding:13px 32px;border-radius:12px;font-size:14px;font-weight:500;">Read today's brief →</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#07070F;padding:16px 28px 20px;text-align:center;border:0.5px solid rgba(255,255,255,.05);border-top:none;border-radius:0 0 16px 16px;">
            <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:14px;color:#E8C558;">☀️ The Dawn Brief</p>
            <p style="margin:0 0 8px;font-size:11px;color:rgba(255,255,255,.2);">News that feels like a friend · thedawnbrief.com</p>
            <p style="margin:0;font-size:11px;">
              <a href="https://thedawnbrief.com" style="color:#5CC8FF;text-decoration:none;">Read on website</a>
              &nbsp;·&nbsp;
              <a href="https://thedawnbrief.com/unsubscribe.html" style="color:rgba(255,255,255,.2);text-decoration:none;">Unsubscribe</a>
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
  console.log('\n📧 Email Sequences — Starting...');
  console.log('='.repeat(50));

  const subscribers = await supaFetch(
    'subscribers?is_active=eq.true&select=email,name,role,region,created_at'
  );
  console.log(`✅ ${subscribers.length} active subscribers loaded`);

  let sent = 0;
  let skipped = 0;

  for (const sub of subscribers) {
    const days = daysSince(sub.created_at);
    const { email, name, role, region } = sub;

    try {
      if (days === 1) {
        const { subject, html } = day1Email(name, role, region);
        await sendEmail(email, subject, html);
        console.log(`✅ Day 1 → ${email}`);
        sent++;
      } else if (days === 3) {
        const { subject, html } = day3Email(name, role, region);
        await sendEmail(email, subject, html);
        console.log(`✅ Day 3 → ${email}`);
        sent++;
      } else if (days === 7) {
        const { subject, html } = day7Email(name, role, region);
        await sendEmail(email, subject, html);
        console.log(`✅ Day 7 → ${email}`);
        sent++;
      } else if (days === 7) {
        // Re-engagement at 7 days no open — using days since created as proxy
        // In production, wire to actual open tracking
        const { subject, html } = reengagement7Email(name, role, region);
        await sendEmail(email, subject, html);
        console.log(`✅ Re-engagement 7d → ${email}`);
        sent++;
      } else if (days === 14) {
        const { subject, html } = reengagement14Email(name, role, region);
        await sendEmail(email, subject, html);
        console.log(`✅ Re-engagement 14d → ${email}`);
        sent++;
      } else {
        skipped++;
      }
      // Small delay between emails
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.log(`❌ Failed for ${email}: ${err.message}`);
    }
  }

  console.log('─'.repeat(50));
  console.log(`✅ Sent: ${sent} | Skipped: ${skipped}`);
  console.log('📧 Email sequences complete.');
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
