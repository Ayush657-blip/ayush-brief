function generateEmailHTML(sections, totalStories) {
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Asia/Kolkata"
  });

  const categoryColors = {
    "AI & Technology": { bg: "#1a3a5c", dot: "#3b7dd8", label: "AI & Tech" },
    "World News": { bg: "#1e3a1e", dot: "#4caf7d", label: "World" },
    "FMCG & Consumer": { bg: "#3a1a0a", dot: "#e07b39", label: "FMCG" },
    "India Business": { bg: "#2a1a3a", dot: "#9b59b6", label: "India" }
  };

  const categorySections = sections.map((section, sectionIndex) => {
    const colors = categoryColors[section.category] || { bg: "#1a1a1a", dot: "#888", label: section.category };

    if (section.articles.length === 0) return "";

    const stories = section.articles.map((article, i) => `
      <tr>
        <td style="padding: 16px 40px; border-bottom: 1px solid rgba(226,221,212,0.5);">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="28" style="vertical-align: top; padding-top: 2px;">
                <span style="font-family: 'Courier New', monospace; font-size: 10px; color: #bbb;">
                  ${String(sectionIndex * 5 + i + 1).padStart(2, "0")}
                </span>
              </td>
              <td style="vertical-align: top;">
                <p style="margin: 0 0 6px 0; font-family: Georgia, serif; font-size: 15px; font-weight: bold; color: #0f0e0c; line-height: 1.35;">
                  ${article.title}
                </p>
                <p style="margin: 0 0 8px 0; font-size: 13px; color: #5a5248; line-height: 1.6;">
                  ${article.summary || article.description || ""}
                </p>
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right: 12px;">
                      <span style="font-family: 'Courier New', monospace; font-size: 9px; color: #bbb; text-transform: uppercase; letter-spacing: 0.08em;">
                        ${article.pubDate ? new Date(article.pubDate).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST" : "Today"}
                      </span>
                    </td>
                    <td>
                      <span style="font-size: 11px; color: #c8392b; font-weight: 600;">
                        → ${article.why || ""}
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `).join("");

    return `
      <!-- Section Header -->
      <tr>
        <td style="padding: 0; background: #fdfcf9; border-top: 2px solid ${colors.dot}; border-bottom: 1px solid #e2ddd4;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding: 14px 40px;">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right: 10px; vertical-align: middle;">
                      <div style="width: 8px; height: 8px; border-radius: 50%; background: ${colors.dot};"></div>
                    </td>
                    <td style="vertical-align: middle;">
                      <span style="font-family: Georgia, serif; font-size: 17px; font-weight: bold; color: #0f0e0c;">
                        ${section.category}
                      </span>
                    </td>
                    <td style="padding-left: 16px; vertical-align: middle;">
                      <span style="font-family: 'Courier New', monospace; font-size: 9px; color: #bbb; text-transform: uppercase; letter-spacing: 0.1em;">
                        ${section.articles.length} stories
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      ${stories}
    `;
  }).join("");

  const tocTags = sections.map(s => {
    const colors = categoryColors[s.category] || { bg: "#333", label: s.category };
    return `<span style="display:inline-block; background:${colors.bg}; color:#fff; font-family:'Courier New',monospace; font-size:9px; letter-spacing:0.12em; text-transform:uppercase; padding:4px 10px; margin-right:6px;">${(categoryColors[s.category] || {}).label || s.category}</span>`;
  }).join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ayush's Brief</title>
</head>
<body style="margin:0; padding:40px 20px; background:#e8e3d8; font-family:Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#faf8f3; box-shadow:0 8px 60px rgba(0,0,0,0.12);">

        <!-- HEADER -->
        <tr>
          <td style="background:#0f0e0c; padding:36px 40px 28px; position:relative;">
            <p style="margin:0 0 10px 0; font-family:'Courier New',monospace; font-size:9px; letter-spacing:0.25em; text-transform:uppercase; color:#c9a84c;">
              Morning Intelligence
            </p>
            <h1 style="margin:0; font-family:Georgia,serif; font-size:48px; font-weight:bold; color:#fff; line-height:1; letter-spacing:-0.02em;">
              Ayush's<br><span style="color:#c9a84c;">Brief.</span>
            </h1>
            <p style="margin:8px 0 24px 0; font-size:11px; color:rgba(255,255,255,0.35); letter-spacing:0.15em; text-transform:uppercase;">
              Your World, Summarised by AI
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(255,255,255,0.08); padding-top:18px;">
              <tr>
                <td style="padding-top:18px;">
                  <span style="font-family:'Courier New',monospace; font-size:10px; color:rgba(255,255,255,0.4);">
                    ${today} · 06:00 IST
                  </span>
                </td>
                <td align="right" style="padding-top:18px;">
                  <span style="background:#c9a84c; color:#0f0e0c; font-family:'Courier New',monospace; font-size:9px; letter-spacing:0.15em; text-transform:uppercase; padding:5px 12px; font-weight:bold;">
                    ${totalStories} Stories
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- TOC -->
        <tr>
          <td style="background:#f5f0e8; border-bottom:1px solid #e2ddd4; padding:10px 40px;">
            ${tocTags}
            <span style="font-size:11px; color:#999; margin-left:8px;">5 stories each</span>
          </td>
        </tr>

        <!-- INTRO -->
        <tr>
          <td style="padding:24px 40px; border-bottom:1px solid #e2ddd4;">
            <p style="margin:0; font-size:13.5px; line-height:1.7; color:#4a4540;">
              Good morning, <strong style="color:#0f0e0c;">Ayush.</strong> Here's everything that moved the world while you slept —
              filtered to the <strong style="color:#0f0e0c;">${totalStories} stories</strong> that actually matter across AI, global events,
              consumer goods, and Indian markets. Estimated read: <strong style="color:#0f0e0c;">8 minutes.</strong>
            </p>
          </td>
        </tr>

        <!-- STATS -->
        <tr>
          <td style="border-bottom:1px solid #e2ddd4;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="33%" style="padding:14px 0; text-align:center; border-right:1px solid #e2ddd4;">
                  <p style="margin:0; font-family:Georgia,serif; font-size:24px; font-weight:bold; color:#0f0e0c;">${totalStories}</p>
                  <p style="margin:3px 0 0 0; font-family:'Courier New',monospace; font-size:9px; color:#999; text-transform:uppercase; letter-spacing:0.15em;">Stories</p>
                </td>
                <td width="33%" style="padding:14px 0; text-align:center; border-right:1px solid #e2ddd4;">
                  <p style="margin:0; font-family:Georgia,serif; font-size:24px; font-weight:bold; color:#0f0e0c;">4</p>
                  <p style="margin:3px 0 0 0; font-family:'Courier New',monospace; font-size:9px; color:#999; text-transform:uppercase; letter-spacing:0.15em;">Categories</p>
                </td>
                <td width="33%" style="padding:14px 0; text-align:center;">
                  <p style="margin:0; font-family:Georgia,serif; font-size:24px; font-weight:bold; color:#0f0e0c;">8 min</p>
                  <p style="margin:3px 0 0 0; font-family:'Courier New',monospace; font-size:9px; color:#999; text-transform:uppercase; letter-spacing:0.15em;">Read time</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- STORIES -->
        ${categorySections}

        <!-- FOOTER -->
        <tr>
          <td style="padding:20px 40px; background:#f5f0e8; border-top:1px solid #e2ddd4;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0; font-family:Georgia,serif; font-size:14px; font-weight:bold; color:#0f0e0c;">Ayush's Brief.</p>
                  <table cellpadding="0" cellspacing="0" style="margin-top:6px;">
                    <tr>
                      <td style="padding-right:6px;"><span style="font-family:'Courier New',monospace; font-size:8px; letter-spacing:0.1em; text-transform:uppercase; padding:3px 8px; border:1px solid #e2ddd4; color:#999;">Groq API</span></td>
                      <td style="padding-right:6px;"><span style="font-family:'Courier New',monospace; font-size:8px; letter-spacing:0.1em; text-transform:uppercase; padding:3px 8px; border:1px solid #e2ddd4; color:#999;">Resend</span></td>
                      <td><span style="font-family:'Courier New',monospace; font-size:8px; letter-spacing:0.1em; text-transform:uppercase; padding:3px 8px; border:1px solid #e2ddd4; color:#999;">Railway</span></td>
                    </tr>
                  </table>
                </td>
                <td align="right" style="vertical-align:top;">
                  <p style="margin:0; font-family:'Courier New',monospace; font-size:9px; color:#bbb; line-height:1.8; text-align:right;">
                    Auto-generated · 06:00 IST Daily<br>
                    Powered by RSS + AI
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>
  `;
}

module.exports = { generateEmailHTML };
