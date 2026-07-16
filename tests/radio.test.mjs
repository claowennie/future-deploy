import assert from 'node:assert/strict';
import {
  normalizeModel, RadioOutputError, validateRadioPayload, validateTastePayload,
} from '../worker/deepseek.js';
import { buildRadioPrompt, filterRecentCompanionPlaylist } from '../worker/radio-prompt.js';
import radioWorker from '../worker/index.js';
import { parseYouTubePlaylistUrl } from '../src/radio-client.js';
import {
  isCompanionTrackNearEnd, mapCompanionVolumeToPlayback, markCompanionPlaybackStarted,
  normalizeCompanionVolume,
} from '../src/companion-client.js';

const candidates = [
  { id: 'track-a', artist: 'Artist A', title: 'Song A', storage_path: 'user/track-a.mp3' },
  { id: 'track-b', artist: 'Artist B', title: 'Song B', storage_path: 'user/track-b.mp3' },
];

console.log('radio.test:');

assert.equal(normalizeModel('deepseek-v4-pro'), 'deepseek-v4-pro');
assert.equal(normalizeModel('deepseek-chat'), 'deepseek-v4-flash');
assert.equal(validateTastePayload({ taste: 'Mostly English indie pop.' }), 'Mostly English indie pop.');
assert.throws(() => validateTastePayload({ taste: '' }), RadioOutputError);

assert.deepEqual(parseYouTubePlaylistUrl('https://music.youtube.com/playlist?list=PL1234567890abc'), {
  provider: 'youtube',
  id: 'PL1234567890abc',
  url: 'https://www.youtube.com/playlist?list=PL1234567890abc',
});
assert.equal(parseYouTubePlaylistUrl(''), null);
assert.throws(() => parseYouTubePlaylistUrl('https://youtube.com.evil.example/playlist?list=PL1234567890abc'));
assert.throws(() => parseYouTubePlaylistUrl('https://www.youtube.com/watch?v=abc'));

assert.equal(isCompanionTrackNearEnd({ status: 'playing', position: 7, duration: 229 }), false);
assert.equal(isCompanionTrackNearEnd({ status: 'playing', position: 220, duration: 229 }), true);
assert.equal(isCompanionTrackNearEnd({ status: 'stopped', position: 229, duration: 229 }), false);
assert.equal(isCompanionTrackNearEnd({ status: 'playing', position: 0, duration: 0 }), false);
assert.equal(normalizeCompanionVolume(0), 0);
assert.equal(normalizeCompanionVolume('58.6'), 59);
assert.equal(normalizeCompanionVolume(101), 100);
assert.equal(normalizeCompanionVolume('invalid', 70), 70);
assert.equal(mapCompanionVolumeToPlayback(0), 0);
assert.equal(mapCompanionVolumeToPlayback(10), 45);
assert.equal(mapCompanionVolumeToPlayback(50), 78);
assert.equal(mapCompanionVolumeToPlayback(100), 100);

assert.deepEqual(markCompanionPlaybackStarted({
  ok: true,
  action: 'play_index',
  track: { name: 'Yellow', artists: ['Coldplay'] },
  state: { status: 'paused', position: 0, duration: 0, currentIndex: 0 },
}), {
  ok: true,
  action: 'play_index',
  track: { name: 'Yellow', artists: ['Coldplay'] },
  state: {
    status: 'playing', position: 0, duration: 0, currentIndex: 0,
    title: 'Yellow', artist: 'Coldplay',
  },
});

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
assert.match(prompt, /companionPlaylist/);
assert.match(prompt, /Never say “我去网易云找”/);
assert.match(prompt, /Taste is the identity baseline/);
assert.match(prompt, /75-90%/);
assert.match(prompt, /language of this website.*not evidence/);
assert.match(prompt, /OUTPUT LANGUAGE IS ENGLISH/);
assert.match(prompt, /9-10 条具体/);
assert.doesNotMatch(prompt, /Claudio/);
assert.doesNotMatch(prompt, /storage_path|user\/track-a\.mp3/);

const varied = filterRecentCompanionPlaylist([
  { title: 'Healing', artist: 'In Love With A Ghost', query: 'Healing In Love With A Ghost' },
  { title: 'A Walk', artist: 'Tycho', query: 'A Walk Tycho' },
], [
  { title: 'healing, in love with a ghost!', artist: '' },
]);
assert.deepEqual(varied, [
  { title: 'A Walk', artist: 'Tycho', query: 'A Walk Tycho' },
]);

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
  companionPlaylist: [],
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
  companionPlaylist: [],
});
assert.throws(() => validateRadioPayload({
  reply: 'No playlist.',
  playlistAction: 'play',
  set: [],
}, []), RadioOutputError);

const expandedCompanionPlaylist = Array.from({ length: 10 }, (_, index) => ({
  title: `Playable Song ${index + 1}`,
  artist: `Original Artist ${index + 1}`,
  query: `Playable Song ${index + 1} Original Artist ${index + 1}`,
  intro: `这是第 ${index + 1} 首歌的独立串词。`,
}));
const expandedCompanionResult = validateRadioPayload({
  reply: '我多准备几首，筛选后也能保持完整的一组。',
  companionAction: 'search_and_play',
  companionPlaylist: expandedCompanionPlaylist,
  companionQueries: expandedCompanionPlaylist.map((track) => track.query),
  set: [],
}, [], { hasCompanion: true });
assert.equal(expandedCompanionResult.companionPlaylist.length, 10);
assert.equal(expandedCompanionResult.companionQueries.length, 10);

const companionPrompt = buildRadioPrompt({
  text: '在网易云播放起风了',
  tracks: [],
  hasCompanion: true,
  now: new Date('2026-07-15T12:00:00Z'),
});
assert.match(companionPrompt, /网易云本机桥/);
assert.match(companionPrompt, /search_and_play/);
assert.match(companionPrompt, /title 与 artist 分开/);
assert.match(companionPrompt, /宁可跳过/);
assert.match(companionPrompt, /硬性排除清单/);
assert.match(companionPrompt, /同一位歌手在整组中最多出现 1 首/);
assert.match(companionPrompt, /优先避开【最近播放过】里已经出现过的歌手/);
assert.deepEqual(validateRadioPayload({
  reply: '好，我去网易云找两首适合现在的。',
  playlistAction: 'none',
  companionAction: 'search_and_play',
  companionQuery: 'Yellow Coldplay',
  companionQueries: ['Yellow Coldplay', 'Sparks Coldplay'],
  companionPlaylist: [
    { title: 'Yellow', artist: 'Coldplay', query: 'Yellow Coldplay', intro: '先用这首熟悉的暖意，把现在的疲惫慢慢松开。' },
    { title: 'Sparks', artist: 'Coldplay', query: 'Sparks Coldplay', intro: '接下来收一点力气，这首更安静，也更贴近你此刻的节奏。' },
  ],
  set: [],
}, [], { hasCompanion: true }), {
  reply: '好，我去找两首适合现在的。',
  set: [],
  playlistAction: 'none',
  companionAction: 'search_and_play',
  companionQuery: 'Yellow Coldplay',
  companionQueries: ['Yellow Coldplay', 'Sparks Coldplay'],
  companionPlaylist: [
    { title: 'Yellow', artist: 'Coldplay', query: 'Yellow Coldplay', intro: '先用这首熟悉的暖意，把现在的疲惫慢慢松开。' },
    { title: 'Sparks', artist: 'Coldplay', query: 'Sparks Coldplay', intro: '接下来收一点力气，这首更安静，也更贴近你此刻的节奏。' },
  ],
});
assert.throws(() => validateRadioPayload({
  reply: '我去找。',
  companionAction: 'search_and_play',
  companionQueries: ['起风了 周深'],
  set: [],
}, [], { hasCompanion: true }), RadioOutputError);
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
