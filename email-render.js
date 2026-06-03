// ============================================================================
//  email-render.js — The Dawn Brief daily email (PRODUCTION render)
//  Pure JS string templating. No Claude calls. No cost.
//
//  Usage (from backend, e.g. on Submit & Publish):
//    const { renderDailyEmail } = require('./email-render');
//    const html = renderDailyEmail({
//      date:      'Wednesday · 3 June 2026 · 6:00 AM IST',
//      name:      'Ayush',                       // subscriber first name (optional)
//      stories: [                                // khatarnak stories (5–10)
//        { category:'Business · Travel',
//          headline:'IndiGo ne Manchester ki flight band kar di',
//          imageUrl:'https://....jpg',           // self-hosted Supabase URL (or null)
//          imageAlt:'IndiGo aircraft',
//          voiceText:'<info lines> ... Tere liye matlab: <punchline>',
//          storyId: 1 },
//        ...
//      ],
//      quickHits: [                              // optional "What else is happening"
//        { emoji:'🇮🇳', label:'GDP', text:'Q4 growth ~7.3% rehne ka anumaan.' }, ...
//      ],
//      poll: {                                   // optional
//        question:"Today's question — what's AI to you?",
//        options:[ {emoji:'🚀',label:'Superpower',href:'https://ayushbrief.online/?poll=superpower'}, ... ]
//      },
//      referralCode: 'ayush',                    // builds ayushbrief.online/r/<code>
//      unsubscribeUrl: 'https://ayushbrief.online/unsubscribe.html?e=...', // per-subscriber
//      previewText: 'Good morning — today's biggest stories...' // optional
//    });
//    // then: resend.emails.send({ html, ... })
// ============================================================================

// ── helpers ─────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Conservative auto-emphasis (run AFTER esc). Only clearly-bounded tokens, so
// it can never break HTML: rupee amounts, dollar amounts, percentages.
function emphasize(s) {
  return s
    .replace(/(₹\s?[\d,]+(?:\.\d+)?(?:\s?(?:crore|lakh|cr|k))?)/gi, '<strong style="color:#FFFFFF;">$1</strong>')
    .replace(/(\$\s?[\d,]+(?:\.\d+)?(?:\s?(?:billion|million|bn|mn))?)/gi, '<strong style="color:#FFFFFF;">$1</strong>')
    .replace(/(\b\d+(?:\.\d+)?%)/g, '<strong style="color:#FFFFFF;">$1</strong>');
}

// Split a block of text into 1–2 readable paragraphs on sentence boundaries.
function splitParas(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  let sentences;
  try {
    sentences = t.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  } catch (e) {
    sentences = null;
  }
  if (!sentences || sentences.length <= 2) return [t];
  const mid = Math.ceil(sentences.length / 2);
  return [sentences.slice(0, mid).join('').trim(), sentences.slice(mid).join('').trim()].filter(Boolean);
}

// Render the friend-voice: info paragraphs, then the gold "Tere liye matlab:" punchline.
function renderVoice(voiceText) {
  const raw = String(voiceText || '').trim();
  const P = 'margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.75;color:#D6D6E0;';
  const PLAST = 'margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.75;color:#D6D6E0;';

  // Split off the punchline (label is case-insensitive, tolerant of spacing)
  const parts = raw.split(/tere\s+liye\s+matlab\s*:/i);
  const infoPart = parts[0].trim();
  const punch = parts.length > 1 ? parts.slice(1).join(':').trim() : '';

  const infoParas = splitParas(infoPart);
  let html = infoParas
    .map(p => `<p style="${P}">${emphasize(esc(p))}</p>`)
    .join('\n          ');

  if (punch) {
    html += `\n          <p style="${PLAST}"><strong style="color:#E8C558;">Tere liye matlab:</strong> ${emphasize(esc(punch))}</p>`;
  } else if (infoParas.length) {
    // no explicit punchline — make the last info para use the larger bottom margin
    html = html.replace(new RegExp(P.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '">([^<]*)</p>\\s*$'),
      `${PLAST}">$1</p>`);
  }
  return html || `<p style="${PLAST}">&nbsp;</p>`;
}

// One story card (matches the premium dark+gold sample exactly).
function storyCard(story) {
  const id = encodeURIComponent(story.storyId != null ? story.storyId : '');
  const url = `https://ayushbrief.online/story.html?id=${id}`;
  const tag = esc(story.category || 'News');
  const headline = esc(story.headline || '');

  // image OR graceful gradient fallback
  let media;
  if (story.imageUrl) {
    media = `
        <tr><td style="padding:0 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0B0B14" style="background-color:#0B0B14;border-radius:12px;">
            <tr><td style="padding:0;line-height:0;font-size:0;">
              <a href="${url}" style="text-decoration:none;"><img src="${esc(story.imageUrl)}" width="532" alt="${esc(story.imageAlt || story.headline || 'Dawn Brief')}" style="width:100%;max-width:532px;height:auto;display:block;border-radius:12px;border:0;outline:none;" /></a>
            </td></tr>
          </table>
        </td></tr>`;
  } else {
    const label = esc((story.category || 'Dawn Brief').split('·')[0].trim());
    media = `
        <tr><td style="padding:0 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0B0B14" style="background-color:#0B0B14;background-image:radial-gradient(circle at 28% 28%, rgba(232,197,88,.16), transparent 60%);border-radius:12px;">
            <tr><td align="center" height="150" style="height:150px;font-family:Georgia,serif;font-style:italic;font-size:22px;color:rgba(255,255,255,.30);">${label}</td></tr>
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
          ${renderVoice(story.voiceText)}
          <a href="${url}" style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;font-weight:bold;color:#E8C558;text-decoration:none;">Pura padho &nbsp;&rarr;</a>
        </td></tr>
      </table>
    </td></tr>`;
}

// ── main ─────────────────────────────────────────────────────────────────────
function renderDailyEmail(data) {
  data = data || {};
  const stories = Array.isArray(data.stories) ? data.stories : [];
  const name = (data.name || '').trim();
  const greetName = name ? `Good morning, ${esc(name)} ☀️` : 'Good morning, friend ☀️';
  const dateStrip = esc(data.date || '');
  const refCode = encodeURIComponent(data.referralCode || '');
  const refLink = `https://ayushbrief.online/r/${refCode}`;
  const unsub = esc(data.unsubscribeUrl || 'https://ayushbrief.online/unsubscribe.html');
  const preview = esc(data.previewText || `Good morning — aaj ki ${stories.length} sabse badi khabrein, dost ke andaaz mein.`);
  const countWord = stories.length ? `<strong style="color:#FFFFFF;">${stories.length} biggest stories</strong>` : 'today\'s biggest stories';

  // teasers = first 3 headlines
  const teasers = stories.slice(0, 3).map(s =>
    `<tr><td valign="top" width="18" style="font-family:Arial,sans-serif;font-size:15px;color:#E8C558;line-height:1.7;">&rsaquo;</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.7;color:#C8C8D4;">${esc(s.headline || '')}</td></tr>`
  ).join('\n        ');

  const cards = stories.map(storyCard).join('\n');

  // quick hits (optional)
  let quickHits = '';
  if (Array.isArray(data.quickHits) && data.quickHits.length) {
    const items = data.quickHits.map((q, i) => {
      const last = i === data.quickHits.length - 1;
      return `<p style="margin:0 0 ${last ? '0' : '13px'};font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.7;color:#C8C8D4;"><strong style="color:#fff;">${esc(q.emoji || '')} ${esc(q.label || '')}:</strong> ${emphasize(esc(q.text || ''))}</p>`;
    }).join('\n          ');
    quickHits = `
    <tr><td style="padding:26px 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="px" style="padding:0 22px 14px;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#E8C558;font-weight:bold;">What else is happening</p>
        </td></tr>
        <tr><td class="px" style="padding:0 22px;">
          ${items}
        </td></tr>
      </table>
    </td></tr>`;
  }

  // poll (optional)
  let poll = '';
  if (data.poll && Array.isArray(data.poll.options) && data.poll.options.length) {
    const opts = data.poll.options.map(o =>
      `<td style="padding:0 4px;"><a href="${esc(o.href || '#')}" style="display:inline-block;font-family:Arial,sans-serif;font-size:13px;color:#ECECF2;background-color:#15151F;border:1px solid #2A2A3A;border-radius:22px;padding:9px 16px;text-decoration:none;">${esc(o.emoji || '')} ${esc(o.label || '')}</a></td>`
    ).join('');
    poll = `
    <tr><td style="padding:24px 32px 6px;"><div style="height:1px;background-color:#1C1C2A;line-height:0;font-size:0;">&nbsp;</div></td></tr>
    <tr><td class="px" style="padding:16px 32px 6px;" align="center">
      <p style="margin:0 0 14px;font-family:Georgia,serif;font-style:italic;font-size:19px;color:#FFFFFF;">${esc(data.poll.question || '')}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>${opts}</tr></table>
    </td></tr>`;
  }

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
<!--[if mso]>
<style>body,table,td,p,a,span,h1,h2{font-family:Georgia,'Times New Roman',serif;}</style>
<![endif]-->
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

<!-- preview text -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:#07070F;font-size:1px;line-height:1px;">
  ${preview}
  &#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#07070F" class="bg" style="background-color:#07070F;">
<tr><td align="center" style="padding:24px 12px 40px;">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px;max-width:600px;">

    <!-- header strip -->
    <tr><td class="px" style="padding:0 32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td class="stack" align="left" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7C7C8A;">${dateStrip}</td>
        <td class="stack stack-r" align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.06em;color:#7C7C8A;">
          <a href="https://ayushbrief.online" style="color:#B8902A;text-decoration:none;">View online</a>
          &nbsp;&middot;&nbsp;
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

    <!-- in today's brief -->
    <tr><td class="px" style="padding:18px 32px 8px;">
      <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#5CC8FF;font-weight:bold;">In today's brief</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${teasers}
      </table>
    </td></tr>

    <tr><td style="padding:14px 32px 4px;"><div style="height:1px;background-color:#1C1C2A;line-height:0;font-size:0;">&nbsp;</div></td></tr>

    <!-- story cards -->
${cards}
${quickHits}
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
          <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7C7C8A;">Your referral link:&nbsp; <span style="color:#B8902A;">ayushbrief.online/r/${esc(data.referralCode || '')}</span></p>
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

module.exports = { renderDailyEmail };
