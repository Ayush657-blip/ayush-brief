// ═══════════════════════════════════════════════════════════════════
// IMAGE GENERATION  —  The Dawn Brief
// ───────────────────────────────────────────────────────────────────
// Cascade (reliability):
//   1. Cloudflare Workers AI (FLUX-1-schnell)  ← first preference (reliable infra)
//   2. Pollinations.ai (free)                  ← fallback if Cloudflare fails
//   3. (both fail) → return {ok:false}         ← caller falls back to ORIGINAL photo
//
// Both generators use the SAME Claude-vision prompt (built from the source
// image), so whichever runs produces a consistent, story-matching image.
//
// NEVER throws. Best-effort. Publish never breaks.
// ═══════════════════════════════════════════════════════════════════

const sharp = require('sharp');

const SUPA_URL = 'https://ygkviidhuqicfnvyuiiu.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
const IMG_BUCKET = 'story-images';

// Cloudflare Workers AI (set these in Railway env)
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_MODEL = '@cf/black-forest-labs/flux-1-schnell';

// Pollinations (free, no key)
const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';

// ── Claude call (text or vision) ─────────────────────────────────────
async function callClaudeForPrompt(messages, maxTokens = 200) {
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
      messages
    })
  });
  if (!res.ok) {
    let detail = '';
    try { const e = await res.json(); detail = (e && e.error && e.error.message) || JSON.stringify(e); }
    catch (x) { try { detail = await res.text(); } catch (y) { detail = ''; } }
    throw new Error(('Claude ' + res.status + ': ' + detail).slice(0, 300));
  }
  const data = await res.json();
  return (data.content[0].text || '').trim();
}

// ── Fetch source image as base64 (for vision). Returns null on any failure. ──
async function fetchImageAsBase64(url) {
  try {
    if (!url || !/^https?:\/\//i.test(url)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (!ctype.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000 || buf.length > 5000000) return null;
    let media = 'image/jpeg';
    if (ctype.includes('png')) media = 'image/png';
    else if (ctype.includes('webp')) media = 'image/webp';
    else if (ctype.includes('gif')) media = 'image/gif';
    return { data: buf.toString('base64'), media_type: media };
  } catch (e) {
    return null;
  }
}

// ── Build a realistic image prompt from the story (vision if source available) ──
async function buildImagePrompt(headline, category, summary, sourceImageUrl) {
  const guide = 'You are an art director for a premium Indian news brief. Create a SHORT image-generation prompt (max 40 words) for a brand-new, ORIGINAL photograph that visually represents this news story.\n\nRULES:\n- The image must look like a REAL editorial news photograph (DSLR, photojournalism), NOT digital art, NOT illustration, NOT cartoon, NOT 3D render.\n- Capture the same SCENE and CONCEPT as the story (place, setting, objects, mood) so it feels like it belongs to this exact news.\n- Do NOT describe or name any specific real person face. Show people only generically (from behind, silhouette, crowd, hands) or focus on objects/places instead.\n- Output ONLY the prompt text. No preamble, no quotes, no explanation.';

  const storyText = 'NEWS:\nHeadline: ' + headline + '\nCategory: ' + category + '\nDetail: ' + (summary || '').slice(0, 400);

  const b64 = sourceImageUrl ? await fetchImageAsBase64(sourceImageUrl) : null;

  let messages;
  if (b64) {
    messages = [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: b64.media_type, data: b64.data } },
        { type: 'text', text: guide + '\n\nThe reference image above shows how this story was illustrated. Take INSPIRATION from its scene/setting (do not copy it) and write a prompt for a fresh original photograph of the same kind of scene.\n\n' + storyText }
      ]
    }];
  } else {
    messages = [{ role: 'user', content: guide + '\n\n' + storyText }];
  }

  let prompt = await callClaudeForPrompt(messages, 160);
  prompt = prompt.replace(/^["'`]+|["'`]+$/g, '').replace(/\*/g, '').trim();
  prompt = prompt + ', realistic editorial news photograph, natural lighting, high detail, photojournalism, 35mm';
  return prompt;
}

// ── GENERATOR 1: Cloudflare Workers AI (FLUX). Returns Buffer or throws. ──
async function cloudflareImage(prompt) {
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) throw new Error('Cloudflare not configured');
  const seed = Math.floor(Math.random() * 4000000000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(
      'https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT_ID + '/ai/run/' + CF_MODEL,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': 'Bearer ' + CF_API_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt: prompt.slice(0, 2000), seed: seed, steps: 6 })
      }
    );
    clearTimeout(timer);
    if (!res.ok) {
      let d = ''; try { d = await res.text(); } catch (e) {}
      throw new Error('Cloudflare ' + res.status + ': ' + d.slice(0, 150));
    }
    const data = await res.json();
    const b64 = data && data.result && data.result.image;
    if (!b64) throw new Error('Cloudflare returned no image');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 3000) throw new Error('Cloudflare image too small');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

// ── GENERATOR 2: Pollinations (free fallback). Returns Buffer or throws. ──
async function pollinationsImage(prompt) {
  const seed = Math.floor(Math.random() * 1000000);
  const url = POLLINATIONS_BASE + '/' + encodeURIComponent(prompt) + '?width=1200&height=630&nologo=true&model=flux&seed=' + seed;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    if (!res.ok) throw new Error('Pollinations ' + res.status);
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (!ctype.startsWith('image/')) throw new Error('Pollinations returned non-image');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 3000) throw new Error('Pollinations image too small');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

// ── Try generators in priority order. Returns { buffer, source } or null. ──
async function generateRaw(prompt) {
  try {
    const buf = await cloudflareImage(prompt);
    console.log('🟢 image via Cloudflare');
    return { buffer: buf, source: 'cloudflare' };
  } catch (e) {
    console.warn('⚠️ Cloudflare failed: ' + e.message + ' — trying Pollinations');
  }
  try {
    const buf = await pollinationsImage(prompt);
    console.log('🟡 image via Pollinations (fallback)');
    return { buffer: buf, source: 'pollinations' };
  } catch (e) {
    console.warn('⚠️ Pollinations failed: ' + e.message);
  }
  return null;
}

// ── Apply "The Dawn Brief" watermark (bottom-right) + normalize to 1200x630 ──
async function applyWatermark(imageBuffer) {
  const base = await sharp(imageBuffer)
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 86 })
    .toBuffer();

  const wmSvg = '<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#8A6218"/><stop offset="35%" stop-color="#E8C558"/><stop offset="65%" stop-color="#FFF0B0"/><stop offset="100%" stop-color="#8A6218"/></linearGradient></defs><g transform="translate(1176, 600)" text-anchor="end" font-family="Georgia, serif"><text x="2" y="2" font-size="26" font-style="italic" font-weight="700" fill="#000000" opacity="0.45">The Dawn Brief</text><text x="0" y="0" font-size="26" font-style="italic" font-weight="700" fill="url(#g)">The Dawn Brief</text></g></svg>';

  return await sharp(base)
    .composite([{ input: Buffer.from(wmSvg), top: 0, left: 0 }])
    .jpeg({ quality: 86 })
    .toBuffer();
}

// ── Upload buffer to Supabase, return public URL (cache-busted) ──────────────
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

// ── MAIN: generate an AI image for one story ─────────────────────────
// Returns { ok:true, url, source } | { ok:false, error }. NEVER throws.
async function generateStoryImage(story) {
  try {
    if (!CLAUDE_API_KEY) return { ok: false, error: 'No Claude API key' };
    if (!SUPA_KEY) return { ok: false, error: 'No Supabase key' };

    const prompt = await buildImagePrompt(
      story.headline, story.category, story.summary, story.image_url
    );
    console.log('🎨 prompt [' + story.id + ']: ' + prompt.slice(0, 90) + '...');

    const raw = await generateRaw(prompt);
    if (!raw) return { ok: false, error: 'Both Cloudflare and Pollinations failed' };

    const watermarked = await applyWatermark(raw.buffer);
    const url = await uploadToSupabase(watermarked, story.id);

    console.log('✅ AI image saved [' + story.id + '] via ' + raw.source);
    return { ok: true, url: url, source: raw.source };
  } catch (e) {
    console.error('⚠️ AI image failed [' + (story && story.id) + ']: ' + e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { generateStoryImage };
