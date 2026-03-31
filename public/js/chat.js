/**
 * chat.js — JARVIS natural language chat with voice input
 */

let chatHistory = [];
let isListening = false;
let recognition = null;
let chatOpen = false;

function toggleChat() {
  chatOpen = !chatOpen;
  const panel = document.getElementById('jarvis-chat-panel');
  const btn = document.getElementById('jarvis-chat-btn');
  panel.classList.toggle('open', chatOpen);
  btn.classList.toggle('active', chatOpen);
  if (chatOpen) {
    document.getElementById('chat-input').focus();
    document.getElementById('chat-notif').classList.add('hidden');
  }
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  appendMessage('user', message);
  showTyping(true);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: chatHistory })
    });
    const data = await res.json();
    showTyping(false);

    const reply = data.response || 'Understood.';
    appendMessage('jarvis', reply, data.logged || []);

    chatHistory.push({ role: 'user', content: message });
    chatHistory.push({ role: 'assistant', content: reply });
    if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);

    // Show notif badge if chat is closed
    if (!chatOpen) {
      document.getElementById('chat-notif').classList.remove('hidden');
    }

    // Refresh current section if data was logged
    if (data.logged && data.logged.length > 0) {
      const section = window.JARVIS?.currentSection;
      const loaders = {
        'command-center': typeof loadCommandCenter !== 'undefined' ? loadCommandCenter : null,
        'diet': typeof loadDiet !== 'undefined' ? loadDiet : null,
        'gut': typeof loadGutSection !== 'undefined' ? loadGutSection : null,
        'performance': typeof loadPerformance !== 'undefined' ? loadPerformance : null,
        'body-comp': typeof loadBodyComp !== 'undefined' ? loadBodyComp : null,
        'cognitive': typeof loadCognitive !== 'undefined' ? loadCognitive : null,
      };
      if (section && loaders[section]) setTimeout(loaders[section], 800);
    }

  } catch (e) {
    showTyping(false);
    appendMessage('jarvis', 'Systems temporarily offline. Try again in a moment.');
  }
}

function appendMessage(role, text, logged = []) {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;

  let loggedHtml = '';
  if (logged.length > 0) {
    loggedHtml = `<div class="chat-logged">${logged.map(l => `<span>✓ ${l}</span>`).join('')}</div>`;
  }

  div.innerHTML = `<div class="chat-bubble">${escapeHtml(text)}${loggedHtml}</div>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function showTyping(show) {
  document.getElementById('chat-typing').classList.toggle('hidden', !show);
  const messages = document.getElementById('chat-messages');
  messages.scrollTop = messages.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Voice Input ─────────────────────────────────────────────────────────────
function toggleVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    appendMessage('jarvis', 'Voice input not supported in this browser. Use Chrome or Safari.');
    return;
  }

  if (isListening) {
    stopVoice();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-GB';

  const voiceBtn = document.getElementById('chat-voice-btn');
  const input = document.getElementById('chat-input');

  recognition.onstart = () => {
    isListening = true;
    voiceBtn.textContent = '🔴';
    voiceBtn.classList.add('listening');
    input.placeholder = 'Listening...';
  };

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    input.value = transcript;
    if (e.results[e.results.length - 1].isFinal) {
      stopVoice();
      setTimeout(sendChat, 300);
    }
  };

  recognition.onerror = () => stopVoice();
  recognition.onend = () => stopVoice();

  recognition.start();
}

function stopVoice() {
  isListening = false;
  const voiceBtn = document.getElementById('chat-voice-btn');
  const input = document.getElementById('chat-input');
  voiceBtn.textContent = '🎙';
  voiceBtn.classList.remove('listening');
  input.placeholder = 'Tell me about your day...';
  if (recognition) { try { recognition.stop(); } catch(e) {} }
}

window.toggleChat = toggleChat;
window.sendChat = sendChat;
window.toggleVoice = toggleVoice;
