import assert from 'node:assert/strict';
import { normalizeModel, RadioOutputError, validateRadioPayload } from '../worker/deepseek.js';
import { buildRadioPrompt } from '../worker/radio-prompt.js';
import radioWorker from '../worker/index.js';
import { parseYouTubePlaylistUrl } from '../src/radio-client.js';

const candidates = [
  { id: 'track-a', artist: 'Artist A', title: 'Song A', storage_path: 'user/track-a.mp3' },
  { id: 'track-b', artist: 'Artist B', title: 'Song B', storage_path: 'user/track-b.mp3' },
];

console.log('radio.test:');

assert.equal(normalizeModel('deepseek-v4-pro'), 'deepseek-v4-pro');
assert.equal(normalizeModel('deepseek-chat'), 'deepseek-v4-flash');

assert.deepEqual(parseYouTubePlaylistUrl('https://music.youtube.com/playlist?list=PL1234567890abc'), {
  provider: 'youtube',
  id: 'PL1234567890abc',
  url: 'https://www.youtube.com/playlist?list=PL1234567890abc',
});
assert.equal(parseYouTubePlaylistUrl(''), null);
assert.throws(() => parseYouTubePlaylistUrl('https://youtube.com.evil.example/playlist?list=PL1234567890abc'));
assert.throws(() => parseYouTubePlaylistUrl('https://www.youtube.com/watch?v=abc'));

const prompt = buildRadioPrompt({
  text: 'Play something calm',
  lang: 'en',
  taste: 'Ambient and post-rock',
  tracks: candidates,
  messages: [{ role: 'user', content: 'Long day.' }],
  plays: [],
  now: new Date('2026-07-15T12:00:00Z'),
});
assert.match(prompt, /track-a/);
assert.match(prompt, /Play something calm/);
assert.match(prompt, /You are Melo/);
assert.doesNotMatch(prompt, /Claudio/);
assert.doesNotMatch(prompt, /storage_path|user\/track-a\.mp3/);

const result = validateRadioPayload({
  reply: 'Let us slow things down.',
  set: [{ trackId: 'track-a', intro: 'Start here.', hue: 725 }],
}, candidates);
assert.deepEqual(result, {
  reply: 'Let us slow things down.',
  set: [{
    id: 'track-a',
    artist: 'Artist A',
    title: 'Song A',
    storagePath: 'user/track-a.mp3',
    intro: 'Start here.',
    hue: 5,
  }],
  playlistAction: 'none',
  companionAction: 'none',
  companionQuery: '',
  companionQueries: [],
});

const playlistPrompt = buildRadioPrompt({
  text: 'Play my playlist',
  lang: 'en',
  tracks: [],
  hasExternalPlaylist: true,
  now: new Date('2026-07-15T12:00:00Z'),
});
assert.match(playlistPrompt, /YouTube \/ YouTube Music/);
assert.match(playlistPrompt, /playlistAction/);

assert.deepEqual(validateRadioPayload({
  reply: 'Starting your playlist.',
  playlistAction: 'shuffle',
  set: [],
}, [], { hasExternalPlaylist: true }), {
  reply: 'Starting your playlist.',
  set: [],
  playlistAction: 'shuffle',
  companionAction: 'none',
  companionQuery: '',
  companionQueries: [],
});
assert.throws(() => validateRadioPayload({
  reply: 'No playlist.',
  playlistAction: 'play',
  set: [],
}, []), RadioOutputError);

const companionPrompt = buildRadioPrompt({
  text: '在网易云播放起风了',
  tracks: [],
  hasCompanion: true,
  now: new Date('2026-07-15T12:00:00Z'),
});
assert.match(companionPrompt, /网易云本机桥/);
assert.match(companionPrompt, /search_and_play/);
assert.deepEqual(validateRadioPayload({
  reply: '我让本机播放器去找这首歌。',
  playlistAction: 'none',
  companionAction: 'search_and_play',
  companionQuery: '起风了 周深',
  companionQueries: ['起风了 周深', '起风了 买辣椒也用券'],
  set: [],
}, [], { hasCompanion: true }), {
  reply: '我让本机播放器去找这首歌。',
  set: [],
  playlistAction: 'none',
  companionAction: 'search_and_play',
  companionQuery: '起风了 周深',
  companionQueries: ['起风了 周深', '起风了 买辣椒也用券'],
});
assert.throws(() => validateRadioPayload({
  reply: 'No bridge.',
  companionAction: 'next',
  set: [],
}, []), RadioOutputError);

assert.throws(
  () => validateRadioPayload({ reply: 'No.', set: [{ trackId: 'unknown', intro: 'No.', hue: 0 }] }, candidates),
  RadioOutputError,
);
assert.throws(
  () => validateRadioPayload({
    reply: 'No duplicates.',
    set: [
      { trackId: 'track-a', intro: 'One.', hue: 0 },
      { trackId: 'track-a', intro: 'Two.', hue: 1 },
    ],
  }, candidates),
  RadioOutputError,
);

const healthResponse = await radioWorker.fetch(
  new Request('https://future.example/api/radio/health'),
  { ASSETS: { fetch: () => new Response('asset') } },
  { waitUntil() {} },
);
assert.equal(healthResponse.status, 200);
assert.equal(healthResponse.headers.get('cache-control'), 'no-store');
const health = await healthResponse.json();
assert.deepEqual(health.models, ['deepseek-v4-flash', 'deepseek-v4-pro']);
assert.deepEqual(health.musicProviders, ['supabase-storage', 'youtube-playlist', 'netease-local-companion']);

const configResponse = await radioWorker.fetch(
  new Request('https://future.example/api/runtime-config.js'),
  {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    ASSETS: { fetch: () => new Response('asset') },
  },
  { waitUntil() {} },
);
assert.equal(configResponse.status, 200);
assert.equal(configResponse.headers.get('cache-control'), 'no-store');
assert.match(await configResponse.text(), /https:\/\/project\.supabase\.co/);

console.log('radio.test: all passed\n');
