/**
 * LeadPilot AI · Modernized Frontend Application Logic
 */

// DOM Elements
const form = document.querySelector('#lead-form');
const statusBox = document.querySelector('#status');
const submitButton = document.querySelector('#submit-button');
const submitLabel = document.querySelector('#submit-label');
const resultBox = document.querySelector('#result');
const resultPlaceholder = document.querySelector('#result-placeholder');
const stepper = document.querySelector('#stepper');
const resetFormBtn = document.querySelector('#reset-form-btn');
const presetButtons = document.querySelectorAll('.preset-btn');

// View Toggle Elements
const btnViewCard = document.querySelector('#btn-view-card');
const btnViewJson = document.querySelector('#btn-view-json');
const executiveView = document.querySelector('#executive-view');
const jsonView = document.querySelector('#json-view');
const resultJsonCode = document.querySelector('#result-json-code');
const copyReplyBtn = document.querySelector('#copy-reply-btn');
const copyReplyLabel = document.querySelector('#copy-reply-label');
const copyJsonBtn = document.querySelector('#copy-json-btn');

// Form Input Elements
const nameInput = document.querySelector('#name');
const phoneInput = document.querySelector('#phone');
const businessInput = document.querySelector('#business');
const serviceInput = document.querySelector('#service');
const budgetInput = document.querySelector('#budget');
const messageInput = document.querySelector('#message');

let isSubmitting = false;
let currentRawData = null;
let stepperInterval = null;
const defaultSubmitText = submitLabel ? submitLabel.textContent : 'Qualify Lead with AI';

// Quick Test Presets
const PRESETS = {
  hot: {
    name: 'Ahmed Benali',
    phone: '+213 550 123 456',
    business: 'Benali Fashion & Retail (3 Locations)',
    service: 'WhatsApp AI Bot & Instant Lead Qualification',
    budget: '120,000 DZD / month',
    message: 'We are losing customers because we cannot answer WhatsApp inquiries fast enough. We have budget ready and want to launch this system within the next 7 days. Can we meet today?',
  },
  warm: {
    name: 'Sara Mansouri',
    phone: '+213 661 987 654',
    business: 'Mansouri Digital Agency',
    service: 'Lead Qualification Automation for Clients',
    budget: '45,000 DZD monthly',
    message: 'We are evaluating AI tools to filter client inquiries for next quarter. Looking for an overview of your setup and pricing.',
  },
  cold: {
    name: 'Karim Z.',
    phone: '+213 770 000 111',
    business: 'Personal Project',
    service: 'General Information',
    budget: 'No budget / Free trial',
    message: 'Just curious how this works. Do you have free code templates or tutorials I can copy for a school project?',
  },
};

// Preset Handlers
presetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const presetKey = btn.dataset.preset;
    const data = PRESETS[presetKey];
    if (!data) return;

    presetButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    nameInput.value = data.name;
    phoneInput.value = data.phone;
    businessInput.value = data.business;
    serviceInput.value = data.service;
    budgetInput.value = data.budget;
    messageInput.value = data.message;

    clearStatus();
    nameInput.focus();
  });
});

if (resetFormBtn) {
  resetFormBtn.addEventListener('click', () => {
    form.reset();
    presetButtons.forEach((b) => b.classList.remove('active'));
    clearStatus();
  });
}

// Status Management
function clearStatus() {
  if (!statusBox) return;
  statusBox.className = 'status hidden';
  statusBox.textContent = '';
}

function setStatus(type, message) {
  if (!statusBox) return;
  statusBox.className = `status ${type}`;
  statusBox.textContent = message;
}

// Stepper Progress Animation
function startStepperAnimation() {
  if (!stepper) return;
  stepper.classList.remove('hidden');

  const step1 = document.querySelector('#step-1');
  const step2 = document.querySelector('#step-2');
  const step3 = document.querySelector('#step-3');

  if (step1) step1.className = 'step-item active';
  if (step2) step2.className = 'step-item';
  if (step3) step3.className = 'step-item';

  let current = 1;
  stepperInterval = setInterval(() => {
    current++;
    if (current === 2) {
      if (step1) step1.className = 'step-item completed';
      if (step2) step2.className = 'step-item active';
    } else if (current === 3) {
      if (step2) step2.className = 'step-item completed';
      if (step3) step3.className = 'step-item active';
    }
  }, 1200);
}

function stopStepperAnimation(isSuccess = true) {
  if (stepperInterval) {
    clearInterval(stepperInterval);
    stepperInterval = null;
  }

  const step1 = document.querySelector('#step-1');
  const step2 = document.querySelector('#step-2');
  const step3 = document.querySelector('#step-3');

  if (isSuccess) {
    if (step1) step1.className = 'step-item completed';
    if (step2) step2.className = 'step-item completed';
    if (step3) step3.className = 'step-item completed';
  }

  setTimeout(() => {
    if (stepper) stepper.classList.add('hidden');
  }, 800);
}

function setSubmitting(value) {
  isSubmitting = value;
  submitButton.disabled = value;
  form.setAttribute('aria-busy', String(value));
  submitLabel.textContent = value ? 'Qualifying with Gemini AI...' : defaultSubmitText;

  if (value) {
    startStepperAnimation();
  } else {
    stopStepperAnimation(true);
  }
}

function text(id, value) {
  const el = document.querySelector(id);
  if (el) el.textContent = value || '-';
}

function normalizeSuccessMessage(message) {
  if (!message || message === 'Lead qualified successfully.') {
    return 'Lead evaluated successfully. Operations sync complete.';
  }
  return message;
}

// Display AI Qualification Results
function showResult(data) {
  currentRawData = data;
  const q = data?.qualification;
  if (!q) return;

  const temperature = (q.temperature || '').toUpperCase();

  text('#result-summary', q.summary);
  text('#score-badge', `${q.score ?? 0}/10`);
  text('#result-temperature', temperature);
  text('#result-intent', q.purchaseIntent);
  text('#result-urgency', q.urgency);
  text('#result-budget', q.budgetFit);
  text('#result-reason', q.qualificationReason);
  text('#result-action', q.recommendedAction);
  text('#result-reply', q.suggestedReply);

  if (resultJsonCode) {
    resultJsonCode.textContent = JSON.stringify(data, null, 2);
  }

  if (resultPlaceholder) {
    resultPlaceholder.classList.add('hidden');
  }

  resultBox.dataset.temperature = temperature.toLowerCase();
  resultBox.classList.remove('hidden');

  // Smooth scroll to result on smaller screens
  if (window.innerWidth <= 1024) {
    setTimeout(() => {
      resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }
}

window.showResult = showResult;

// View Toggle Handlers
if (btnViewCard && btnViewJson) {
  btnViewCard.addEventListener('click', () => {
    btnViewCard.classList.add('active');
    btnViewJson.classList.remove('active');
    if (executiveView) executiveView.classList.remove('hidden');
    if (jsonView) jsonView.classList.add('hidden');
  });

  btnViewJson.addEventListener('click', () => {
    btnViewJson.classList.add('active');
    btnViewCard.classList.remove('active');
    if (executiveView) executiveView.classList.add('hidden');
    if (jsonView) jsonView.classList.remove('hidden');
  });
}

// Copy to Clipboard Handlers
if (copyReplyBtn) {
  copyReplyBtn.addEventListener('click', async () => {
    const replyText = document.querySelector('#result-reply')?.textContent;
    if (!replyText || replyText === '-') return;

    try {
      await navigator.clipboard.writeText(replyText);
      copyReplyBtn.classList.add('copied');
      if (copyReplyLabel) copyReplyLabel.textContent = 'Copied!';
      setTimeout(() => {
        copyReplyBtn.classList.remove('copied');
        if (copyReplyLabel) copyReplyLabel.textContent = 'Copy Reply';
      }, 2000);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  });
}

if (copyJsonBtn) {
  copyJsonBtn.addEventListener('click', async () => {
    if (!currentRawData) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(currentRawData, null, 2));
      copyJsonBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyJsonBtn.textContent = 'Copy JSON';
      }, 2000);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  });
}

// Form Submission
form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (isSubmitting) return;

  clearStatus();

  if (!form.reportValidity()) {
    setStatus('error', 'Please complete all required fields before submitting.');
    return;
  }

  const webhookUrl = window.LEADPILOT_CONFIG?.webhookUrl?.trim();
  if (!webhookUrl) {
    setStatus('error', 'Missing n8n webhook URL configuration.');
    return;
  }

  const payload = Object.fromEntries(new FormData(form).entries());
  setSubmitting(true);
  setStatus('loading', 'Connecting to n8n webhook and triggering Gemini qualification...');

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || `Webhook request failed (${response.status})`);
    }

    setStatus('success', normalizeSuccessMessage(data?.message));
    showResult(data);
  } catch (error) {
    stopStepperAnimation(false);
    setStatus('error', error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.');
  } finally {
    setSubmitting(false);
  }
});

// Check URL query parameters for demo links (e.g., ?demo=hot or ?preview=hot)
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const demoParam = urlParams.get('demo');
  if (demoParam && PRESETS[demoParam]) {
    const targetBtn = document.querySelector(`.preset-btn[data-preset="${demoParam}"]`);
    if (targetBtn) targetBtn.click();
  }

  const previewParam = urlParams.get('preview');
  if (previewParam === 'hot') {
    showResult({
      message: 'Lead processed successfully.',
      qualification: {
        score: 10,
        temperature: 'hot',
        purchaseIntent: 'high',
        urgency: 'high',
        budgetFit: 'strong',
        summary: 'Ahmed Benali is requesting urgent WhatsApp AI bot and lead qualification for 3 retail locations with ready budget.',
        qualificationReason: 'High intent, urgent 7-day launch timeline, and 120,000 DZD budget exceeds criteria.',
        recommendedAction: 'Call Ahmed immediately and book onboarding demo.',
        suggestedReply: 'Hello Ahmed, thank you for reaching out! We can deploy your WhatsApp AI bot within your 7-day timeline. Let us schedule a quick call today to discuss your 3 retail stores.'
      }
    });
  }
});
