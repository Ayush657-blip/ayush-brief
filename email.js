function generateEmailHTML(sections, totalStories, dashboardUrl) {
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Asia/Kolkata"
  });

  const DASHBOARD_URL = dashboardUrl || "https://ayushbrief.online";

  const categoryConfig = {
    "AI & Technology": { color: "#3b7dd8", label: "AI & TECH" },
    "World News":      { color: "#4caf7d", label: "WORLD" },
    "Healthcare":      { color: "#e07b39", label: "HEALTH" },
    "India Business":  { color: "#9b59b6", label: "INDIA" }
  };

  const tocTags = sections.map(s => {
    const cfg = categoryConfig[s.category] || { color: "#888", label: s.category };
    return `<span style="display:inline-block;background:${cfg.color};color:#fff;font-family:'Courier New',monospace;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;padding:4px 10px;margin-right:6px;font-weight:600;">${cfg.label}</span>`;
  }).join("");

  let storyCounter = 0;
  const sectionHTML = sections.map(section => {
    if (!section.articles || section.articles.length === 0) return "";
    const cfg = categoryConfig[section.category] || { color: "#888" };

    const stories = section.articles.slice(0, 3).map(article => {
      storyCounter++;
      const num = String(storyCounter).padStart(2, "0");
      const pubTime = article.pubDate ? (() => {
        try { return new Date(article.pubDate).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST"; }
        catch { return "Today"; }
      })() : "Today";

      return `
      <tr>
        <td style="padding:14px 40px;border-bottom:1px solid rgba(226,221,212,0.5);background:#faf8f3;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="26" style="vertical-align:top;padding-top:3px;">
                <span style="font-family:'Courier New',monospace;font-size:10px;color:#ccc;">${num}</span>
              </td>
              <td style="vertical-align:top;">
                <p style="margin:0 0 6px 0;font-family:Georgia,serif;font-size:14px;font-weight:bold;color:#0f0e0c;line-height:1.35;">${article.title || ""}</p>
                <p style="margin:0 0 7px 0;font-size:12.5px;color:#5a5248;line-height:1.6;font-family:Arial,sans-serif;">${article.summary || article.description || ""}</p>
                <span style="font-size:11px;color:#c8392b;font-weight:600;font-family:Arial,sans-serif;">-> ${article.why || "Stay informed"}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    }).join("");

    return `
    <tr>
      <td style="padding:0;background:#fdfcf9;border-top:3px solid ${cfg.color};border-bottom:1px solid #e2ddd4;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:13px 40px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:10px;vertical-align:middle;">
                    <div style="width:8px;height:8px;border-radius:50%;background:${cfg.color};display:inline-block;"></div>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-family:Georgia,serif;font-size:16px;font-weight:bold;color:#0f0e0c;">${section.category}</span>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <span style="font-family:'Courier New',monospace;font-size:9px;color:#bbb;text-transform:uppercase;">${section.articles.length} stories</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${stories}`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>The Dawn Brief</title>
</head>
<body style="margin:0;padding:30px 16px;background:#e8e3d8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center">
      <table width="620" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f3;box-shadow:0 8px 40px rgba(0,0,0,0.12);max-width:620px;width:100%;">

        <!-- DARK HEADER -->
        <tr>
          <td style="background:#0f0e0c;padding:36px 40px 28px;border-top:3px solid #c9a84c;">
            <p style="margin:0 0 10px 0;font-family:'Courier New',monospace;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#c9a84c;">MORNING INTELLIGENCE</p>
            <h1 style="margin:0;font-family:Georgia,serif;font-size:48px;font-weight:bold;color:#fff;line-height:1;letter-spacing:-1px;">The Dawn<br><span style="color:#c9a84c;">Brief.</span></h1>
            <p style="margin:8px 0 24px 0;font-family:'Courier New',monospace;font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:0.15em;text-transform:uppercase;">YOUR WORLD, SUMMARISED BY AI</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);">
                  <span style="font-family:'Courier New',monospace;font-size:10px;color:rgba(255,255,255,0.4);">${today} · 06:00 IST</span>
                </td>
                <td align="right" style="padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);">
                  <span style="background:#c9a84c;color:#0f0e0c;font-family:'Courier New',monospace;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;padding:5px 12px;font-weight:bold;">${totalStories} STORIES</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- TOC BAR -->
        <tr>
          <td style="background:#f5f0e8;border-bottom:1px solid #e2ddd4;padding:10px 40px;">
            ${tocTags}
            <span style="font-size:11px;color:#999;font-family:Arial,sans-serif;">5 stories each</span>
          </td>
        </tr>

        <!-- INTRO -->
        <tr>
          <td style="padding:22px 40px;border-bottom:1px solid #e2ddd4;background:#faf8f3;">
            <p style="margin:0;font-size:13.5px;line-height:1.7;color:#4a4540;font-family:Arial,sans-serif;">
              Good morning, <strong style="color:#0f0e0c;">Ayush.</strong> Here's everything that moved the world while you slept —
              filtered to the <strong style="color:#0f0e0c;">${totalStories} stories</strong> that actually matter.
              Open your dashboard for the full experience with drill-down on every story.
            </p>
          </td>
        </tr>

        <!-- STATS -->
        <tr>
          <td style="border-bottom:1px solid #e2ddd4;background:#faf8f3;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="33%" style="padding:14px 0;text-align:center;border-right:1px solid #e2ddd4;">
                  <p style="margin:0;font-family:Georgia,serif;font-size:26px;font-weight:bold;color:#0f0e0c;">${totalStories}</p>
                  <p style="margin:3px 0 0 0;font-family:'Courier New',monospace;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:0.15em;">Stories</p>
                </td>
                <td width="33%" style="padding:14px 0;text-align:center;border-right:1px solid #e2ddd4;">
                  <p style="margin:0;font-family:Georgia,serif;font-size:26px;font-weight:bold;color:#0f0e0c;">4</p>
                  <p style="margin:3px 0 0 0;font-family:'Courier New',monospace;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:0.15em;">Categories</p>
                </td>
                <td width="33%" style="padding:14px 0;text-align:center;">
                  <p style="margin:0;font-family:Georgia,serif;font-size:26px;font-weight:bold;color:#0f0e0c;">8 min</p>
                  <p style="margin:3px 0 0 0;font-family:'Courier New',monospace;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:0.15em;">Read time</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- OPEN DASHBOARD CTA -->
        <tr>
          <td style="background:#0f0e0c;padding:24px 40px;text-align:center;">
            <p style="margin:0 0 14px 0;font-size:13px;color:rgba(255,255,255,0.5);font-family:Arial,sans-serif;">Open your intelligence dashboard for the full experience</p>
            <a href="${DASHBOARD_URL}" style="display:inline-block;background:#c9a84c;color:#0f0e0c;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;padding:14px 40px;font-weight:bold;text-decoration:none;">OPEN DASHBOARD -></a>
          </td>
        </tr>

        <!-- STORIES -->
        ${sectionHTML}

        <!-- FOOTER -->
        <tr>
          <td style="padding:20px 40px;background:#f5f0e8;border-top:1px solid #e2ddd4;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <p style="margin:0;font-family:Georgia,serif;font-size:14px;font-weight:bold;color:#0f0e0c;">The Dawn Brief.</p>
                  <table cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">
                    <tr>
                      <td style="padding-right:6px;"><span style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:0.1em;text-transform:uppercase;padding:3px 8px;border:1px solid #e2ddd4;color:#999;">Groq AI</span></td>
                      <td style="padding-right:6px;"><span style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:0.1em;text-transform:uppercase;padding:3px 8px;border:1px solid #e2ddd4;color:#999;">Resend</span></td>
                      <td><span style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:0.1em;text-transform:uppercase;padding:3px 8px;border:1px solid #e2ddd4;color:#999;">ayushbrief.online</span></td>
                    </tr>
                  </table>
                </td>
                <td align="right" style="vertical-align:top;">
                  <p style="margin:0;font-family:'Courier New',monospace;font-size:9px;color:#bbb;line-height:1.8;text-align:right;">Auto-generated · 06:00 IST Daily<br>Built by Ayush Bansal</p>
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
</html>`;
}

module.exports = { generateEmailHTML };
