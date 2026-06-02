// ═══════════════════════════════════════════════════════════════════
// RAVIS — Senior Editor Voice Assistant for Dawn Brief Admin
// ═══════════════════════════════════════════════════════════════════

const RAVIS_CONFIG = {
  deepgramKey: '', // loaded securely from backend
  elevenLabsKey: window.ELEVENLABS_KEY || '',
  voiceId: 'sample1',
  voiceIds: {
    sample1: '9lB2zeiclGQj6fcbsPT2',
    sample2: 'LexxJMz1bqPc5O2p2GbV'
  }
};

async function loadRavisConfig() {
  try {
    const res = await fetch('https://api.ayushbrief.online/api/admin/config', {
      headers: { 'x-admin-key': 'dawnbrief2026' }
    });
    const data = await res.json();
    RAVIS_CONFIG.deepgramKey = data.deepgramKey || '';
  } catch(e) {
    console.error('Ravis config load failed:', e);
  }
}

// ── STATE MACHINE ─────────────────────────────────────────────────
const STATES = {
  IDLE: 'idle',
  GREETING: 'greeting',
  WAITING_HELLO: 'waiting_hello',
  WAITING_NEEND: 'waiting_neend',
  WAITING_CHALO: 'waiting_chalo',
  CATEGORY_INTRO: 'category_intro',
  PHASE1: 'phase1_select10',
  PHASE2: 'phase2_select5',
  PHASE3_GENERATING: 'phase3_generating',
  PHASE3_REVIEW: 'phase3_review',
  EDIT_MODE: 'edit_mode',
  EDIT_CONFIRM: 'edit_confirm',
  REGEN_FEEDBACK: 'regen_feedback',
  KHATARNAK_SELECT: 'khatarnak_select',
  KHATARNAK_REVIEW: 'khatarnak_review',
  SUBMIT_CONFIRM: 'submit_confirm',
  PAUSED: 'paused'
};

// ── COMMAND MATCHING ──────────────────────────────────────────────
const COMMANDS = {
  YES: ['haan', 'han', 'yes', 'ha', 'bilkul', 'theek', 'kar do', 'kardo', 'final', 'ok', 'okay', 'sahi', 'done', 'ho gaya', 'hogaya'],
  NO:  ['nahi', 'no', 'nope', 'skip', 'mat', 'na', 'next', 'chodo', 'chhodo'],
  APPROVE: ['approve', 'approved', 'theek hai', 'sahi hai', 'accha hai', 'perfect'],
  EDIT: ['edit', 'badlo', 'change', 'update', 'modify'],
  REGENERATE: ['regenerate', 'dobara', 'firse', 'again', 'naya', 'different'],
  PAUSE: ['ruko', 'ruk', 'stop', 'pause', 'ek second', 'hold'],
  RESUME: ['chalo', 'shuru', 'continue', 'aage', 'next', 'proceed'],
  SUBMIT: ['submit', 'publish', 'kar do', 'send', 'live karo']
};

function matchCommand(text, commandType) {
  const t = text.toLowerCase().trim();
  const keywords = COMMANDS[commandType] || [];
  return keywords.some(k => t.includes(k));
}

function matchAnyCommand(text) {
  for (const [type, keywords] of Object.entries(COMMANDS)) {
    if (keywords.some(k => text.toLowerCase().includes(k))) return type;
  }
  return null;
}

// ── RAVIS CLASS ───────────────────────────────────────────────────
class Ravis {
  constructor(adminState) {
    this.state = STATES.IDLE;
    this.admin = adminState; // reference to admin page state
    this.currentCatIndex = 0;
    this.currentStoryIndex = 0;
    this.currentVoiceKey = 'student'; // student or professional
    this.currentStoryId = null;
    this.editBuffer = '';
    this.isListening = false;
    this.isSpeaking = false;
    this.deepgramSocket = null;
    this.audioQueue = [];
    this.isProcessingAudio = false;
    this.onStatusUpdate = null; // callback for UI updates
    this.onTranscript = null;   // callback to show what was heard
  }

  // ── DEEPGRAM SETUP ──────────────────────────────────────────────
  async startListening() {
    if (this.isListening) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      const token = await this.getDeepgramToken();
      this.deepgramSocket = new WebSocket(
        `wss://api.deepgram.com/v1/listen?language=hi&model=nova-2&punctuate=true&interim_results=false`,
        ['token', token]
      );

      this.deepgramSocket.onopen = () => {
        this.isListening = true;
        mediaRecorder.start(250);
        this.updateStatus('Sun raha hoon...');
      };

      this.deepgramSocket.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const transcript = data?.channel?.alternatives?.[0]?.transcript;
        if (transcript && transcript.trim()) {
          if (this.onTranscript) this.onTranscript(transcript);
          this.handleTranscript(transcript);
        }
      };

      this.deepgramSocket.onerror = () => {
        this.updateStatus('Mic error. Refresh karo.');
      };

      mediaRecorder.ondataavailable = (e) => {
        if (this.deepgramSocket?.readyState === WebSocket.OPEN && e.data.size > 0) {
          this.deepgramSocket.send(e.data);
        }
      };

      this.mediaRecorder = mediaRecorder;
      this.mediaStream = stream;

    } catch (err) {
      console.error('Deepgram error:', err);
      this.updateStatus('Mic permission chahiye.');
    }
  }

  async getDeepgramToken() {
    return RAVIS_CONFIG.deepgramKey;
  }

  stopListening() {
    this.isListening = false;
    if (this.deepgramSocket) {
      this.deepgramSocket.close();
      this.deepgramSocket = null;
    }
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
  }

  // ── SPEAK ───────────────────────────────────────────────────────
  async speak(text) {
    this.isSpeaking = true;
    this.updateStatus('Bol raha hoon...');
    try {
      const r = await fetch('https://api.ayushbrief.online/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_sample: RAVIS_CONFIG.voiceId })
      });
      if (!r.ok) throw new Error('Voice error');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      return new Promise((resolve) => {
        const audio = new Audio(url);
        audio.onended = () => {
          this.isSpeaking = false;
          URL.revokeObjectURL(url);
          this.updateStatus('Sun raha hoon...');
          resolve();
        };
        audio.onerror = () => { this.isSpeaking = false; resolve(); };
        audio.play();
      });
    } catch (e) {
      this.isSpeaking = false;
      console.error('Speak error:', e);
    }
  }

  updateStatus(msg) {
    if (this.onStatusUpdate) this.onStatusUpdate(msg);
  }

  // ── TRANSCRIPT HANDLER ──────────────────────────────────────────
  async handleTranscript(text) {
    if (this.isSpeaking) return; // ignore while speaking
    const t = text.toLowerCase().trim();
    console.log(`[Ravis heard]: ${text} | state: ${this.state}`);

    switch (this.state) {

      case STATES.WAITING_HELLO:
        await this.speak('Raat ko neend kaisi aayi?');
        this.state = STATES.WAITING_NEEND;
        break;

      case STATES.WAITING_NEEND:
        await this.speak('Chalo Mr. Bansal, kaam shuru karte hain.');
        this.state = STATES.WAITING_CHALO;
        break;

      case STATES.WAITING_CHALO:
        if (matchCommand(t, 'YES') || matchCommand(t, 'RESUME')) {
          await this.startFirstCategory();
        }
        break;

      case STATES.PHASE1:
        if (this.state === STATES.PAUSED) return;
        if (matchCommand(t, 'YES')) {
          await this.selectCurrentStory10();
        } else if (matchCommand(t, 'NO')) {
          await this.skipToNextPhase1Story();
        } else if (matchCommand(t, 'PAUSE')) {
          this.state = STATES.PAUSED;
          await this.speak('Theek hai Mr. Bansal, ruk gaya. Jab ready hon bolein chalo.');
        }
        break;

      case STATES.PHASE2:
        if (matchCommand(t, 'YES')) {
          await this.selectCurrentStory5();
        } else if (matchCommand(t, 'NO')) {
          await this.skipToNextPhase2Story();
        } else if (matchCommand(t, 'PAUSE')) {
          this.state = STATES.PAUSED;
          await this.speak('Ruk gaya. Jab ready hon bolein chalo.');
        }
        break;

      case STATES.PHASE3_REVIEW:
        if (matchCommand(t, 'APPROVE')) {
          await this.approveCurrentVoice();
        } else if (matchCommand(t, 'EDIT')) {
          await this.enterEditMode();
        } else if (matchCommand(t, 'REGENERATE')) {
          await this.enterRegenMode();
        }
        break;

      case STATES.EDIT_MODE:
        // Anything said becomes the edit instruction
        this.editBuffer = text;
        await this.speak(`Suna. Updated summary sun:`);
        await this.applyVoiceEdit(text);
        this.state = STATES.EDIT_CONFIRM;
        break;

      case STATES.EDIT_CONFIRM:
        if (matchCommand(t, 'APPROVE')) {
          await this.approveCurrentVoice();
        } else if (matchCommand(t, 'EDIT')) {
          await this.enterEditMode();
        } else if (matchCommand(t, 'REGENERATE')) {
          await this.enterRegenMode();
        }
        break;

      case STATES.REGEN_FEEDBACK:
        // Feedback captured — regenerate
        await this.regenerateWithFeedback(text);
        break;

      case STATES.KHATARNAK_SELECT:
        if (matchCommand(t, 'YES')) {
          await this.selectKhatarnakStory();
        } else if (matchCommand(t, 'NO')) {
          await this.skipKhatarnakStory();
        }
        break;

      case STATES.KHATARNAK_REVIEW:
        if (matchCommand(t, 'APPROVE')) {
          await this.approveKhatarnakVoice();
        } else if (matchCommand(t, 'EDIT')) {
          await this.enterEditMode();
        } else if (matchCommand(t, 'REGENERATE')) {
          await this.enterRegenMode();
        }
        break;

      case STATES.SUBMIT_CONFIRM:
        if (matchCommand(t, 'YES') || matchCommand(t, 'SUBMIT')) {
          await this.executeSubmit();
        } else if (matchCommand(t, 'NO') || matchCommand(t, 'PAUSE')) {
          await this.speak('Theek hai, ruk gaya. Jab bolein submit kar doon.');
          this.state = STATES.PAUSED;
        }
        break;

      case STATES.PAUSED:
        if (matchCommand(t, 'RESUME') || matchCommand(t, 'YES')) {
          await this.resumeFromPause();
        }
        break;
    }
  }

  // ── GREETING ────────────────────────────────────────────────────
  async startGreeting() {
    this.state = STATES.GREETING;
    await this.speak('Hello Mr. Bansal.');
    this.state = STATES.WAITING_HELLO;
    this.updateStatus('Hello bolein...');
  }

  // ── CATEGORY FLOW ────────────────────────────────────────────────
  getCategoryList() {
    return [
      'Business', 'Indian Economy', 'Finance', 'Tech', 'Sports',
      'Government', 'International', 'Climate', 'Startups & Auto',
      'Science & Health', 'Entertainment'
    ];
  }

  async startFirstCategory() {
    this.currentCatIndex = 0;
    await this.startCategory(this.getCategoryList()[0]);
  }

  async startCategory(cat) {
    const stories = this.admin.allStories[cat] || [];
    const mustCount = stories.filter(s => s.importance === '🔴').length;
    const normalCount = stories.length - mustCount;

    this.currentCategoryStories = stories;
    this.currentCategoryName = cat;
    this.currentPhase1Stories = [...stories]; // copy for iteration
    this.currentPhase1Index = 0;
    this.admin.selected10[cat] = this.admin.selected10[cat] || new Set();
    this.admin.selected5[cat] = this.admin.selected5[cat] || new Set();

    await this.speak(`${cat} category se shuru karte hain. Aaj ${stories.length} stories hain. ${mustCount} high priority, ${normalCount} normal.`);

    if (mustCount > 0) {
      await this.speak('High priority stories se shuru karte hain.');
    }

    this.state = STATES.PHASE1;
    await this.readNextPhase1Story();
  }

  async readNextPhase1Story() {
    const cat = this.currentCategoryName;
    const selected = this.admin.selected10[cat];

    if (selected.size >= 10) {
      await this.finishPhase1();
      return;
    }

    // Find next unselected story
    while (this.currentPhase1Index < this.currentPhase1Stories.length) {
      const story = this.currentPhase1Stories[this.currentPhase1Index];
      if (!selected.has(story.id)) {
        this.currentStoryId = story.id;
        const priority = story.importance === '🔴' ? 'High priority. ' : '';
        await this.speak(`${priority}Story ${this.currentPhase1Index + 1}: ${story.headline}. ${story.summary || ''}`);
        await this.speak('Final karein?');
        this.updateStatus('Haan ya Nahi bolein...');
        return;
      }
      this.currentPhase1Index++;
    }

    // All stories read but less than 10 selected
    await this.finishPhase1();
  }

  async selectCurrentStory10() {
    const cat = this.currentCategoryName;
    this.admin.selected10[cat].add(this.currentStoryId);
    const count = this.admin.selected10[cat].size;
    await this.speak(`Select. ${count} of 10.`);
    this.currentPhase1Index++;
    if (count >= 10) {
      await this.finishPhase1();
    } else {
      await this.readNextPhase1Story();
    }
  }

  async skipToNextPhase1Story() {
    await this.speak('Skip.');
    this.currentPhase1Index++;
    await this.readNextPhase1Story();
  }

  async finishPhase1() {
    const cat = this.currentCategoryName;
    const count = this.admin.selected10[cat].size;
    await this.speak(`${cat} ki ${count} news done. Ab ${count} mein se 5 final karte hain.`);
    this.state = STATES.PHASE2;
    this.currentPhase2Stories = Array.from(this.admin.selected10[cat]).map(id =>
      this.currentCategoryStories.find(s => s.id === id)
    ).filter(Boolean);
    this.currentPhase2Index = 0;
    await this.readNextPhase2Story();
  }

  async readNextPhase2Story() {
    const cat = this.currentCategoryName;
    const selected5 = this.admin.selected5[cat];

    if (selected5.size >= 5) {
      await this.finishPhase2();
      return;
    }

    if (this.currentPhase2Index >= this.currentPhase2Stories.length) {
      await this.finishPhase2();
      return;
    }

    const story = this.currentPhase2Stories[this.currentPhase2Index];
    this.currentStoryId = story.id;
    await this.speak(`Story ${this.currentPhase2Index + 1}: ${story.headline}. Final karein?`);
    this.updateStatus('Final ya Nahi bolein...');
  }

  async selectCurrentStory5() {
    const cat = this.currentCategoryName;
    this.admin.selected5[cat].add(this.currentStoryId);
    const count = this.admin.selected5[cat].size;
    await this.speak(`Final. ${count} of 5.`);
    this.currentPhase2Index++;
    if (count >= 5) {
      await this.finishPhase2();
    } else {
      await this.readNextPhase2Story();
    }
  }

  async skipToNextPhase2Story() {
    await this.speak('Skip.');
    this.currentPhase2Index++;
    await this.readNextPhase2Story();
  }

  async finishPhase2() {
    const cat = this.currentCategoryName;
    const count = this.admin.selected5[cat].size;
    await this.speak(`${count} news final. Voice summary generate kar raha hoon.`);
    this.state = STATES.PHASE3_GENERATING;
    await this.generateVoicesForCategory();
  }

  // ── PHASE 3: VOICE REVIEW ────────────────────────────────────────
  async generateVoicesForCategory() {
    const cat = this.currentCategoryName;
    const ids = Array.from(this.admin.selected5[cat]);
    try {
      const res = await fetch('https://api.ayushbrief.online/api/admin/generate-voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': 'dawnbrief2026' },
        body: JSON.stringify({ story_ids: ids })
      });
      const data = await res.json();
      if (data.success) {
        data.stories.forEach(s => {
          const story = (this.admin.allStories[cat] || []).find(st => st.id === s.id);
          if (story) story.voices = s.voices;
        });
        await this.speak('Voice summaries ready hain. Review karte hain.');
        this.state = STATES.PHASE3_REVIEW;
        this.currentPhase3Stories = Array.from(this.admin.selected5[cat]).map(id =>
          (this.admin.allStories[cat] || []).find(s => s.id === id)
        ).filter(Boolean);
        this.currentPhase3Index = 0;
        this.currentVoiceKey = 'student';
        await this.readCurrentVoiceSummary();
      }
    } catch (err) {
      await this.speak('Voice generate karne mein problem aayi. Dobara try karte hain.');
    }
  }

  async readCurrentVoiceSummary() {
    const story = this.currentPhase3Stories[this.currentPhase3Index];
    if (!story) { await this.finishPhase3(); return; }

    const voiceLabel = this.currentVoiceKey === 'student' ? 'student' : 'professional';
    const voiceText = story.voices?.[this.currentVoiceKey] || 'Voice generate nahi hui.';

    await this.speak(`${story.headline} ki ${voiceLabel} voice summary sun:`);
    await this.speak(voiceText);
    await this.speak('Approve karein, edit karein, ya regenerate karein?');
    this.updateStatus('Approve, Edit, ya Regenerate bolein...');
  }

  async approveCurrentVoice() {
    if (!this.admin.approvedVoices[this.currentStoryId]) {
      this.admin.approvedVoices[this.currentStoryId] = {};
    }
    this.admin.approvedVoices[this.currentStoryId][this.currentVoiceKey] = true;

    await this.speak('Approved.');

    // Move to next voice key or next story
    if (this.currentVoiceKey === 'student') {
      this.currentVoiceKey = 'professional';
      await this.readCurrentVoiceSummary();
    } else {
      this.currentVoiceKey = 'student';
      this.currentPhase3Index++;
      if (this.currentPhase3Index >= this.currentPhase3Stories.length) {
        await this.finishPhase3();
      } else {
        await this.readCurrentVoiceSummary();
      }
    }
  }

  async enterEditMode() {
    await this.speak('Boliye kya change karein. Ya type karke done bolein.');
    this.state = STATES.EDIT_MODE;
    this.updateStatus('Edit instruction bolein ya type karein...');
  }

  async applyVoiceEdit(instruction) {
    // Save the edit — use instruction as guidance to Claude
    const story = this.currentPhase3Stories[this.currentPhase3Index];
    const currentVoice = story.voices?.[this.currentVoiceKey] || '';

    try {
      const res = await fetch('https://api.ayushbrief.online/api/admin/regenerate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': 'dawnbrief2026' },
        body: JSON.stringify({
          story_id: story.id,
          voice_key: this.currentVoiceKey,
          feedback: instruction
        })
      });
      const data = await res.json();
      if (data.success) {
        story.voices[this.currentVoiceKey] = data.new_voice;
        await this.speak(data.new_voice);
        await this.speak('Approve karein, phir se edit karein, ya regenerate karein?');
        this.state = STATES.EDIT_CONFIRM;
      }
    } catch (err) {
      await this.speak('Edit mein problem aayi.');
      this.state = STATES.PHASE3_REVIEW;
    }
  }

  async enterRegenMode() {
    await this.speak('Feedback doon? Kya hona chahiye?');
    this.state = STATES.REGEN_FEEDBACK;
    this.updateStatus('Feedback bolein...');
  }

  async regenerateWithFeedback(feedback) {
    await this.speak('Theek hai, regenerate kar raha hoon.');
    const story = this.currentPhase3Stories[this.currentPhase3Index];
    try {
      const res = await fetch('https://api.ayushbrief.online/api/admin/regenerate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': 'dawnbrief2026' },
        body: JSON.stringify({
          story_id: story.id,
          voice_key: this.currentVoiceKey,
          feedback
        })
      });
      const data = await res.json();
      if (data.success) {
        story.voices[this.currentVoiceKey] = data.new_voice;
        await this.speak('Naya version sun:');
        await this.speak(data.new_voice);
        await this.speak('Approve karein, edit karein, ya phir regenerate karein?');
        this.state = STATES.PHASE3_REVIEW;
      }
    } catch (err) {
      await this.speak('Regenerate mein problem aayi.');
      this.state = STATES.PHASE3_REVIEW;
    }
  }

  async finishPhase3() {
    const cat = this.currentCategoryName;
    this.admin.catDone[cat] = true;
    await this.speak(`${cat} category finished, Mr. Bansal.`);

    // Move to next category
    this.currentCatIndex++;
    const cats = this.getCategoryList();
    if (this.currentCatIndex < cats.length) {
      const nextCat = cats[this.currentCatIndex];
      await this.speak(`${nextCat} shuru karein?`);
      this.state = STATES.WAITING_CHALO;
    } else {
      // All categories done — go to khatarnak
      await this.startKhatarnak();
    }
  }

  // ── KHATARNAK ────────────────────────────────────────────────────
  async startKhatarnak() {
    await this.speak('Sab categories done. Ab khatarnak news select karte hain. Yeh Bhai Mode ke liye hogi.');
    this.state = STATES.KHATARNAK_SELECT;
    this.khatarnakPool = Object.values(this.admin.allStories)
      .map(stories => {
        const must = stories.find(s => s.importance === '🔴');
        return must || stories[0];
      })
      .filter(Boolean);
    this.khatarnakIndex = 0;
    this.admin.selectedKhatarnak = this.admin.selectedKhatarnak || new Set();
    await this.readNextKhatarnakStory();
  }

  async readNextKhatarnakStory() {
    if (this.admin.selectedKhatarnak.size >= 5) {
      await this.finishKhatarnakSelect();
      return;
    }
    if (this.khatarnakIndex >= this.khatarnakPool.length) {
      await this.finishKhatarnakSelect();
      return;
    }
    const story = this.khatarnakPool[this.khatarnakIndex];
    this.currentStoryId = story.id;
    await this.speak(`${story._cat || story.category}: ${story.headline}. Khatarnak mein lein?`);
    this.updateStatus('Haan ya Nahi bolein...');
  }

  async selectKhatarnakStory() {
    this.admin.selectedKhatarnak.add(this.currentStoryId);
    const count = this.admin.selectedKhatarnak.size;
    await this.speak(`Select. ${count} of 5.`);
    this.khatarnakIndex++;
    await this.readNextKhatarnakStory();
  }

  async skipKhatarnakStory() {
    await this.speak('Skip.');
    this.khatarnakIndex++;
    await this.readNextKhatarnakStory();
  }

  async finishKhatarnakSelect() {
    await this.speak('5 khatarnak stories selected. Voice generate kar raha hoon.');
    const ids = Array.from(this.admin.selectedKhatarnak);
    try {
      const res = await fetch('https://api.ayushbrief.online/api/admin/generate-khatarnak-voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': 'dawnbrief2026' },
        body: JSON.stringify({ story_ids: ids })
      });
      const data = await res.json();
      if (data.success) {
        data.stories.forEach(s => { this.admin.khatarnakVoices[s.id] = s.voices; });
        await this.speak('Khatarnak voices ready. Review karte hain.');
        this.state = STATES.KHATARNAK_REVIEW;
        this.khatarnakReviewStories = ids.map(id => this.khatarnakPool.find(s => s.id === id)).filter(Boolean);
        this.khatarnakReviewIndex = 0;
        this.currentVoiceKey = 'student';
        await this.readKhatarnakVoice();
      }
    } catch (err) {
      await this.speak('Khatarnak voice generate mein problem aayi.');
    }
  }

  async readKhatarnakVoice() {
    const story = this.khatarnakReviewStories[this.khatarnakReviewIndex];
    if (!story) { await this.finishKhatarnak(); return; }
    const voices = this.admin.khatarnakVoices[story.id] || {};
    const voiceText = voices[this.currentVoiceKey] || 'Voice nahi aayi.';
    const label = this.currentVoiceKey === 'student' ? 'student' : 'professional';
    await this.speak(`${story.headline} ki ${label} khatarnak voice:`);
    await this.speak(voiceText);
    await this.speak('Approve karein, edit karein, ya regenerate karein?');
    this.state = STATES.KHATARNAK_REVIEW;
    this.updateStatus('Approve, Edit, ya Regenerate bolein...');
  }

  async approveKhatarnakVoice() {
    if (!this.admin.khatarnakApproved[this.currentStoryId]) {
      this.admin.khatarnakApproved[this.currentStoryId] = {};
    }
    this.admin.khatarnakApproved[this.currentStoryId][this.currentVoiceKey] = true;
    await this.speak('Approved.');

    if (this.currentVoiceKey === 'student') {
      this.currentVoiceKey = 'professional';
      await this.readKhatarnakVoice();
    } else {
      this.currentVoiceKey = 'student';
      this.khatarnakReviewIndex++;
      if (this.khatarnakReviewIndex >= this.khatarnakReviewStories.length) {
        await this.finishKhatarnak();
      } else {
        await this.readKhatarnakVoice();
      }
    }
  }

  async finishKhatarnak() {
    this.admin.khatarnakDone = true;
    await this.speak('Khatarnak section done, Mr. Bansal. Sab kuch ready hai.');
    await this.speak('Submit aur publish kar doon?');
    this.state = STATES.SUBMIT_CONFIRM;
    this.updateStatus('Submit ke liye bolein kar do...');
  }

  // ── SUBMIT ───────────────────────────────────────────────────────
  async executeSubmit() {
    await this.speak('Theek hai Mr. Bansal. Submit kar raha hoon.');
    // Trigger the existing submitAll function in admin
    if (window.submitAll) {
      await window.submitAll(true); // true = called by Ravis
    }
    await this.speak('Published. Aaj ka kaam ho gaya, Mr. Bansal. Kal milte hain.');
    this.stopListening();
    this.state = STATES.IDLE;
  }

  async resumeFromPause() {
    this.state = this.previousState || STATES.PHASE1;
    await this.speak('Chalo Mr. Bansal.');
  }
}

// Export
window.Ravis = Ravis;
