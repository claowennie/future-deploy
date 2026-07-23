const ID_KEY = 'future_feedback_test_id_v1';
const FIRST_SEEN_KEY = 'future_feedback_first_seen_date_v1';
const SURVEY_STATE_KEY = 'future_day7_survey_state_v1';

const PAGE_NAMES = new Set([
  'today', 'week', 'month', 'year', 'journal', 'notes', 'radio', 'settings', 'unknown',
]);

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fallbackUuid() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getAnonymousTestId() {
  try {
    const saved = localStorage.getItem(ID_KEY);
    if (saved) return saved;
    const id = crypto.randomUUID ? crypto.randomUUID() : fallbackUuid();
    localStorage.setItem(ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID ? crypto.randomUUID() : fallbackUuid();
  }
}

function ensureFirstSeen(date = new Date()) {
  const today = localDateString(date);
  try {
    const saved = localStorage.getItem(FIRST_SEEN_KEY);
    if (saved) return saved;
    localStorage.setItem(FIRST_SEEN_KEY, today);
  } catch { /* device-local trigger is best effort */ }
  return today;
}

function calendarDayNumber(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

function getSurveyState() {
  try {
    return JSON.parse(localStorage.getItem(SURVEY_STATE_KEY) || 'null');
  } catch {
    return null;
  }
}

function isDay7SurveyEligible(date = new Date()) {
  if (getSurveyState()) return false;
  const first = calendarDayNumber(ensureFirstSeen(date));
  const current = calendarDayNumber(localDateString(date));
  return first != null && current != null && current - first >= 6;
}

function markSurveyHandled(status) {
  try {
    localStorage.setItem(SURVEY_STATE_KEY, JSON.stringify({
      status,
      at: new Date().toISOString(),
    }));
  } catch { /* device-local trigger is best effort */ }
}

function currentFeedbackPage() {
  const page = String(window.__futureFeedbackPage || 'unknown');
  return PAGE_NAMES.has(page) ? page : 'unknown';
}

async function postFeedback(path, payload) {
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('network');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'submit_failed');
    error.code = data.code || '';
    throw error;
  }
}

function submitFeedback({ feedbackType, pageName, message }) {
  return postFeedback('/api/feedback', {
    feedback_type: feedbackType,
    page_name: PAGE_NAMES.has(pageName) ? pageName : 'unknown',
    message_optional: String(message || '').trim(),
    anonymous_test_id: getAnonymousTestId(),
  });
}

function submitDay7Survey({ usageDays, usedFeatures, reopenIntent, primaryReason, desiredChange }) {
  return postFeedback('/api/day7-survey', {
    usage_days: usageDays,
    used_features: usedFeatures,
    reopen_intent: reopenIntent,
    primary_reason: primaryReason,
    desired_change_optional: String(desiredChange || '').trim(),
    anonymous_test_id: getAnonymousTestId(),
  });
}

export {
  FIRST_SEEN_KEY,
  ID_KEY,
  SURVEY_STATE_KEY,
  currentFeedbackPage,
  ensureFirstSeen,
  getAnonymousTestId,
  getSurveyState,
  isDay7SurveyEligible,
  localDateString,
  markSurveyHandled,
  submitDay7Survey,
  submitFeedback,
};
