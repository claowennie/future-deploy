// 设置弹窗 —— 用户可达的「设置」唯一入口（账号框里的 ⚙ 齿轮，三种登录态都有）。
// 背景：导出/导入、清空数据、注销账号最初放在 Tweaks 面板里，但 Tweaks 只能被
// Claude 编辑环境的 postMessage 协议打开，部署后的站点上没有任何入口 ——
// 对用户来说等于功能不存在。这里给它们一个真正的家。
// 登出和恢复自动备份原来是账号框上的 ⎋/⟲ 小图标，按钮太挤后也收进了这里。
// （AccountWidget 经 window.SettingsModal 渲染本组件，避免 sync ↔ settings 循环引用。）
import React from 'react';
import ReactDOM from 'react-dom';
import { DataBackupButtons } from './components.jsx';
import { appConfirm, appAlert } from './modal.jsx';
import { openPrivacy } from './privacy.jsx';
import { deleteAccount, signOutAndClear, RestorePicker } from './sync.jsx';
import { t, getLocale, setLocale } from './i18n.js';
import { getNotifPrefs, setNotifPrefs, notifSupported, notifPermission, requestNotifPermission } from './notify.js';
import { pushSupported, getPushSubscription, subscribePush, unsubscribePush, syncPushPrefs } from './push.js';
import { openFeedback } from './feedback.jsx';

const { useEffect, useState } = React;

// 提醒设置：主通知开关（反映浏览器权限三态）+ 习惯打卡每日提醒及时间 + 远程推送（Web Push）。
function NotifSettings({ signedIn }) {
  const [perm, setPerm] = useState(notifPermission());
  const [prefs, setPrefs] = useState(getNotifPrefs());
  // 远程推送：本机是否已订阅。null = 还在查；查到了订阅就 true。
  const [pushOn, setPushOn] = useState(null);
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (pushSupported()) getPushSubscription().then((s) => { if (alive) setPushOn(!!s); });
    else setPushOn(false);
    return () => { alive = false; };
  }, []);
  if (!notifSupported()) {
    return (
      <div className="set-section">
        <div className="set-label">{t('notify.sectionLabel')}</div>
        <div className="set-hint">{t('notify.unsupported')}</div>
      </div>
    );
  }

  const showDeniedHelp = () => appAlert({ title: t('notify.deniedHelpTitle'), message: t('notify.deniedHelpMsg') });

  // 主开关：denied → 教用户去浏览器设置解封；default → 申请权限并开启；
  // granted → 在 enabled 真假间切换。（申请后若被用户拒绝，转成 denied 也给指引。）
  const onMaster = async () => {
    if (perm === 'denied') { showDeniedHelp(); return; }
    if (perm !== 'granted') {
      const ok = await requestNotifPermission();
      setPerm(notifPermission());
      if (ok) setPrefs(setNotifPrefs({ enabled: true }));
      else if (notifPermission() === 'denied') showDeniedHelp();
      return;
    }
    setPrefs(setNotifPrefs({ enabled: !prefs.enabled }));
  };

  const masterOn = perm === 'granted' && prefs.enabled !== false;
  const masterLabel = perm === 'denied' ? t('notify.denied')
    : perm !== 'granted' ? t('notify.enable')
    : prefs.enabled !== false ? t('notify.on') : t('notify.off');
  const masterTitle = perm === 'denied' ? t('notify.deniedTitle')
    : perm !== 'granted' ? t('notify.enableTitle')
    : prefs.enabled !== false ? t('notify.onTitle') : t('notify.offTitle');

  const toggleHabit = async () => {
    // 想开提醒但还没授权：denied → 教去设置；default → 弹权限询问；都没成 → 说明还没授权。
    if (!prefs.habitReminder && perm !== 'granted') {
      if (perm === 'denied') { showDeniedHelp(); return; }
      const ok = await requestNotifPermission();
      setPerm(notifPermission());
      if (!ok) {
        if (notifPermission() === 'denied') showDeniedHelp();
        else appAlert({ title: t('notify.notAuthedTitle'), message: t('notify.notAuthedMsg') });
        return;
      }
      setPrefs(setNotifPrefs({ enabled: true, habitReminder: true }));
      return;
    }
    setPrefs(setNotifPrefs({ habitReminder: !prefs.habitReminder }));
    if (pushOn) syncPushPrefs();   // 已订阅远程推送 → 把新偏好同步到服务端那一行
  };
  const setTime = (e) => {
    if (!e.target.value) return;
    setPrefs(setNotifPrefs({ habitTime: e.target.value }));
    if (pushOn) syncPushPrefs();
  };
  const toggleWeekReview = () => {
    setPrefs(setNotifPrefs({ weekReview: prefs.weekReview === false }));
    if (pushOn) syncPushPrefs();
  };

  // 远程推送主开关：开 = 订阅并落库（需登录 + 通知权限）；关 = 退订并删这台设备的订阅。
  const togglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushOn) {
        await unsubscribePush();
        setPushOn(false);
        return;
      }
      const r = await subscribePush();
      setPerm(notifPermission());
      if (r.ok) { setPushOn(true); setPrefs(getNotifPrefs()); return; }
      // 失败：按原因给指引
      if (r.reason === 'denied') { showDeniedHelp(); return; }
      if (r.reason === 'no-login') { appAlert({ title: t('notify.pushNeedLoginTitle'), message: t('notify.pushNeedLoginMsg') }); return; }
      if (r.reason === 'unsupported') { appAlert({ title: t('notify.pushUnsupportedTitle'), message: t('notify.pushUnsupportedMsg') }); return; }
      appAlert({ title: t('notify.pushFailTitle'), message: t('notify.pushFailMsg') });
    } finally {
      setPushBusy(false);
    }
  };

  const pushLabel = pushBusy ? t('notify.pushBusy') : pushOn ? t('notify.pushOn') : t('notify.pushOff');

  return (
    <div className="set-section">
      <div className="set-label">{t('notify.sectionLabel')}</div>
      <div className="set-row">
        <button className={`btn btn-ghost set-btn ${masterOn ? 'set-active' : ''}`}
          onClick={onMaster} title={masterTitle}>{masterLabel}</button>
        <button className={`btn btn-ghost set-btn ${prefs.habitReminder ? 'set-active' : ''}`}
          onClick={toggleHabit} title={t('notify.habitReminder')}>{t('notify.habitReminder')}</button>
        {prefs.habitReminder && (
          <label className="set-inline">
            <span>{t('notify.habitAt')}</span>
            <input type="time" value={prefs.habitTime ?? '20:00'} onChange={setTime} />
          </label>
        )}
      </div>
      <div className="set-hint">{t('notify.hint')}</div>

      {/* 远程推送（Web Push）：app 关着也能收。需登录 + 浏览器支持。 */}
      {pushSupported() && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--line)' }}>
          <div className="set-row">
            {signedIn ? (
              <button className={`btn btn-ghost set-btn ${pushOn ? 'set-active' : ''}`}
                onClick={togglePush} disabled={pushBusy || pushOn === null} title={t('notify.pushTitle')}>
                {pushLabel}
              </button>
            ) : (
              <span className="set-hint" style={{ margin: 0 }}>{t('notify.pushNeedLogin')}</span>
            )}
            {signedIn && pushOn && (
              <button className={`btn btn-ghost set-btn ${prefs.weekReview !== false ? 'set-active' : ''}`}
                onClick={toggleWeekReview} title={t('notify.pushWeekReview')}>{t('notify.pushWeekReview')}</button>
            )}
          </div>
          <div className="set-hint">{t('notify.pushHint')}</div>
        </div>
      )}
    </div>
  );
}

function SettingsModal({ open, onClose, signedIn }) {
  const [restoreOpen, setRestoreOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;

  const clearLocal = async () => {
    if (await appConfirm({
      title: t('settings.clearTitle'),
      message: t('settings.clearMsg'),
      confirmText: t('settings.clearBtn'), danger: true,
    })) {
      localStorage.removeItem('study_planner_v1');
      localStorage.removeItem('study_planner_v2');
      localStorage.removeItem('last_edit_at');
      location.reload();
    }
  };

  const loadSample = async () => {
    if (await appConfirm({
      title: t('settings.sampleTitle'),
      message: t('settings.sampleMsg'),
      confirmText: t('settings.sampleBtn'),
    })) {
      localStorage.setItem('study_planner_v2', JSON.stringify(window.SEED));
      localStorage.removeItem('last_edit_at');
      location.reload();
    }
  };

  // 从自动备份恢复（每次云端覆盖/合并/登出前都会自动留一份，这里是找回入口）
  const openRestore = () => {
    const list = window.listBackups ? window.listBackups() : [];
    if (!list.length) {
      appAlert({ title: t('restore.noneTitle'), message: t('restore.noneMsg') });
      return;
    }
    setRestoreOpen(true);
  };
  const doRestore = async (b) => {
    setRestoreOpen(false);
    if (!await appConfirm({
      title: t('restore.confirmTitle'),
      message: t('restore.confirmMsg', { when: b.when + (b.reason ? ' · ' + b.reason : '') }),
      confirmText: t('restore.confirmBtn'), danger: true,
    })) return;
    if (window.restoreBackup && window.restoreBackup(b.i)) {
      setTimeout(() => location.reload(), 150);
    } else {
      appAlert({ title: t('restore.failTitle'), message: t('restore.failMsg') });
    }
  };

  return ReactDOM.createPortal((
    <div className="auth-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="auth-modal settings-modal">
        <button className="auth-close" onClick={onClose}>×</button>
        <div className="modal-scroll-body">
          <div className="auth-head">
            <div className="auth-title serif">{t('settings.title')}</div>
            <div className="auth-sub">{t('settings.sub')}</div>
          </div>

          <div className="set-section">
            <div className="set-label">{t('settings.langLabel')}</div>
            <div className="set-row">
              <button className={`btn btn-ghost set-btn ${getLocale() === 'zh' ? 'set-active' : ''}`}
                onClick={() => setLocale('zh')}>中文</button>
              <button className={`btn btn-ghost set-btn ${getLocale() === 'en' ? 'set-active' : ''}`}
                onClick={() => setLocale('en')}>English</button>
            </div>
          </div>

          <NotifSettings signedIn={signedIn} />

          <div className="set-section">
            <div className="set-label">{t('settings.dataLabel')}</div>
            <DataBackupButtons />
            <div className="set-row">
              <button className="btn btn-ghost set-btn" onClick={openRestore}>{t('settings.restoreBackup')}</button>
              <button className="btn btn-ghost set-btn" onClick={loadSample}>{t('settings.loadSample')}</button>
              <button className="btn btn-ghost set-btn set-danger" onClick={clearLocal}>{t('settings.clearLocal')}</button>
            </div>
          </div>

          <div className="set-section">
            <div className="set-label">{t('settings.helpLabel')}</div>
            <div className="set-row">
              <button className="btn btn-ghost set-btn" onClick={() => {
                onClose();
                setTimeout(() => openFeedback({ pageName: 'settings' }), 0);
              }}>{t('settings.feedbackButton')}</button>
            </div>
            <div className="set-hint">{t('settings.feedbackHint')}</div>
          </div>

          <div className="set-section">
            <div className="set-label">{t('settings.privacyLabel')}</div>
            <div className="set-row">
              <button className="btn btn-ghost set-btn" onClick={openPrivacy}>{t('settings.privacyPolicy')}</button>
              {signedIn && (
                <button className="btn btn-ghost set-btn" onClick={() => { onClose(); signOutAndClear(); }}>
                  {t('account.signOutBtn')}
                </button>
              )}
              <button className="btn btn-ghost set-btn set-danger"
                onClick={() => { onClose(); deleteAccount(); }}>
                {t('settings.deleteAccount')}
              </button>
            </div>
            <div className="set-hint">{t('settings.hint')}</div>
          </div>
        </div>
      </div>

      <RestorePicker open={restoreOpen} onClose={() => setRestoreOpen(false)} onPick={doRestore} />
    </div>
  ), document.body);
}

Object.assign(window, { SettingsModal });

export { SettingsModal };
