import React from 'react';
import ReactDOM from 'react-dom';
import { t, getLocale } from './i18n.js';

const { useState, useEffect } = React;

let setPrivacyOpen = null;
function openPrivacy() { if (setPrivacyOpen) setPrivacyOpen(true); }

const UPDATED = '2026-07-16';

function ZhBody() {
  return (
    <div className="privacy-body">
      <h4>我们保存的数据</h4>
      <p>• <b>账号信息</b>：电子邮箱，用于登录和找回密码。</p>
      <p>• <b>应用数据</b>：待办、习惯、日记、笔记和 OKR 等。未登录时保存在浏览器；登录后同步到 Supabase。</p>
      <p>• <b>AI 电台数据</b>：电台偏好、YouTube 歌单链接、曲目元数据、最近对话与播放记录保存在 Supabase；音频保存在按账号隔离的私有存储桶。</p>

      <h4>AI 服务密钥</h4>
      <p>你的 DeepSeek、Google Cloud TTS 或 MiniMax Key 只保存在当前浏览器标签页的会话存储中。所选服务的 Key 会随请求临时发送给本站的 Cloudflare Worker，再由 Worker 转发给对应服务；不会写入 Supabase、构建文件或应用日志。关闭标签页、退出账号或删除账号时会清除。</p>
      <p>DeepSeek 会收到生成节目所需的偏好、最近电台对话、候选曲目元数据，以及是否已连接 YouTube 歌单；不会收到你的歌单链接或 YouTube 登录信息。请求使用你的 Key 计费，请勿在不信任的设备上输入。</p>
      <p>选择 Google 或 MiniMax 语音时，对应服务只会收到要朗读的 Melo 文本、语言和声线配置。语音请求使用你的 Key 计费；默认的浏览器语音不会调用这些云端语音服务。</p>

      <h4>访问控制与第三方服务</h4>
      <p>Supabase 数据库启用行级安全（RLS），每条记录和存储路径都绑定登录账号。本站使用 Supabase（登录、数据和私有音频）、Cloudflare Workers（托管与 API）、DeepSeek（电台文案生成）、可选的 Google Cloud TTS 或 MiniMax（云端语音）、YouTube 官方嵌入播放器（在线歌单播放）及可选的 Sentry（错误监控）。YouTube 登录在其官方播放器内完成，本站不会收到密码；第三方服务可能按各自隐私政策处理收到的数据。</p>

      <h4>错误报告</h4>
      <p>只有配置了 Sentry 的生产版本会发送错误堆栈；默认不收集个人身份信息，并在发送前过滤令牌、Key 和认证字段。电台请求正文不会被主动写入 Worker 日志。</p>

      <h4>你的控制权</h4>
      <p>• <b>导出</b>：设置中的“导出备份”可下载应用数据。</p>
      <p>• <b>删除</b>：注销账号会永久删除云端数据、笔记图片、私有电台音频及登录账号，无法恢复。</p>

      <h4>联系</h4>
      <p>隐私或数据请求：<b>claowennie@gmail.com</b>。</p>
    </div>
  );
}

function EnBody() {
  return (
    <div className="privacy-body">
      <h4>Data we store</h4>
      <p>• <b>Account information</b>: your email, used for sign-in and password recovery.</p>
      <p>• <b>App data</b>: tasks, habits, journal entries, notes, and OKRs. Signed-out data stays in the browser; signed-in data syncs to Supabase.</p>
      <p>• <b>AI radio data</b>: radio preferences, a YouTube playlist link, track metadata, recent radio messages, and play history in Supabase; audio files in a private, per-account storage bucket.</p>

      <h4>AI service keys</h4>
      <p>Your DeepSeek, Google Cloud TTS, or MiniMax key is stored in session storage for the current browser tab only. A request sends the selected provider's key temporarily to this site's Cloudflare Worker, which forwards it to that provider. Keys are not written to Supabase, build output, or application logs, and are cleared when the tab closes, you sign out, or you delete the account.</p>
      <p>DeepSeek receives the preferences, recent radio conversation, candidate track metadata, and whether a YouTube playlist is connected. It does not receive the playlist URL or YouTube sign-in information. Usage is billed to your Key.</p>
      <p>When Google or MiniMax speech is selected, that provider receives only the Melo text to synthesize, its language, and voice settings. Speech usage is billed to your key. The default browser voice does not call either cloud speech provider.</p>

      <h4>Access control and services</h4>
      <p>Supabase row-level security binds every row and storage path to its signed-in account. The site uses Supabase (auth, data, private audio), Cloudflare Workers (hosting and API), DeepSeek (radio generation), optional Google Cloud TTS or MiniMax (cloud speech), the official YouTube embedded player (online playlist playback), and optional Sentry (error monitoring). YouTube sign-in stays inside its player; third-party services may process received data under their own privacy policies.</p>

      <h4>Error reports</h4>
      <p>Only production builds configured with Sentry send stack traces. PII collection is disabled, and tokens, keys, and authentication fields are filtered before sending. The Worker does not intentionally log radio request bodies.</p>

      <h4>Your control</h4>
      <p>• <b>Export</b>: “Export backup” in Settings downloads app data.</p>
      <p>• <b>Delete</b>: deleting your account permanently removes cloud data, note images, private radio audio, and the account. This cannot be undone.</p>

      <h4>Contact</h4>
      <p>Privacy or data requests: <b>claowennie@gmail.com</b>.</p>
    </div>
  );
}

function PrivacyHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => { setPrivacyOpen = setOpen; return () => { setPrivacyOpen = null; }; }, []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;

  return ReactDOM.createPortal((
    <div className="auth-overlay" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="auth-modal privacy-modal">
        <button className="auth-close" onClick={() => setOpen(false)} aria-label={t('common.close')}>×</button>
        <div className="auth-head">
          <div className="auth-title serif">{t('privacy.title')}</div>
          <div className="auth-sub">{t('privacy.updated', { date: UPDATED })}</div>
        </div>
        {getLocale() === 'en' ? <EnBody /> : <ZhBody />}
      </div>
    </div>
  ), document.body);
}

Object.assign(window, { openPrivacy, PrivacyHost });

export { openPrivacy, PrivacyHost };
