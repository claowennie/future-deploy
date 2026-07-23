import assert from 'node:assert/strict';
import {
  FeedbackError,
  validateFeedback,
  validateSurvey,
} from '../worker/feedback.js';
import { buildFeedbackDigest } from '../worker/feedback-digest.js';
import feedbackWorker from '../worker/index.js';
import {
  FIRST_SEEN_KEY,
  SURVEY_STATE_KEY,
  ensureFirstSeen,
  isDay7SurveyEligible,
  markSurveyHandled,
} from '../src/feedback-client.js';

console.log('feedback.test:');

const anonymousId = '550e8400-e29b-41d4-a716-446655440000';

assert.deepEqual(validateFeedback({
  feedback_type: 'cannot_find',
  page_name: 'week',
  message_optional: '周计划入口在哪里？',
  anonymous_test_id: anonymousId,
}), {
  feedback_type: 'cannot_find',
  page_name: 'week',
  message_optional: '周计划入口在哪里？',
  anonymous_test_id: anonymousId,
});

assert.throws(() => validateFeedback({
  feedback_type: 'other',
  page_name: 'today',
  message_optional: '',
  anonymous_test_id: anonymousId,
  task_content: 'private',
}), (error) => error instanceof FeedbackError && error.code === 'feedback_extra_fields');

assert.throws(() => validateFeedback({
  feedback_type: 'other',
  page_name: 'today',
  message_optional: '长'.repeat(101),
  anonymous_test_id: anonymousId,
}), (error) => error.code === 'message_optional_too_long');

assert.deepEqual(validateSurvey({
  usage_days: '3-4',
  used_features: ['today_todos', 'habits'],
  reopen_intent: 'yes',
  primary_reason: 'see_growth',
  desired_change_optional: '',
  anonymous_test_id: anonymousId,
}), {
  usage_days: '3-4',
  used_features: ['today_todos', 'habits'],
  reopen_intent: 'yes',
  primary_reason: 'see_growth',
  desired_change_optional: null,
  anonymous_test_id: anonymousId,
});

assert.throws(() => validateSurvey({
  usage_days: '1',
  used_features: ['none', 'notes'],
  reopen_intent: 'no',
  primary_reason: 'no_need',
  desired_change_optional: '',
  anonymous_test_id: anonymousId,
}), (error) => error.code === 'used_features_none_conflict');

assert.throws(() => validateSurvey({
  usage_days: '1',
  used_features: ['notes'],
  reopen_intent: 'yes',
  primary_reason: 'privacy',
  desired_change_optional: '',
  anonymous_test_id: anonymousId,
}), (error) => error.code === 'primary_reason_invalid');

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};
ensureFirstSeen(new Date(2026, 6, 17, 9));
assert.equal(memory.get(FIRST_SEEN_KEY), '2026-07-17');
assert.equal(isDay7SurveyEligible(new Date(2026, 6, 22, 9)), false);
assert.equal(isDay7SurveyEligible(new Date(2026, 6, 23, 9)), true);
markSurveyHandled('skipped');
assert.equal(isDay7SurveyEligible(new Date(2026, 6, 24, 9)), false);
assert.match(memory.get(SURVEY_STATE_KEY), /skipped/);
delete globalThis.localStorage;

const digest = buildFeedbackDigest([
  { feedback_type: 'feature_broken', page_name: 'today' },
  { feedback_type: 'feature_broken', page_name: 'today' },
  { feedback_type: 'cannot_find', page_name: 'week' },
], [
  { reopen_intent: 'yes' },
  { reopen_intent: 'unsure' },
], new Date('2026-07-23T01:00:00Z'));
assert.match(digest.subject, /Future 用户反馈周报/);
assert.match(digest.text, /功能出错：2/);
assert.match(digest.text, /会：1/);
assert.doesNotMatch(digest.text, /message_optional/);

const originalFetch = globalThis.fetch;
let storedBody = null;
globalThis.fetch = async (_url, options) => {
  storedBody = JSON.parse(options.body);
  return new Response(null, { status: 201 });
};
const response = await feedbackWorker.fetch(
  new Request('https://future.example/api/feedback', {
    method: 'POST',
    headers: {
      Origin: 'https://future.example',
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.7',
    },
    body: JSON.stringify({
      feedback_type: 'cumbersome',
      page_name: 'radio',
      message_optional: '配置步骤有点多',
      anonymous_test_id: anonymousId,
    }),
  }),
  {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-example',
    FEEDBACK_RATE_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: () => new Response('asset') },
  },
  { waitUntil() {} },
);
globalThis.fetch = originalFetch;
assert.equal(response.status, 201);
assert.equal(storedBody.message_optional, '配置步骤有点多');
assert.equal(storedBody.anonymous_test_id, anonymousId);

console.log('feedback.test: all passed\n');
