// ═══════════════════════════════════════════════════════════════════
// IMAGE SOURCING  —  The Dawn Brief   (real photos, no AI generation)
// ───────────────────────────────────────────────────────────────────
// Morning-Brew model: real, concept-relevant, branded photos.
//
// Per story:
//   1. Claude reads summary → decides type (company/person vs concept)
//      and builds a smart, India-aware search keyword.
//   2. Fetch a real photo:
//        company/person  → Wikimedia Commons (exact: logo/building/face)
//        concept/general  → Pexels  (relevant real photo)
//        any failure      → Pixabay (optional, if PIXABAY_KEY set)
//        still nothing    → caller falls back to category image bank
//   3. Apply Dawn Brief treatment (dark gradient + gold + headline + logo
//      + tiny attribution) and save to Supabase Storage.
//
// NEVER throws. Best-effort. Publish never breaks.
// ═══════════════════════════════════════════════════════════════════

const sharp = require('sharp');

const SUPA_URL = 'https://ygkviidhuqicfnvyuiiu.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
const PEXELS_KEY = process.env.PEXELS_KEY;
const PIXABAY_KEY = process.env.PIXABAY_KEY; // optional
const IMG_BUCKET = 'story-images';

// ── Claude text call ─────────────────────────────────────────────────
async function callClaude(prompt, maxTokens = 200) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) {
    let d = ''; try { const e = await res.json(); d = (e && e.error && e.error.message) || JSON.stringify(e); } catch (x) {}
    throw new Error(('Claude ' + res.status + ': ' + d).slice(0, 300));
  }
  const data = await res.json();
  return (data.content[0].text || '').trim();
}

// ── Step 1: Claude decides source + keyword ──────────────────────────
// Returns { kind: 'wikimedia'|'pexels', query: '...' }
async function decideImageQuery(headline, category, summary) {
  const prompt =
'You are a photo editor for an Indian news brief. For the news below, decide what real photo to use.\n\n' +
'Output STRICT JSON only, no preamble:\n' +
'{"kind":"wikimedia"|"pexels","query":"search words"}\n\n' +
'RULES:\n' +
'- Use "wikimedia" ONLY when the story centers on a SPECIFIC named company, brand, well-known person, or famous institution/place that likely has an official photo (e.g. Tata Power, Reliance, RBI, SEBI, a named politician, a famous building). query = the exact name (e.g. "Tata Power", "Reserve Bank of India").\n' +
'- Use "pexels" for everything conceptual/general (economy, inflation, jobs, markets, weather, tech, sports, health). \n' +
'- For pexels queries, turn abstract ideas into a CONCRETE, real, INDIAN scene that a photographer could shoot. Never use abstract words like "inflation" or "economy" alone. Examples:\n' +
'    inflation -> "indian vegetable market vendor"\n' +
'    economy growth -> "indian factory workers"\n' +
'    job market -> "indian office interview"\n' +
'    stock market -> "stock market trading screen"\n' +
'    monsoon -> "mumbai monsoon rain street"\n' +
'- Keep query 2-5 words. Prefer adding "india"/"indian" for local feel where natural.\n' +
'- Never request text, logos, or specific faces in a pexels query.\n\n' +
'NEWS:\nHeadline: ' + headline + '\nCategory: ' + category + '\nDetail: ' + (summary || '').slice(0, 350);

  const raw = await callClaude(prompt, 120);
  // tolerant JSON parse
  let cleaned = raw.replace(/```json|```/g, '').trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) cleaned = m[0];
  let obj;
  try { obj = JSON.parse(cleaned); } catch (e) { obj = null; }
  if (!obj || !obj.query) {
    // safe fallback: treat as concept using category
    return { kind: 'pexels', query: (category || 'india news') + ' india' };
  }
  const kind = obj.kind === 'wikimedia' ? 'wikimedia' : 'pexels';
  return { kind, query: String(obj.query).slice(0, 80) };
}

// ── Source A: Wikimedia Commons ──────────────────────────────────────
// Returns { url, attribution } or null
async function fromWikimedia(query) {
  try {
    const api = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
      '&gsrnamespace=6&gsrsearch=' + encodeURIComponent(query) +
      '&gsrlimit=12&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200&format=json&origin=*';
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(api, { signal: controller.signal, headers: { 'User-Agent': 'TheDawnBrief/1.0 (newsletter; contact@ayushbrief.online)' } });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data && data.query && data.query.pages;
    if (!pages) return null;

    // pick the first usable photo (jpg/png/webp, wide enough, not an icon/svg/map)
    const candidates = Object.values(pages)
      .map(p => (p.imageinfo && p.imageinfo[0]) ? p.imageinfo[0] : null)
      .filter(Boolean);

    for (const ii of candidates) {
      const u = (ii.thumburl || ii.url || '').toLowerCase();
      if (!u) continue;
      if (/\.(svg|gif|tif|tiff|pdf|webm|ogv)(\?|$)/.test(u)) continue; // skip non-photo
      const width = ii.thumbwidth || ii.width || 0;
      if (width && width < 600) continue; // too small
      // attribution
      let artist = '';
      const ext = ii.extmetadata || {};
      if (ext.Artist && ext.Artist.value) artist = String(ext.Artist.value).replace(/<[^>]+>/g, '').trim().slice(0, 40);
      const attribution = 'Wikimedia Commons' + (artist ? ' / ' + artist : '');
      return { url: ii.thumburl || ii.url, attribution };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ── Source B: Pexels ─────────────────────────────────────────────────
async function fromPexels(query) {
  try {
    if (!PEXELS_KEY) return null;
    const api = 'https://api.pexels.com/v1/search?query=' + encodeURIComponent(query) +
      '&per_page=12&orientation=landscape';
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(api, { signal: controller.signal, headers: { 'Authorization': PEXELS_KEY } });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const photos = data && data.photos;
    if (!photos || !photos.length) return null;
    // pick a photo (rotate a bit so regenerate gives a different one)
    const pick = photos[Math.floor(Math.random() * Math.min(photos.length, 8))];
    const url = (pick.src && (pick.src.large2x || pick.src.large || pick.src.original)) || null;
    if (!url) return null;
    return { url, attribution: 'Pexels / ' + (pick.photographer || 'photographer') };
  } catch (e) {
    return null;
  }
}

// ── Source C: Pixabay (optional fallback) ────────────────────────────
async function fromPixabay(query) {
  try {
    if (!PIXABAY_KEY) return null;
    const api = 'https://pixabay.com/api/?key=' + PIXABAY_KEY +
      '&q=' + encodeURIComponent(query) + '&image_type=photo&orientation=horizontal&per_page=12&safesearch=true';
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(api, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const hits = data && data.hits;
    if (!hits || !hits.length) return null;
    const pick = hits[Math.floor(Math.random() * Math.min(hits.length, 8))];
    const url = pick.largeImageURL || pick.webformatURL || null;
    if (!url) return null;
    return { url, attribution: 'Pixabay / ' + (pick.user || 'contributor') };
  } catch (e) {
    return null;
  }
}

// ── Download a remote image as a buffer ──────────────────────────────
async function downloadImage(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
    });
    clearTimeout(t);
    if (!res.ok) throw new Error('download ' + res.status);
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (!ctype.startsWith('image/')) throw new Error('not an image');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 3000) throw new Error('image too small');
    return buf;
  } finally {
    clearTimeout(t);
  }
}

// ── XML-escape text for safe SVG embedding ───────────────────────────
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Wrap a headline into <=2 lines for the overlay ───────────────────
function wrapHeadline(text, maxChars) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars && line) { lines.push(line.trim()); line = w; }
    else { line = (line + ' ' + w).trim(); }
    if (lines.length === 2) break;
  }
  if (line && lines.length < 2) lines.push(line.trim());
  // if truncated, add ellipsis
  if (lines.join(' ').length < String(text || '').length && lines.length === 2) {
    lines[1] = lines[1].replace(/[.,;:]?$/, '') + '…';
  }
  return lines.slice(0, 2);
}

// ── Apply Dawn Brief treatment: photo + dark gradient + gold + headline + logo + attribution ──
async function applyTreatment(imageBuffer, opts) {
  const category = (opts.category || '').toUpperCase();
  const headline = opts.headline || '';
  const attribution = opts.attribution || '';

  const base = await sharp(imageBuffer)
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 88 })
    .toBuffer();

  const lines = wrapHeadline(headline, 34);
  const hlSvg = lines.map((ln, i) =>
    '<text x="58" y="' + (548 + i * 50) + '" font-family="sans-serif" font-size="42" font-weight="800" fill="#ffffff">' + esc(ln) + '</text>'
  ).join('');
  const headlineBlockTop = lines.length === 2 ? 498 : 548;

  const svg =
'<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><defs>' +
  '<linearGradient id="dark" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#07070F" stop-opacity="0"/>' +
    '<stop offset="50%" stop-color="#07070F" stop-opacity="0.05"/>' +
    '<stop offset="100%" stop-color="#07070F" stop-opacity="0.9"/></linearGradient>' +
  '<linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0%" stop-color="#8A6218"/><stop offset="50%" stop-color="#FFF0B0"/><stop offset="100%" stop-color="#8A6218"/></linearGradient>' +
  '<clipPath id="hs"><rect x="980" y="34" width="40" height="18"/></clipPath>' +
'</defs>' +
  '<rect width="1200" height="630" fill="url(#dark)"/>' +
  '<rect x="0" y="0" width="1200" height="4" fill="#E8C558"/>' +
  // category label (gold)
  (category ? '<text x="60" y="' + (headlineBlockTop - 22) + '" font-family="sans-serif" font-size="19" font-weight="700" fill="#E8C558" letter-spacing="2">' + esc(category) + '</text>' : '') +
  // headline (white, 1-2 lines)
  hlSvg +
  // attribution (tiny, bottom-right corner)
  (attribution ? '<text x="1180" y="618" font-family="sans-serif" font-size="11" fill="#c8c8d0" opacity="0.7" text-anchor="end">' + esc(attribution) + '</text>' : '') +
  // Dawn Brief logo + name (top-right)
  '<g stroke="url(#gold)" stroke-width="2.6" stroke-linecap="round" fill="none">' +
    '<line x1="986" y1="52" x2="1014" y2="52"/>' +
    '<circle cx="1000" cy="52" r="9" clip-path="url(#hs)"/>' +
    '<line x1="1000" y1="33" x2="1000" y2="38"/>' +
  '</g>' +
  '<text x="1026" y="58" font-family="sans-serif" font-size="19" font-style="italic" font-weight="700" fill="url(#gold)">The Dawn Brief</text>' +
'</svg>';

  return await sharp(base)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

// ── Upload to Supabase, return public URL (cache-busted) ─────────────
async function uploadToSupabase(buffer, storyId) {
  const path = 'ai/' + storyId + '.jpg';
  const up = await fetch(SUPA_URL + '/storage/v1/object/' + IMG_BUCKET + '/' + path, {
    method: 'POST',
    headers: {
      'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'Cache-Control': 'public, max-age=31536000'
    },
    body: buffer
  });
  if (!up.ok) {
    let d = ''; try { d = await up.text(); } catch (e) {}
    throw new Error('Supabase upload ' + up.status + ': ' + d.slice(0, 150));
  }
  return SUPA_URL + '/storage/v1/object/public/' + IMG_BUCKET + '/' + path + '?v=' + Date.now();
}

// ── MAIN: source a real photo for one story, brand it, save it ───────
// Returns { ok:true, url, source, attribution } | { ok:false, error }. NEVER throws.
async function generateStoryImage(story) {
  try {
    if (!CLAUDE_API_KEY) return { ok: false, error: 'No Claude API key' };
    if (!SUPA_KEY) return { ok: false, error: 'No Supabase key' };

    // 1. decide source + keyword
    let decision;
    try {
      decision = await decideImageQuery(story.headline, story.category, story.summary);
    } catch (e) {
      decision = { kind: 'pexels', query: (story.category || 'india news') + ' india' };
    }
    console.log('🔎 [' + story.id + '] ' + decision.kind + ' query: "' + decision.query + '"');

    // 2. fetch a photo in priority order
    let found = null;   // { url, attribution }
    let source = null;

    if (decision.kind === 'wikimedia') {
      found = await fromWikimedia(decision.query); if (found) source = 'wikimedia';
      if (!found) { found = await fromPexels(decision.query); if (found) source = 'pexels'; }
    } else {
      found = await fromPexels(decision.query); if (found) source = 'pexels';
      if (!found) { found = await fromPixabay(decision.query); if (found) source = 'pixabay'; }
      if (!found) { found = await fromWikimedia(decision.query); if (found) source = 'wikimedia'; }
    }
    // last-chance pixabay if everything above failed
    if (!found) { found = await fromPixabay(decision.query); if (found) source = 'pixabay'; }

    if (!found) {
      console.warn('⚠️ [' + story.id + '] no photo from any source for "' + decision.query + '"');
      return { ok: false, error: 'No photo found for: ' + decision.query };
    }

    // 3. download + brand + save
    const raw = await downloadImage(found.url);
    const branded = await applyTreatment(raw, {
      category: story.category, headline: story.headline, attribution: found.attribution
    });
    const url = await uploadToSupabase(branded, story.id);

    console.log('✅ [' + story.id + '] photo via ' + source + ' (' + found.attribution + ')');
    return { ok: true, url, source, attribution: found.attribution };
  } catch (e) {
    console.error('⚠️ image failed [' + (story && story.id) + ']: ' + e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { generateStoryImage };
