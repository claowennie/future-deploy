// Supabase cloud sync + auth UI
import React from 'react';
import ReactDOM from 'react-dom';
import { createClient } from '@supabase/supabase-js';
import { useStore } from './store.jsx';
import { migrateNoteImages } from './images.js';
import { stripSeedData } from './data.js';
import { appConfirm, appAlert } from './modal.jsx';
import { openPrivacy } from './privacy.jsx';
import { t } from './i18n.js';
import { clearTtsKeys } from './tts-client.js';
import { clearCompanionConfig } from './companion-client.js';

const { useState: _u_s, useEffect: _u_e, useRef: _u_r, useCallback: _u_c } = React;

// === Initialize client ===
const sbClient = (() => {
  try {
    if (!window.SUPABASE_CONFIG) return null;
    return createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  } catch (e) { console.warn('Supabase init failed:', e); return null; }
})();
window.sbClient = sbClient;

// Supabase 的报错是英文的，把常见的几条翻成当前界面语言的人话；不认识的原样给出。
function friendlyAuthError(msg) {
  const m = String(msg || '');
  if (/invalid login credentials/i.test(m)) return t('auth.errBadLogin');
  if (/email not confirmed/i.test(m)) return t('auth.errUnconfirmed');
  if (/already registered/i.test(m)) return t('auth.errExists');
  if (/rate limit|too many|security purposes/i.test(m)) return t('auth.errRate');
  if (/token has expired|invalid.*token|otp.*expired|expired.*otp/i.test(m)) return t('auth.errOtp');
  if (/at least 6|password should be/i.test(m)) return t('auth.errPwShort');
  if (/unable to validate email|invalid format/i.test(m)) return t('auth.errEmail');
  if (/failed to fetch|network/i.test(m)) return t('auth.errNetwork');
  return m || t('auth.errGeneric');
}

// 在 app 内用验证码完成重置时，verifyOtp 也会触发 PASSWORD_RECOVERY 事件 ——
// 那个事件是给「点邮件链接回站」的路径准备的。置位这个标记让 AccountWidget
// 跳过它的弹窗，避免刚设完新密码又被要求再设一次。
let suppressRecoveryModal = false;

// ===== 密码强度规则（注册 / 重设密码时强制；登录不受影响，老密码照常能登）=====
const PW_RULES = [
  { test: (p) => p.length >= 8, label: () => t('auth.pwRule1') },
  { test: (p) => /[a-zA-Z]/.test(p), label: () => t('auth.pwRule2') },
  { test: (p) => /\d/.test(p), label: () => t('auth.pwRule3') },
  { test: (p) => /[^a-zA-Z0-9\s]/.test(p), label: () => t('auth.pwRule4') },
];
// 满足了上面四条但仍然一眼就能猜到的，也拦下来
const COMMON_PW = new Set([
  'password1!', 'p@ssw0rd', 'p@ssword1', 'passw0rd!', 'qwerty123!', 'abc123456!',
  'a1234567!', '12345678a!', 'aa123456!', 'admin123!', 'iloveyou1!',
]);
function pwProblems(p) {
  const fails = PW_RULES.filter((r) => !r.test(p || '')).map((r) => r.label());
  if (!fails.length && COMMON_PW.has(String(p).toLowerCase())) fails.push(t('auth.pwCommon'));
  return fails;
}

// 实时显示每条规则的达成情况（绿勾 = 已满足）
function PwChecklist({ value }) {
  const common = !PW_RULES.some((r) => !r.test(value || '')) && COMMON_PW.has(String(value).toLowerCase());
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px', marginTop: 6 }}>
      {PW_RULES.map((r, i) => {
        const ok = r.test(value || '');
        return (
          <span key={i} style={{ fontSize: 11, color: ok ? 'var(--success)' : 'var(--ink-soft)', transition: 'color 120ms' }}>
            {ok ? '✓' : '·'} {r.label()}
          </span>
        );
      })}
      {common && <span style={{ fontSize: 11, color: 'var(--danger)' }}>× {t('auth.pwCommon')}</span>}
    </div>
  );
}

// 密码输入框 + 显示/隐藏切换（眼睛按钮）
function PwInput({ value, onChange, placeholder, autoComplete, autoFocus, minLength = 6 }) {
  const [show, setShow] = _u_s(false);
  return (
    <div style={{ position: 'relative', display: 'flex' }}>
      <input type={show ? 'text' : 'password'} required minLength={minLength} value={value}
        onChange={onChange} placeholder={placeholder}
        autoComplete={autoComplete} autoFocus={autoFocus}
        style={{ flex: 1, paddingRight: 38 }} />
      <button type="button" onClick={() => setShow((s) => !s)}
        aria-label={show ? t('auth.hidePw') : t('auth.showPw')} title={show ? t('auth.hidePw') : t('auth.showPw')}
        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          border: 'none', background: 'transparent', cursor: 'pointer', padding: 4,
          color: 'var(--ink-soft)', display: 'flex', alignItems: 'center' }}>
        {show ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        )}
      </button>
    </div>
  );
}

// ====== Auth modal ======
// Email + password sign-in / sign-up / forgot-password（验证码主路径；邮件链接 →
// PASSWORD_RECOVERY → ResetPasswordModal 作为备路径）。
function AuthModal({ open, onClose, onSignedIn }) {
  const [mode, setMode] = _u_s('signin'); // signin | signup | forgot | reset
  const [email, setEmail] = _u_s('');
  const [password, setPassword] = _u_s('');
  const [code, setCode] = _u_s('');   // reset 模式：邮件里的 6 位验证码
  const [pw2, setPw2] = _u_s('');     // reset 模式：新密码再输一遍
  const [loading, setLoading] = _u_s(false);
  const [err, setErr] = _u_s('');
  const [info, setInfo] = _u_s('');

  _u_e(() => { if (open) { setErr(''); setInfo(''); } }, [open]);

  if (!open) return null;

  const goMode = (m) => { setMode(m); setErr(''); setInfo(''); setPassword(''); setCode(''); setPw2(''); };

  const TITLES = {
    signin: [t('auth.titleSignin'), t('auth.subSignin')],
    signup: [t('auth.titleSignup'), t('auth.subSignup')],
    forgot: [t('auth.titleForgot'), t('auth.subForgot')],
    reset: [t('auth.titleReset'), t('auth.subReset')],
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    setErr(''); setInfo(''); setLoading(true);
    try {
      if (mode === 'signin') {
        const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onSignedIn?.(data.user);
      } else if (mode === 'signup') {
        const probs = pwProblems(password);
        if (probs.length) { setErr(t('auth.pwWeakPrefix') + probs.join(t('auth.pwJoin'))); setLoading(false); return; }
        const { data, error } = await sbClient.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          onSignedIn?.(data.user);
        } else {
          // Supabase 开了邮箱验证：引导用户去收件箱，而不是叫他改后台设置
          setInfo(t('auth.signupOk'));
        }
      } else if (mode === 'forgot') {
        // 发重置邮件。邮件里是 6 位验证码（模板也可能带链接，链接走 PASSWORD_RECOVERY 路径，
        // 两条路都通）。发完直接切到「输验证码 + 设新密码」表单，不依赖任何跳转配置。
        const { error } = await sbClient.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setMode('reset');
        setInfo(t('auth.codeSent'));
      } else {
        // reset：先校验强度和两次一致，再用验证码换登录态，最后设新密码。
        const probs = pwProblems(password);
        if (probs.length) { setErr(t('auth.pwWeakPrefix') + probs.join(t('auth.pwJoin'))); setLoading(false); return; }
        if (password !== pw2) { setErr(t('auth.pwMismatch')); setLoading(false); return; }
        suppressRecoveryModal = true; // 重置已在本表单完成，别再弹链接路径的那个窗
        const { data, error } = await sbClient.auth.verifyOtp({
          email, token: code.trim(), type: 'recovery',
        });
        if (error) throw error;
        const { error: e2 } = await sbClient.auth.updateUser({ password });
        if (e2) throw e2;
        onSignedIn?.(data.user); // 验证码本身就完成了登录，新密码下次用
      }
    } catch (ex) {
      setErr(friendlyAuthError(ex.message));
    } finally {
      setLoading(false);
    }
  };

  return ReactDOM.createPortal((
    <div className="auth-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="auth-modal">
        <button className="auth-close" onClick={onClose} aria-label="close">×</button>
        <div className="auth-head">
          <div className="auth-title serif">{TITLES[mode][0]}</div>
          <div className="auth-sub">{TITLES[mode][1]}</div>
        </div>
        <form onSubmit={submit} className="auth-form">
          <label className="auth-label">{t('auth.labelEmail')}
            <input type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" autoFocus={mode !== 'reset'}
              autoComplete="email" readOnly={mode === 'reset'} />
          </label>
          {mode === 'reset' && (
            <label className="auth-label">{t('auth.labelCode')}
              <input type="text" required inputMode="numeric" pattern="[0-9]*"
                minLength={6} maxLength={8} value={code} autoFocus
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('auth.phCode')}
                autoComplete="one-time-code" />
            </label>
          )}
          {mode !== 'forgot' && (
            <label className="auth-label">{mode === 'reset' ? t('auth.labelNewPw') : t('auth.labelPw')}
              <PwInput value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signin' ? t('auth.phPwSignin') : t('auth.phPwNew')}
                minLength={mode === 'signin' ? 6 : 8}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
              {mode !== 'signin' && <PwChecklist value={password} />}
            </label>
          )}
          {mode === 'reset' && (
            <label className="auth-label">{t('auth.labelConfirm')}
              <PwInput value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder={t('auth.phPw2')} minLength={8} autoComplete="new-password" />
            </label>
          )}
          {err && <div className="auth-err">{err}</div>}
          {info && <div className="auth-info">{info}</div>}
          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? t('auth.btnLoading') :
              mode === 'signin' ? t('auth.btnSignin') :
              mode === 'signup' ? t('auth.btnSignup') :
              mode === 'forgot' ? t('auth.btnForgot') : t('auth.btnReset')}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'signin' && (
            <>{t('auth.firstTime')}<button type="button" onClick={() => goMode('signup')}>{t('auth.createAcct')}</button>
            <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>
            <button type="button" onClick={() => goMode('forgot')}>{t('auth.forgotQ')}</button></>
          )}
          {mode === 'signup' && (
            <>{t('auth.haveAcct')}<button type="button" onClick={() => goMode('signin')}>{t('auth.goSignin')}</button></>
          )}
          {mode === 'forgot' && (
            <>{t('auth.remembered')}<button type="button" onClick={() => goMode('signin')}>{t('auth.backSignin')}</button></>
          )}
          {mode === 'reset' && (
            <>{t('auth.notReceived')}<button type="button" onClick={() => goMode('forgot')}>{t('auth.resend')}</button>
            <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>
            <button type="button" onClick={() => goMode('signin')}>{t('auth.backSignin')}</button></>
          )}
        </div>

        <div className="auth-foot">
          {t('auth.foot')}
          <button type="button" className="privacy-link" onClick={openPrivacy}>{t('privacy.link')}</button>
        </div>
      </div>
    </div>
  ), document.body);
}

// ====== Reset-password modal（点了重置邮件链接回到站点后弹出）======
// 邮件链接带的 token 会让 supabase-js 自动登录并触发 PASSWORD_RECOVERY 事件，
// 这里只负责收新密码 → updateUser。成功后用户就是登录态，数据照常同步。
function ResetPasswordModal({ open, onClose }) {
  const [pw, setPw] = _u_s('');
  const [pw2, setPw2] = _u_s('');
  const [loading, setLoading] = _u_s(false);
  const [err, setErr] = _u_s('');
  const [done, setDone] = _u_s(false);

  if (!open) return null;

  const submit = async (e) => {
    e?.preventDefault?.();
    const probs = pwProblems(pw);
    if (probs.length) { setErr(t('auth.pwWeakPrefix') + probs.join(t('auth.pwJoin'))); return; }
    if (pw !== pw2) { setErr(t('auth.pwMismatch')); return; }
    setErr(''); setLoading(true);
    try {
      const { error } = await sbClient.auth.updateUser({ password: pw });
      if (error) throw error;
      setDone(true);
    } catch (ex) {
      setErr(friendlyAuthError(ex.message));
    } finally {
      setLoading(false);
    }
  };

  return ReactDOM.createPortal((
    <div className="auth-overlay" onClick={(e) => { if (e.target === e.currentTarget && done) onClose(); }}>
      <div className="auth-modal">
        <button className="auth-close" onClick={onClose} aria-label="close">×</button>
        <div className="auth-head">
          <div className="auth-title serif">{done ? t('auth.resetDoneTitle') : t('auth.resetTitle')}</div>
          <div className="auth-sub">{done ? t('auth.resetDoneSub') : t('auth.resetSub')}</div>
        </div>
        {done ? (
          <button className="btn btn-primary auth-submit" onClick={onClose}>{t('auth.resetStart')}</button>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <label className="auth-label">{t('auth.labelNewPw')}
              <PwInput value={pw} autoFocus
                onChange={(e) => setPw(e.target.value)}
                placeholder={t('auth.phPwNew')} minLength={8} autoComplete="new-password" />
              <PwChecklist value={pw} />
            </label>
            <label className="auth-label">{t('auth.labelConfirm')}
              <PwInput value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder={t('auth.phPw2')} minLength={8} autoComplete="new-password" />
            </label>
            {err && <div className="auth-err">{err}</div>}
            <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
              {loading ? t('auth.btnLoading') : t('auth.resetSave')}
            </button>
          </form>
        )}
      </div>
    </div>
  ), document.body);
}

// ====== Account widget (in sidebar) ======
function AccountWidget() {
  const store = useStore();
  const [user, setUser] = _u_s(null);
  const [openAuth, setOpenAuth] = _u_s(false);
  // 从重置密码邮件链接回来时（PASSWORD_RECOVERY），弹设新密码的窗口
  const [recoveryOpen, setRecoveryOpen] = _u_s(false);
  const [syncStatus, setSyncStatus] = _u_s('idle'); // idle | syncing | synced | error | offline
  const [settingsOpen, setSettingsOpen] = _u_s(false); // 设置弹窗（⚙，三种登录态都有入口）
  const lastSyncedRef = _u_r('');
  const debounceRef = _u_r(null);
  // Gate uploads until the first pull of this session has reconciled, so a
  // device that just opened with stale local data can't push it over newer
  // cloud data before it has even seen the cloud.
  const hasPulledRef = _u_r(false);

  // Refs so the async sync helpers always read the *latest* state/user/etc
  // without retriggering effects whenever the state changes.
  const stateRef = _u_r(store.state); stateRef.current = store.state;
  const userRef = _u_r(user); userRef.current = user;
  const applyCloudRef = _u_r(store.applyCloudState); applyCloudRef.current = store.applyCloudState;

  // 新用户引导的「我已有账号，去登录」通过这个事件直接拉起登录弹窗
  _u_e(() => {
    const onOpen = () => setOpenAuth(true);
    window.addEventListener('future:open-auth', onOpen);
    return () => window.removeEventListener('future:open-auth', onOpen);
  }, []);

  // Subscribe to auth state changes
  _u_e(() => {
    if (!sbClient) { setSyncStatus('offline'); return; }
    sbClient.auth.getUser().then(({ data }) => setUser(data.user || null));
    const { data: sub } = sbClient.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (_event === 'PASSWORD_RECOVERY' && !suppressRecoveryModal) setRecoveryOpen(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const uploadNow = async (explicit) => {
    const u = userRef.current;
    if (!u || !sbClient) return;
    const payload = explicit || stateRef.current;
    const nowIso = new Date().toISOString();
    const { error } = await sbClient
      .from('planner_data')
      .upsert({ user_id: u.id, data: payload, updated_at: nowIso });
    if (error) throw error;
    lastSyncedRef.current = JSON.stringify(payload);
    localStorage.setItem('last_synced_at_' + u.id, String(new Date(nowIso).getTime()));
  };

  // Fetch cloud and reconcile. Used by login, focus, polling, and realtime.
  //
  // Conflict-safe protocol (replaces the old blob last-write-wins, which let a
  // stale device clobber newer data irreversibly):
  //   · cloud empty            → seed it from local (if local non-empty)
  //   · no unsynced local edits → clean pull: cloud wins (back up local first)
  //   · unsynced local edits + cloud changed → CONFLICT → MERGE the two (union,
  //     never lose), apply the merge, and push it back so devices converge.
  // Every overwrite/merge backs up the current local state first (planner_backups_v1).
  const pullNow = async () => {
    const u = userRef.current;
    if (!u || !sbClient) return;
    try {
      setSyncStatus('syncing');
      const { data, error } = await sbClient
        .from('planner_data')
        .select('data, updated_at')
        .eq('user_id', u.id)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;

      const local = stateRef.current;
      const localLastEdit = parseInt(localStorage.getItem('last_edit_at') || '0', 10);
      const localLastSync = parseInt(localStorage.getItem('last_synced_at_' + u.id) || '0', 10);
      const localHasUnsynced = localLastEdit > localLastSync;

      const cloudHasContent = data && data.data && !window.isEmptyState(data.data);
      if (!cloudHasContent) {
        // Cloud empty or stub — seed it from local, but only if we actually
        // have something (never push an empty/seed state over a real cloud).
        hasPulledRef.current = true;
        if (!window.isEmptyState(local)) await uploadNow(local);
        setSyncStatus('synced');
        return;
      }

      const cloudJson = JSON.stringify(data.data);
      if (cloudJson === lastSyncedRef.current) {
        hasPulledRef.current = true;
        setSyncStatus('synced');
        return;
      }

      if (!localHasUnsynced) {
        // Clean pull — nothing local to protect, so cloud wins. Back up first.
        window.pushBackup && window.pushBackup('cloud-pull');
        lastSyncedRef.current = cloudJson;
        localStorage.setItem('last_synced_at_' + u.id, String(new Date(data.updated_at).getTime()));
        applyCloudRef.current(data.data);
      } else {
        // CONFLICT: we have edits the cloud never saw, AND the cloud changed.
        // Merge instead of choosing a loser — the union keeps both sides.
        // 合并前先把本地里的示例条目剔掉（防示例数据混进真实账号的历史 bug）。
        window.pushBackup && window.pushBackup('conflict-merge');
        const merged = window.mergeStates ? window.mergeStates(stripSeedData(local), data.data) : local;
        applyCloudRef.current(merged);
        await uploadNow(merged); // push the union so the other device converges to it
      }
      hasPulledRef.current = true;
      setSyncStatus('synced');
    } catch (e) {
      console.warn('sync pull failed:', e);
      setSyncStatus('error');
    }
  };

  // Initial pull on login
  _u_e(() => { if (user && sbClient) pullNow(); }, [user]);

  // 存量笔记里的 base64 图片迁去 Storage：登录且本会话首次同步完成后跑一次。
  // 幂等（迁完就没有 data: 图了），失败的下次会话重试；迁移本身算一次本地编辑，
  // 会照常 debounce 上传，云端 blob 随之瘦身。
  const migratedRef = _u_r(false);
  _u_e(() => {
    if (!user || syncStatus !== 'synced' || migratedRef.current) return;
    migratedRef.current = true;
    // 1) 清洗历史混入的示例数据（无混入时是 no-op，不触发同步）
    store.setState((s) => stripSeedData(s));
    // 2) 存量 base64 图片迁上云
    migrateNoteImages(store).then((n) => {
      if (n) console.log(`[images] 已把 ${n} 条笔记的图片迁移到云端存储`);
    }).catch(() => { migratedRef.current = false; });
  }, [user, syncStatus]);

  // Pull when the tab regains focus — fastest reaction for the
  // "edited on phone, switched to laptop" case.
  _u_e(() => {
    if (!user || !sbClient) return;
    const onVisible = () => { if (document.visibilityState === 'visible') pullNow(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [user]);

  // Periodic poll (15s) — handles the "both devices left open" case
  _u_e(() => {
    if (!user || !sbClient) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') pullNow();
    }, 15000);
    return () => clearInterval(timer);
  }, [user]);

  // Realtime push — instant if Replication is enabled on planner_data in
  // Supabase Dashboard → Database → Replication. Silently degrades to the
  // 15s poll above if not enabled, so this is safe to leave on either way.
  _u_e(() => {
    if (!user || !sbClient) return;
    const channel = sbClient
      .channel(`planner_data:${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'planner_data',
        filter: `user_id=eq.${user.id}`,
      }, () => pullNow())
      .subscribe();
    return () => { sbClient.removeChannel(channel); };
  }, [user]);

  // Debounced upload on local edits
  _u_e(() => {
    if (!user || !sbClient) return;
    // Don't upload before the first pull has reconciled this session, and only
    // push when there's a genuine local edit since the last sync — together
    // these stop a freshly-opened, stale device from overwriting the cloud.
    if (!hasPulledRef.current) return;
    const lastEdit = parseInt(localStorage.getItem('last_edit_at') || '0', 10);
    const lastSync = parseInt(localStorage.getItem('last_synced_at_' + user.id) || '0', 10);
    if (lastEdit <= lastSync) return;
    const snapshot = JSON.stringify(store.state);
    if (snapshot === lastSyncedRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSyncStatus('syncing');
    debounceRef.current = setTimeout(async () => {
      try {
        await uploadNow();
        setSyncStatus('synced');
      } catch (e) {
        console.warn('sync upload failed:', e);
        setSyncStatus('error');
      }
    }, 1500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [store.state, user]);

  // ⚙ 设置（数据备份/恢复/登出/隐私/注销）：账号框里唯一的按钮，三种登录态都能点到。
  // 登出和恢复备份也收在设置里（signOutAndClear / RestorePicker，见下方模块级实现）。
  // SettingsModal 来自 settings.jsx，经 window 引用避免 sync ↔ settings 循环 import。
  const gearBtn = (
    <button className="account-gear" onClick={() => setSettingsOpen(true)} title={t('settings.gearTitle')} aria-label={t('settings.gearTitle')}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
    </button>
  );
  const settingsModal = window.SettingsModal
    ? <window.SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} signedIn={!!user} />
    : null;

  if (!sbClient) {
    return (
      <div className="account-row">
        <div className="account-widget account-offline" style={{ marginTop: 0 }}>
          <span className="dot dot-offline"></span>
          <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{t('account.offline')}</span>
        </div>
        {gearBtn}
        {settingsModal}
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <div className="account-row">
          <button className="account-widget account-cta" style={{ marginTop: 0 }} onClick={() => setOpenAuth(true)}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{t('account.cta')}</span>
            <span style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginLeft: 4 }}>{t('account.ctaSub')}</span>
          </button>
          {gearBtn}
        </div>
        <AuthModal open={openAuth} onClose={() => setOpenAuth(false)} onSignedIn={() => setOpenAuth(false)} />
        <ResetPasswordModal open={recoveryOpen} onClose={() => setRecoveryOpen(false)} />
        {settingsModal}
      </>
    );
  }

  const statusText = {
    idle: t('account.statusIdle'),
    syncing: t('account.statusSyncing'),
    synced: t('account.statusSynced'),
    error: t('account.statusError'),
    offline: t('account.statusOffline'),
  }[syncStatus] || t('account.statusIdle');

  const initial = (user.email || '?').charAt(0).toUpperCase();
  const displayEmail = (user.email || '').replace(/(.{2}).*(@.*)/, '$1***$2');

  return (
    <>
      <div className="account-widget account-active">
        <div className="account-avatar">{initial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="account-email">{displayEmail}</div>
          <div className="account-status">
            <span className={`dot dot-${syncStatus}`}></span>
            {statusText}
          </div>
        </div>
        <button className="account-signout account-gear-inline" onClick={() => setSettingsOpen(true)} title={t('settings.gearTitle')} aria-label={t('settings.gearTitle')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
      {/* 重置链接点开时 supabase 会直接把人登进来，所以这个弹窗多数时候在已登录分支弹 */}
      <ResetPasswordModal open={recoveryOpen} onClose={() => setRecoveryOpen(false)} />
      {settingsModal}
    </>
  );
}

// ===== 登出（设置弹窗里调用）=====
// 登出 = 清空这台设备上的数据（多用户安全：下一个登录的人不该看到、也不该
// 合并上一个人的数据）。清空前自动备份一份（设置里的「恢复自动备份」可找回），
// 云端数据下次登录即回。
async function signOutAndClear() {
  if (!sbClient) return;
  if (!await appConfirm({
    title: t('account.signOutConfirmTitle'),
    message: t('account.signOutConfirmMsg'),
    confirmText: t('account.signOutBtn'), danger: true,
  })) return;
  try { window.pushBackup && window.pushBackup('sign-out'); } catch { /* ignore */ }
  await sbClient.auth.signOut();
  try {
    sessionStorage.removeItem('future_deepseek_key_session');
    sessionStorage.removeItem('future_deepseek_key_owner');
    clearTtsKeys();
    clearCompanionConfig();
    localStorage.removeItem('study_planner_v2');
    localStorage.removeItem('study_planner_v1');
    localStorage.removeItem('last_edit_at');
    // 未发布的笔记草稿也属于个人内容，一并清掉
    Object.keys(localStorage)
      .filter((k) => k.startsWith('notes_draft'))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
  location.reload();
}

// ===== 自动备份恢复选择器 =====
// 列出 planner_backups_v1 里的滚动备份（新的在前），点一条进入确认。替代原 prompt() 输编号。
// 入口在设置弹窗的「恢复自动备份」（settings.jsx import 过去用）。
function RestorePicker({ open, onClose, onPick }) {
  _u_e(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  const list = (window.listBackups ? window.listBackups() : []).slice().reverse();
  return ReactDOM.createPortal((
    <div className="auth-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="auth-modal bkp-modal">
        <button className="auth-close" onClick={onClose}>×</button>
        <div className="auth-head">
          <div className="auth-title serif">{t('restore.title')}</div>
          <div className="auth-sub">{t('restore.sub')}</div>
        </div>
        <div className="bkp-list">
          {list.map((b) => (
            <button key={b.i} className="bkp-row" onClick={() => onPick(b)}>
              <span className="bkp-when">{b.when}</span>
              <span className="bkp-meta">{(b.size / 1024).toFixed(0)} KB{b.reason ? ` · ${b.reason}` : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  ), document.body);
}

// ===== 注销账号（永久删除云端一切）=====
// 客户端按 RLS 能删自己的数据行和图片；删 auth 用户本身需要服务端权限 —— 走
// 后台预先建好的 delete_user() RPC（SECURITY DEFINER，见 supabase/delete_user.sql，
// 在 Supabase Dashboard → SQL Editor 执行一次即可）。
// 顺序很重要：先删数据和图片（此时还有登录态、RLS 放行），最后删用户。
async function clearPrivateStorageFolder(bucket, folder) {
  const pageSize = 100;
  while (true) {
    const { data: files, error: listError } = await sbClient.storage
      .from(bucket)
      .list(folder, { limit: pageSize, offset: 0 });
    if (listError) {
      if (listError.status === 404 || /bucket not found/i.test(listError.message || '')) return;
      throw listError;
    }
    if (!files?.length) return;
    const paths = files.filter((file) => file.name && file.id).map((file) => `${folder}/${file.name}`);
    if (!paths.length) return;
    const { error: removeError } = await sbClient.storage.from(bucket).remove(paths);
    if (removeError) throw removeError;
    if (files.length < pageSize) return;
  }
}

async function deleteAccount() {
  if (!sbClient) { appAlert({ title: t('delAcct.notConfigTitle'), message: t('delAcct.notConfigMsg') }); return; }
  const { data } = await sbClient.auth.getUser();
  const user = data && data.user;
  if (!user) { appAlert({ title: t('delAcct.needLoginTitle'), message: t('delAcct.needLoginMsg') }); return; }

  if (!await appConfirm({
    title: t('delAcct.step1Title'),
    message: t('delAcct.step1Msg'),
    confirmText: t('delAcct.step1Btn'), danger: true,
  })) return;
  if (!await appConfirm({
    title: t('delAcct.step2Title'),
    message: t('delAcct.step2Msg', { email: user.email }),
    confirmText: t('delAcct.step2Btn'), danger: true,
  })) return;

  try {
    // 1) 笔记图片（私有桶 note-images/<user_id>/...）
    await clearPrivateStorageFolder('note-images', user.id);
    // 2) Melo 私有曲库（radio-audio/<user_id>/...）
    await clearPrivateStorageFolder('radio-audio', user.id);
    // 3) 云端规划数据行；radio_* 表会在 auth 用户删除时级联清理
    await sbClient.from('planner_data').delete().eq('user_id', user.id);
    // 4) auth 用户（RPC）
    const { error } = await sbClient.rpc('delete_user');
    if (error) throw error;
    // 5) 本机清理（与登出同款；planner_backups_v1 留着当本机最后的后悔药）
    try { await sbClient.auth.signOut(); } catch { /* 用户已删，session 可能已失效 */ }
    try {
      sessionStorage.removeItem('future_deepseek_key_session');
      sessionStorage.removeItem('future_deepseek_key_owner');
      clearTtsKeys();
      clearCompanionConfig();
      localStorage.removeItem('study_planner_v2');
      localStorage.removeItem('study_planner_v1');
      localStorage.removeItem('last_edit_at');
      Object.keys(localStorage).filter((k) => k.startsWith('notes_draft')).forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    await appAlert({ title: t('delAcct.doneTitle'), message: t('delAcct.doneMsg') });
    location.reload();
  } catch (e) {
    appAlert({
      title: t('delAcct.failTitle'),
      message: (e && e.message ? e.message : String(e)) + t('delAcct.failHint'),
    });
  }
}

window.AccountWidget = AccountWidget;
window.AuthModal = AuthModal;
window.deleteAccount = deleteAccount;

export { AccountWidget, AuthModal, deleteAccount, signOutAndClear, RestorePicker };
