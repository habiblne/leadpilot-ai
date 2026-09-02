const form = document.querySelector('#lead-form');
const statusBox = document.querySelector('#status');
const submitButton = document.querySelector('#submit-button');
const submitLabel = document.querySelector('#submit-label');
const resultBox = document.querySelector('#result');

let isSubmitting = false;
const defaultSubmitText = submitLabel.textContent;

function clearStatus() {
  statusBox.className = 'status hidden';
  statusBox.textContent = '';
}

function setStatus(type, message) {
  statusBox.className = `status ${type}`;
  statusBox.textContent = message;
}

function setSubmitting(value) {
  isSubmitting = value;
  submitButton.disabled = value;
  form.setAttribute('aria-busy', String(value));
  submitLabel.textContent = value ? 'Processing lead...' : defaultSubmitText;
}

function text(id, value) {
  document.querySelector(id).textContent = value || '-';
}

function normalizeSuccessMessage(message) {
  if (!message || message === 'Lead qualified successfully.') {
    return 'Lead processed successfully.';
  }

  return message;
}

function showResult(data) {
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

  resultBox.dataset.temperature = temperature.toLowerCase();
  resultBox.classList.remove('hidden');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (isSubmitting) return;

  clearStatus();
  resultBox.classList.add('hidden');

  if (!form.reportValidity()) {
    setStatus('error', 'Please complete the required lead details before submitting.');
    return;
  }

  const webhookUrl = window.LEADPILOT_CONFIG?.webhookUrl?.trim();
  if (!webhookUrl) {
    setStatus('error', 'Missing n8n webhook URL.');
    return;
  }

  const payload = Object.fromEntries(new FormData(form).entries());
  setSubmitting(true);
  setStatus('loading', 'Lead received. AI qualification is running...');

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || `Request failed (${response.status})`);

    setStatus('success', normalizeSuccessMessage(data?.message));
    showResult(data);
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : 'Something went wrong. Please try again.');
  } finally {
    setSubmitting(false);
  }
});
