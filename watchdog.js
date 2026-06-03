// ============================================================================
//  watchdog.js — The Dawn Brief daily health check + alert
//  Runs on its OWN GitHub Actions schedule (independent of the news cron),
//  so it ALSO catches "the news cron never ran". No Claude calls → ₹0 cost.
//
//  Checks:
//   1. Supabase reachable
//   2. A FRESH edition exists (latest run_date is today/yesterday UTC)
//   3. Enough stories were saved (not an empty/failed cron)
//   4. Whether previous-day fallback was used
//   5. After 7 AM IST: whether an edition was actually published (approved)
//   6. Backend /health endpoint is up
//  On ANY problem → emails you via Resend. On success → silent (unless HEARTBEAT=1).
//
//  Env (GitHub Actions secrets): SUPABASE_KEY, RESEND_API_KEY, MY_EMAIL
//  Optional: BACKEND_HEALTH_URL, MIN_STORIES, HEARTBEAT, ALERT_FROM
// ============================================================================

const SUPA_URL = 'https://ygkviidhuqicfnvyuiiu.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_TO = process.env.MY_EMAIL;
const ALERT_FROM = process.env.ALERT_FROM || 'Dawn Brief Watchdog <newsletter@ayushbrief.online>';
const BACKEND_HEALTH = process.env.BACKEND_HEALTH_URL || 'https://api.ayushbrief.online/health';
const MIN_STORIES = parseInt(process.env.MIN_STORIES || '5', 10);

const VALID_CATEGORIES = [
  'Business', 'Indian Economy', 'Finance', 'Tech', 'Sports', 'Government',
  'International', 'Climate', 'Startups & Auto', 'Science & Health', 'Entertainment'
];

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function utcDate(d) { return d.toISOString().split('T')[0]; }
function istHour() {
  // current hour in IST
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return ist.getHours();
}
function istStamp() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
}

async function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    return r;
  } finally {
    clearTimeout(t);
  }
}

async function supa(path) {
  try {
    const r = await fetchWithTimeout(`${SUPA_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
    });
    if (!r.ok) return { ok: false, status: r.status, body: await r.text().catch(() => '') };
    return { ok: true, data: await r.json() };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : (e.message || 'error') };
  }
}

async function checkBackend() {
  try {
    const r = await fetchWithTimeout(BACKEND_HEALTH, {});
    let j = null; try { j = await r.json(); } catch (_) {}
    return { ok: r.ok, status: r.status, detail: j };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : (e.message || 'error') };
  }
}

async function sendAlert(subject, html) {
  if (!RESEND_API_KEY || !ALERT_TO) {
    console.error('⚠️ Cannot send alert — RESEND_API_KEY or MY_EMAIL missing in env.');
    return;
  }
  try {
    const r = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: ALERT_FROM, to: [ALERT_TO], subject, html })
    });
    console.log('Alert email →', r.status);
  } catch (e) {
    console.error('Alert email failed:', e.message);
  }
}

(async () => {
  const problems = [];
  const info = [];

  if (!SUPA_KEY) problems.push('SUPABASE_KEY missing in watchdog environment.');

  // ── latest edition ──────────────────────────────────────────────────────
  const latest = await supa('daily_stories?select=run_date&order=run_date.desc&limit=1');
  let latestDate = null;

  if (!latest.ok) {
    problems.push(`Supabase query failed (${latest.status || latest.error}) — DB unreachable or key invalid.`);
  } else if (!latest.data.length) {
    problems.push('daily_stories table is EMPTY — the news cron may have never run.');
  } else {
    latestDate = latest.data[0].run_date;
    const today = utcDate(new Date());
    const yObj = new Date(); yObj.setUTCDate(yObj.getUTCDate() - 1);
    const yesterday = utcDate(yObj);
    info.push(`Latest edition run_date: ${latestDate} (today UTC: ${today})`);

    if (latestDate < yesterday) {
      problems.push(`STALE DATA: newest stories are from ${latestDate}. The cron likely failed for 1+ days — no fresh edition.`);
    }

    // ── analyse that edition ────────────────────────────────────────────────
    const rowsR = await supa(`daily_stories?run_date=eq.${latestDate}&select=category,status,is_previous_day`);
    if (!rowsR.ok) {
      problems.push(`Could not read stories for ${latestDate} (${rowsR.status || rowsR.error}).`);
    } else {
      const rows = rowsR.data;
      const total = rows.length;
      const approved = rows.filter(r => r.status === 'approved').length;
      const prevDay = rows.filter(r => r.is_previous_day === true).length;
      const cats = {}; VALID_CATEGORIES.forEach(c => cats[c] = 0);
      rows.forEach(r => { if (cats[r.category] != null) cats[r.category]++; });
      const emptyCats = Object.keys(cats).filter(c => cats[c] === 0);

      info.push(`Stories on ${latestDate}: ${total} total · ${approved} approved · ${prevDay} previous-day`);
      info.push(`Empty categories: ${emptyCats.length ? emptyCats.join(', ') : 'none'}`);

      if (total < MIN_STORIES) {
        problems.push(`LOW STORY COUNT: only ${total} stories saved for ${latestDate} (expected at least ${MIN_STORIES}). Cron probably failed mid-run.`);
      }
      if (prevDay > 0) {
        problems.push(`FALLBACK IN USE: ${prevDay} story(ies) for ${latestDate} are previous-day reruns — some category fetches failed.`);
      }
      // published check — only meaningful after the morning curation/fallback window
      if (istHour() >= 7 && approved === 0) {
        problems.push(`NO EDITION PUBLISHED: it is past 7 AM IST but 0 approved stories for ${latestDate}. Curation + auto-fallback may have both failed.`);
      }
    }
  }

  // ── backend health ────────────────────────────────────────────────────────
  const be = await checkBackend();
  info.push(`Backend /health: ${be.ok ? 'OK' : 'DOWN'}${be.status ? ' [' + be.status + ']' : ''}${be.error ? ' ' + be.error : ''}`);
  if (!be.ok) {
    problems.push(`BACKEND DOWN: ${BACKEND_HEALTH} is not healthy (${be.status || be.error}).`);
  } else if (be.detail && be.detail.status === 'degraded') {
    problems.push(`BACKEND DEGRADED: /health reports degraded — ${JSON.stringify(be.detail.checks)}`);
  }

  // ── report ──────────────────────────────────────────────────────────────
  const stamp = istStamp();
  if (problems.length) {
    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;">
        <h2 style="color:#B00020;margin:0 0 4px;">⚠️ Dawn Brief — ${problems.length} issue(s) detected</h2>
        <p style="color:#666;margin:0 0 16px;">${esc(stamp)}</p>
        <ul style="margin:0 0 18px;padding-left:20px;">
          ${problems.map(p => `<li style="margin-bottom:8px;"><strong>${esc(p)}</strong></li>`).join('')}
        </ul>
        <p style="color:#666;margin:0 0 6px;font-weight:bold;">Snapshot:</p>
        <ul style="margin:0 0 18px;padding-left:20px;color:#333;">
          ${info.map(i => `<li>${esc(i)}</li>`).join('')}
        </ul>
        <p style="color:#999;font-size:12px;">Automated check. No edition changes were made — this is a heads-up so you can act.</p>
      </div>`;
    await sendAlert(`⚠️ Dawn Brief: ${problems.length} issue(s) — ${stamp}`, html);
    console.log('PROBLEMS DETECTED:\n - ' + problems.join('\n - '));
    console.log('INFO:\n - ' + info.join('\n - '));
    process.exitCode = 1;
  } else {
    console.log('✅ All healthy at ' + stamp + '\n - ' + info.join('\n - '));
    if (process.env.HEARTBEAT === '1') {
      await sendAlert(`✅ Dawn Brief healthy — ${stamp}`,
        `<div style="font-family:Arial,sans-serif;font-size:14px;"><h2 style="color:#1a7f37;">✅ All systems healthy</h2><p style="color:#666;">${esc(stamp)}</p><ul>${info.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`);
    }
  }
})();
