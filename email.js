// ============================================================================
//  email.js — The Dawn Brief daily email (FINAL premium template)
//  generateEmailHTML(stories, date, subscriber) → full HTML for ONE subscriber.
//  Same signature as before (drop-in for the sender). Produces the approved
//  rich template: header + logo + greeting + "In today's brief" teasers +
//  story cards (savage Hinglish voice, gold "Tere liye matlab:") + quick hits +
//  poll + referral + footer. Personalised per subscriber (name, role, unsub).
//
//  Story fields used: id, category, headline, image_url, link,
//    khatarnak_voice[role]  (preferred — savage voice)
//    voices[role]           (fallback)
//    summary                (last resort)
// ============================================================================

// ── helpers ───────────────────────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function emphasize(s) {
  return s
    .replace(/(₹\s?[\d,]+(?:\.\d+)?(?:\s?(?:crore|lakh|cr|k))?)/gi, '<strong style="color:#FFFFFF;">$1</strong>')
    .replace(/(\$\s?[\d,]+(?:\.\d+)?(?:\s?(?:billion|million|bn|mn))?)/gi, '<strong style="color:#FFFFFF;">$1</strong>')
    .replace(/(\b\d+(?:\.\d+)?%)/g, '<strong style="color:#FFFFFF;">$1</strong>');
}
function splitParas(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  let sentences;
  try { sentences = t.match(/[^.!?]+[.!?]+(?:\s|$)/g); } catch (e) { sentences = null; }
  if (!sentences || sentences.length <= 2) return [t];
  const mid = Math.ceil(sentences.length / 2);
  return [sentences.slice(0, mid).join('').trim(), sentences.slice(mid).join('').trim()].filter(Boolean);
}
function cleanVoice(s) {
  return String(s || '')
    .replace(/\*+/g, '')                      // strip markdown asterisks (** , *)
    .replace(/^\s*KHABAR\s*:?\s*/i, '')        // strip leading "KHABAR" label
    .replace(/\bKHABAR\s*:?\s*/gi, '')         // strip any stray "KHABAR" label
    .replace(/[ \t]{2,}/g, ' ')                // collapse double spaces
    .trim();
}
function renderVoice(voiceText) {
  const raw = cleanVoice(voiceText);
  const P = 'margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.75;color:#D6D6E0;';
  const PLAST = 'margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.75;color:#D6D6E0;';
  const parts = raw.split(/tere\s+liye\s+matlab\s*:/i);
  const infoPart = parts[0].trim();
  const punch = parts.length > 1 ? parts.slice(1).join(':').trim() : '';
  const infoParas = splitParas(infoPart);
  let html = infoParas.map((p, i) =>
    `<p style="${(!punch && i === infoParas.length - 1) ? PLAST : P}">${emphasize(esc(p))}</p>`
  ).join('');
  if (punch) {
    html += `<p style="${PLAST}"><strong style="color:#E8C558;">Tere liye matlab:</strong> ${emphasize(esc(punch))}</p>`;
  }
  return html || `<p style="${PLAST}">&nbsp;</p>`;
}

const CAT_EMOJI = {
  'Business': '💼', 'Indian Economy': '🇮🇳', 'Finance': '💰', 'Tech': '🤖',
  'Sports': '🏆', 'Government': '🏛️', 'International': '🌍', 'Climate': '🌱',
  'Startups & Auto': '🚗', 'Science & Health': '🔬', 'Entertainment': '🎬'
};

function voiceFor(story, voiceKey) {
  if (story.khatarnak_voice && story.khatarnak_voice[voiceKey]) return story.khatarnak_voice[voiceKey];
  if (story.voices && story.voices[voiceKey]) return story.voices[voiceKey];
  return story.summary || story.headline || '';
}
function storyUrl(s) {
  return s.id ? `https://ayushbrief.online/story.html?id=${encodeURIComponent(s.id)}` : (s.link || 'https://ayushbrief.online');
}

function storyCard(s, voiceKey) {
  const url = storyUrl(s);
  const tag = esc(s.category || 'News');
  const headline = esc(s.headline || '');
  let media;
  if (s.image_url) {
    media = `
        <tr><td style="padding:0 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0B0B14" style="background-color:#0B0B14;border-radius:12px;">
            <tr><td style="padding:0;line-height:0;font-size:0;">
              <a href="${url}" style="text-decoration:none;"><img src="${esc(s.image_url)}" width="532" alt="${esc(s.headline || 'Dawn Brief')}" style="width:100%;max-width:532px;height:auto;display:block;border-radius:12px;border:0;outline:none;" /></a>
            </td></tr>
          </table>
        </td></tr>`;
  } else {
    const lbl = esc((s.category || 'Dawn Brief').split('·')[0].trim());
    media = `
        <tr><td style="padding:0 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0B0B14" style="background-color:#0B0B14;background-image:radial-gradient(circle at 28% 28%, rgba(232,197,88,.16), transparent 60%);border-radius:12px;">
            <tr><td align="center" height="150" style="height:150px;font-family:Georgia,serif;font-style:italic;font-size:22px;color:rgba(255,255,255,.30);">${lbl}</td></tr>
          </table>
        </td></tr>`;
  }
  return `
    <tr><td style="padding:14px 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0F0F1A" style="background-color:#0F0F1A;border:1px solid #20202E;border-radius:16px;">
        <tr><td style="padding:20px 22px 0;">
          <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:#5CC8FF;font-weight:bold;">${tag}</p>
          <h1 class="h-hero" style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:27px;line-height:1.22;color:#FFFFFF;">${headline}</h1>
        </td></tr>${media}
        <tr><td style="padding:18px 22px 20px;">
          ${renderVoice(voiceFor(s, voiceKey))}
          <a href="${url}" style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;font-weight:bold;color:#E8C558;text-decoration:none;">Pura padho &nbsp;&rarr;</a>
        </td></tr>
      </table>
    </td></tr>`;
}

function generateEmailHTML(stories, date, subscriber) {
  const sub = subscriber || {};
  const name = (sub.name || '').trim();

  function getVoiceKey(r) {
    if (r === 'student') return 'student';
    if (r === 'agent') return 'agent';
    return 'professional'; // professional / employee / anything else
  }
  const voiceKey = getVoiceKey(sub.role);

  const all = Array.isArray(stories) ? stories : [];
  const cards = all;            // ALL khatarnak stories become full cards (no quick-hits)

  const firstName = name ? (name.split(' ')[0].charAt(0).toUpperCase() + name.split(' ')[0].slice(1)) : '';
  const greetName = firstName ? `Good morning, ${esc(firstName)} ☀️` : 'Good morning, friend ☀️';
  const countWord = cards.length
    ? `<strong style="color:#FFFFFF;">${cards.length} biggest stor${cards.length === 1 ? 'y' : 'ies'}</strong>`
    : 'today\'s stories';
  const refCode = encodeURIComponent(sub.referral_code || '');
  const refLink = `https://ayushbrief.online/r/${refCode}`;
  const unsub = sub.email
    ? `https://ayushbrief.online/unsubscribe.html?e=${encodeURIComponent(sub.email)}`
    : 'https://ayushbrief.online/unsubscribe.html';
  const preview = cards.length
    ? `Good morning — aaj ki ${cards.length} sabse badi khabrein, dost ke andaaz mein.`
    : 'The Dawn Brief — news that feels like a friend.';

  const teasers = cards.slice(0, 3).map(s =>
    `<tr><td valign="top" width="18" style="font-family:Arial,sans-serif;font-size:15px;color:#E8C558;line-height:1.7;">&rsaquo;</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.7;color:#C8C8D4;">${esc(s.headline || '')}</td></tr>`
  ).join('');

  const cardsHtml = cards.length
    ? cards.map(s => storyCard(s, voiceKey)).join('')
    : `<tr><td style="padding:30px 22px;text-align:center;"><p style="margin:0;font-family:Georgia,serif;font-style:italic;font-size:17px;color:rgba(255,255,255,.45);">Aaj koi badi khabar nahi — kal milte hain. ☀️</p></td></tr>`;

  // (quick-hits removed — every story is now a full card)

  const poll = `
    <tr><td style="padding:24px 32px 6px;"><div style="height:1px;background-color:#1C1C2A;line-height:0;font-size:0;">&nbsp;</div></td></tr>
    <tr><td class="px" style="padding:16px 32px 6px;" align="center">
      <p style="margin:0 0 14px;font-family:Georgia,serif;font-style:italic;font-size:19px;color:#FFFFFF;">Aaj ki brief kaisi lagi?</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
        <td style="padding:0 4px;"><a href="https://ayushbrief.online/?rate=fire" style="display:inline-block;font-family:Arial,sans-serif;font-size:13px;color:#ECECF2;background-color:#15151F;border:1px solid #2A2A3A;border-radius:22px;padding:9px 16px;text-decoration:none;">🔥 Top</a></td>
        <td style="padding:0 4px;"><a href="https://ayushbrief.online/?rate=ok" style="display:inline-block;font-family:Arial,sans-serif;font-size:13px;color:#ECECF2;background-color:#15151F;border:1px solid #2A2A3A;border-radius:22px;padding:9px 16px;text-decoration:none;">👍 Theek</a></td>
        <td style="padding:0 4px;"><a href="https://ayushbrief.online/?rate=meh" style="display:inline-block;font-family:Arial,sans-serif;font-size:13px;color:#ECECF2;background-color:#15151F;border:1px solid #2A2A3A;border-radius:22px;padding:9px 16px;text-decoration:none;">😐 Meh</a></td>
      </tr></table>
    </td></tr>`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>The Dawn Brief</title>
<!--[if mso]><style>body,table,td,p,a,span,h1,h2{font-family:Georgia,'Times New Roman',serif;}</style><![endif]-->
<style>
  body{margin:0;padding:0;background:#07070F;}
  a{text-decoration:none;}
  .px{padding-left:32px;padding-right:32px;}
  @media only screen and (max-width:620px){
    .container{width:100% !important;}
    .px{padding-left:20px !important;padding-right:20px !important;}
    .h-hero{font-size:25px !important;line-height:1.18 !important;}
    .logo-word{font-size:30px !important;}
    .stack{display:block !important;width:100% !important;}
    .stack-r{text-align:left !important;padding-top:4px !important;}
  }
  @media (prefers-color-scheme: dark){ body,.bg{background:#07070F !important;} }
</style>
</head>
<body style="margin:0;padding:0;background-color:#07070F;">

<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:#07070F;font-size:1px;line-height:1px;">
  ${esc(preview)}
  &#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#07070F" class="bg" style="background-color:#07070F;">
<tr><td align="center" style="padding:24px 12px 40px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px;max-width:600px;">

    <!-- header strip -->
    <tr><td class="px" style="padding:0 32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td class="stack" align="left" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7C7C8A;">${esc(date || '')}</td>
        <td class="stack stack-r" align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.06em;color:#7C7C8A;">
          <a href="https://ayushbrief.online" style="color:#B8902A;text-decoration:none;">View online</a> &nbsp;&middot;&nbsp;
          <a href="https://ayushbrief.online" style="color:#B8902A;text-decoration:none;">Subscribe</a>
        </td>
      </tr></table>
    </td></tr>

    <!-- logo -->
    <tr><td align="center" style="padding:18px 32px 6px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
        <td align="center" style="line-height:0;font-size:0;">
          <div style="width:46px;height:23px;background-color:#E8C558;background-image:linear-gradient(180deg,#FFE878,#B8902A);border-radius:46px 46px 0 0;"></div>
        </td>
      </tr></table>
      <div style="height:10px;line-height:10px;">&nbsp;</div>
      <div class="logo-word" style="font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1;color:#FFFFFF;letter-spacing:.5px;">
        <span style="font-size:14px;letter-spacing:.32em;color:#8A8A98;vertical-align:middle;">THE&nbsp;</span><span style="font-style:italic;color:#E8C558;">Dawn</span><span style="font-size:16px;letter-spacing:.30em;color:#CFCFE0;">&nbsp;BRIEF</span>
      </div>
      <div style="height:8px;line-height:8px;">&nbsp;</div>
      <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:13px;color:#7C7C8A;">News that feels like a friend</div>
      <div style="height:6px;line-height:6px;">&nbsp;</div>
      <div style="width:54px;height:2px;background-color:#B8902A;margin:0 auto;line-height:0;font-size:0;">&nbsp;</div>
    </td></tr>

    <!-- greeting -->
    <tr><td class="px" style="padding:24px 32px 6px;">
      <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#ECECF2;">
        <span style="color:#E8C558;font-weight:bold;">${greetName}</span> Here are today's ${countWord} — told the way a friend would over chai. Give it 2 minutes and you're fully caught up.
      </p>
      <p style="margin:0;font-family:Georgia,serif;font-style:italic;font-size:13px;color:#7C7C8A;">— Team Dawn Brief</p>
    </td></tr>

    ${teasers ? `<!-- in today's brief -->
    <tr><td class="px" style="padding:18px 32px 8px;">
      <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#5CC8FF;font-weight:bold;">In today's brief</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${teasers}</table>
    </td></tr>
    <tr><td style="padding:14px 32px 4px;"><div style="height:1px;background-color:#1C1C2A;line-height:0;font-size:0;">&nbsp;</div></td></tr>` : ''}

    <!-- story cards -->
    ${cardsHtml}
    ${poll}

    <tr><td style="padding:24px 32px 6px;"><div style="height:1px;background-color:#1C1C2A;line-height:0;font-size:0;">&nbsp;</div></td></tr>

    <!-- share / referral -->
    <tr><td style="padding:8px 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0F0F18" style="background-color:#0F0F18;background-image:linear-gradient(135deg,#13131F,#0B0B12);border:1px solid #2A2418;border-radius:16px;">
        <tr><td align="center" style="padding:26px 24px;">
          <p style="margin:0 0 8px;font-family:Georgia,serif;font-style:italic;font-size:21px;color:#E8C558;">Grow the gang 🤝</p>
          <p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;color:#C8C8D4;">Liked this brief? Forward it to that one friend who always misses the morning news.</p>
          <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${refLink}" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="50%" fillcolor="#E8C558" stroke="f"><center style="color:#07070F;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">Send to a friend →</center></v:roundrect><![endif]-->
          <!--[if !mso]><!-- -->
          <a href="${refLink}" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#07070F;background-color:#E8C558;border-radius:24px;padding:13px 30px;text-decoration:none;">Send to a friend &nbsp;&rarr;</a>
          <!--<![endif]-->
          ${sub.referral_code ? `<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7C7C8A;">Your referral link:&nbsp; <span style="color:#B8902A;">ayushbrief.online/r/${esc(sub.referral_code)}</span></p>` : ''}
        </td></tr>
      </table>
    </td></tr>

    <!-- footer -->
    <tr><td align="center" style="padding:30px 32px 6px;">
      <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#9A9AA8;">Was this forwarded to you? Get your own daily brief → <a href="https://ayushbrief.online" style="color:#E8C558;text-decoration:none;font-weight:bold;">Subscribe</a></p>
      <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#9A9AA8;">
        <a href="https://x.com/" style="color:#9A9AA8;text-decoration:none;">X</a> &nbsp;&middot;&nbsp;
        <a href="https://instagram.com/" style="color:#9A9AA8;text-decoration:none;">Instagram</a> &nbsp;&middot;&nbsp;
        <a href="https://linkedin.com/" style="color:#9A9AA8;text-decoration:none;">LinkedIn</a>
      </p>
      <div style="width:40px;height:1px;background-color:#2A2A3A;margin:0 auto 16px;line-height:0;font-size:0;">&nbsp;</div>
      <p style="margin:0 0 6px;font-family:Georgia,serif;font-style:italic;font-size:13px;color:#7C7C8A;">The Dawn Brief — news that feels like a friend</p>
      <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#5A5A68;">Kaithal, Haryana, India</p>
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#5A5A68;">
        <a href="${unsub}" style="color:#7C7C8A;text-decoration:underline;">Unsubscribe</a> &nbsp;&middot;&nbsp;
        <a href="https://ayushbrief.online/privacy.html" style="color:#7C7C8A;text-decoration:underline;">Privacy</a>
      </p>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}

module.exports = { generateEmailHTML };
