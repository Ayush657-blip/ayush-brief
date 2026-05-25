function generateEmailHTML(stories, date, subscriber) {

  const { name, role } = subscriber;

  // ── VOICE CONFIG ────────────────────────────────────────────────────────────
  const VOICE_CONFIG = {
    'student': {
      label: '🎓 Student',
      color: '#FF4D6D',
      bg: '#FFF0F3',
      textColor: '#1A0008'
    },
    'employee': {
      label: '💼 Employee',
      color: '#FFAA55',
      bg: '#FFF8EE',
      textColor: '#1A0E00'
    },
    'agent': {
      label: '🌾 Commission Agent',
      color: '#E8C558',
      bg: '#FFFBEE',
      textColor: '#1A1208'
    }
  };

  // ── GET VOICE KEY ───────────────────────────────────────────────────────────
  function getVoiceKey(role) {
    if (role === 'student' || role === 'employee' || role === 'agent') return role;
    if (role && role.includes('student')) return 'student';
    if (role && role.includes('employee')) return 'employee';
    if (role === 'agent') return 'agent';
    return 'student';
  }

  const voiceKey = getVoiceKey(role);
  const voice = VOICE_CONFIG[voiceKey];
  const firstName = ((name || 'friend').split(' ')[0].charAt(0).toUpperCase() + (name || 'friend').split(' ')[0].slice(1));
  const topStories = (stories || []).slice(0, 6);

  // ── GREETINGS ───────────────────────────────────────────────────────────────
  const greetings = {
    'student':  `Yaar ${firstName}, aaj ki brief aa gayi. 7 minute mein poori duniya. Chai bana aur padh. ☀`,
    'employee': `${firstName} bhai, chai le aur yeh padh — aaj ki brief ready hai. Office se pehle ek baar zaroor dekh. ☕`,
    'agent':    `${firstName} bhai, aaj ki zaroori khabrein aa gayi hain — mandi ke kaam ki. Seedhi baat, koi bakwaas nahi. 🌾`
  };

  const greeting = greetings[voiceKey] || `Good morning ${firstName}!`;

  // ── STORY CARDS ─────────────────────────────────────────────────────────────
  const storyCards = topStories.map((s, i) => {
    const voiceText = (s.voices && s.voices[voiceKey]) ? s.voices[voiceKey] : (s.headline || '');
    const num = String(i + 1).padStart(2, '0');

    return `
    <tr>
      <td style="padding:0 0 14px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="background:#0C0C18;border-radius:14px;border:.5px solid rgba(255,255,255,.07);overflow:hidden;">

          <!-- Top gradient bar -->
          <tr>
            <td style="height:2px;background:linear-gradient(90deg,#2979FF,#00B4FF,#5CC8FF);"></td>
          </tr>

          <tr>
            <td style="padding:20px 24px;">

              <!-- Story number + category -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
                <tr>
                  <td>
                    <span style="font-family:'Courier New',monospace;font-size:9px;color:rgba(255,255,255,.2);margin-right:10px;">${num}</span>
                    <span style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:rgba(92,200,255,.55);font-weight:600;">${s.category || ''}</span>
                  </td>
                </tr>
              </table>

              <!-- Headline -->
              <h3 style="margin:0 0 14px;font-family:Georgia,serif;font-size:15px;font-weight:bold;color:rgba(255,255,255,.9);line-height:1.45;">${s.headline || ''}</h3>

              <!-- Voice bubble -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background:${voice.bg};border-radius:10px;border-left:3px solid ${voice.color};">
                <tr>
                  <td style="padding:13px 16px;">
                    <p style="margin:0 0 6px;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:${voice.color};font-weight:700;">${voice.label}</p>
                    <p style="margin:0;font-size:13.5px;color:${voice.textColor};line-height:1.75;font-family:Arial,sans-serif;">${voiceText}</p>
                  </td>
                </tr>
              </table>

              <!-- Read more -->
              <p style="margin:12px 0 0;">
                <a href="${s.link || 'https://ayushbrief.online'}" style="color:#5CC8FF;font-size:12px;font-weight:600;text-decoration:none;letter-spacing:.02em;">Read full story →</a>
              </p>

            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }).join('');

  // ── FULL EMAIL HTML ─────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>The Dawn Brief</title>
</head>
<body style="margin:0;padding:0;background:#07070F;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#07070F;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- TOP GLOW LINE -->
          <tr>
            <td style="height:1.5px;background:linear-gradient(90deg,transparent 0%,rgba(92,200,255,.3) 20%,#5CC8FF 40%,#fff 50%,#5CC8FF 60%,rgba(92,200,255,.3) 80%,transparent 100%);"></td>
          </tr>

          <!-- HEADER -->
          <tr>
            <td style="background:#07070F;border-radius:16px 16px 0 0;padding:32px 36px 24px;text-align:center;border:.5px solid rgba(255,255,255,.06);border-top:none;">

              <p style="margin:0 0 8px;font-family:'Courier New',monospace;font-size:9px;letter-spacing:4px;text-transform:uppercase;color:rgba(92,200,255,.5);">Daily Intelligence · India</p>

              <!-- Logo -->
              <h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:32px;font-weight:900;letter-spacing:-.5px;">
                <span style="color:#E8C558;">☀</span>
                <span style="color:#E8C558;"> The Dawn Brief</span>
              </h1>

              <p style="margin:0 0 16px;font-size:12px;color:rgba(255,255,255,.3);font-family:'Courier New',monospace;letter-spacing:.1em;">${date}</p>

              <!-- Voice badge -->
              <span style="display:inline-block;background:rgba(41,121,255,.12);border:.5px solid rgba(92,200,255,.3);border-radius:100px;padding:6px 18px;font-size:12px;color:#5CC8FF;letter-spacing:.04em;">${voice.label} Edition</span>

            </td>
          </tr>

          <!-- GREETING BAR -->
          <tr>
            <td style="background:#0C0C18;padding:18px 36px;border-left:.5px solid rgba(255,255,255,.06);border-right:.5px solid rgba(255,255,255,.06);">
              <p style="margin:0;font-size:14px;color:rgba(255,255,255,.75);line-height:1.7;font-family:Arial,sans-serif;">${greeting}</p>
            </td>
          </tr>

          <!-- DIVIDER -->
          <tr>
            <td style="height:.5px;background:rgba(255,255,255,.06);"></td>
          </tr>

          <!-- STORIES -->
          <tr>
            <td style="background:#07070F;padding:20px 36px;border:.5px solid rgba(255,255,255,.06);border-top:none;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${storyCards}
              </table>
            </td>
          </tr>

          <!-- DIVIDER -->
          <tr>
            <td style="height:.5px;background:rgba(255,255,255,.06);"></td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="background:#0C0C18;padding:24px 36px;text-align:center;border-left:.5px solid rgba(255,255,255,.06);border-right:.5px solid rgba(255,255,255,.06);">
              <p style="margin:0 0 14px;font-size:13px;color:rgba(255,255,255,.4);font-family:Arial,sans-serif;">Aur voices dekhne ke liye website visit karo</p>
              <a href="https://ayushbrief.online" style="display:inline-block;background:#2979FF;color:#fff;font-family:Arial,sans-serif;font-size:13px;font-weight:600;padding:12px 32px;border-radius:100px;text-decoration:none;letter-spacing:.03em;">Visit ayushbrief.online →</a>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#07070F;border-radius:0 0 16px 16px;padding:20px 36px;text-align:center;border:.5px solid rgba(255,255,255,.06);border-top:none;">

              <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:14px;color:#E8C558;">☀ The Dawn Brief</p>
              <p style="margin:0 0 12px;font-size:11px;color:rgba(255,255,255,.2);font-family:Arial,sans-serif;">Built by Ayush Bansal · Kaithal, Haryana</p>

              <p style="margin:0;font-size:11px;color:rgba(255,255,255,.2);font-family:Arial,sans-serif;">
                <a href="https://ayushbrief.online" style="color:#5CC8FF;text-decoration:none;">ayushbrief.online</a>
                &nbsp;&nbsp;·&nbsp;&nbsp;
                <a href="https://ayushbrief.online/unsubscribe" style="color:rgba(255,255,255,.2);text-decoration:none;">Unsubscribe</a>
              </p>

            </td>
          </tr>

          <!-- BOTTOM GLOW LINE -->
          <tr>
            <td style="height:1px;background:linear-gradient(90deg,transparent,rgba(92,200,255,.15),transparent);"></td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

module.exports = { generateEmailHTML };
