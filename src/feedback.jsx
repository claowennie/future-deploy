import React from 'react';
import ReactDOM from 'react-dom';
import { t, tArr } from './i18n.js';
import {
  currentFeedbackPage,
  ensureFirstSeen,
  getAnonymousTestId,
  isDay7SurveyEligible,
  markSurveyHandled,
  submitDay7Survey,
  submitFeedback,
} from './feedback-client.js';

const { useEffect, useState } = React;
const MESSAGE_LIMIT = 100;

let showFeedback = null;

function openFeedback(options = {}) {
  if (showFeedback) showFeedback({
    feedbackType: options.feedbackType || '',
    pageName: options.pageName || currentFeedbackPage(),
  });
}

function ChoiceList({ values, selected, onSelect, multiple = false }) {
  return (
    <div className={`feedback-choices ${multiple ? 'is-multiple' : ''}`}>
      {values.map((item) => {
        const active = multiple ? selected.includes(item.value) : selected === item.value;
        return (
          <button
            key={item.value}
            type="button"
            className={`feedback-choice ${active ? 'active' : ''}`}
            aria-pressed={active}
            onClick={() => onSelect(item.value)}
          >
            <span className="feedback-choice-mark" aria-hidden="true">{active ? '✓' : ''}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FeedbackModal({ initial, onClose }) {
  const [feedbackType, setFeedbackType] = useState(initial.feedbackType);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const types = tArr('feedback.types');

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async (event) => {
    event.preventDefault();
    if (!feedbackType || busy) return;
    setBusy(true);
    setError('');
    try {
      await submitFeedback({
        feedbackType,
        pageName: initial.pageName,
        message,
      });
      onClose('submitted');
    } catch (submitError) {
      setError(submitError.message === 'network'
        ? t('feedback.networkError')
        : (submitError.message || t('feedback.submitError')));
    } finally {
      setBusy(false);
    }
  };

  return ReactDOM.createPortal((
    <div className="auth-overlay feedback-overlay" onClick={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <form className="auth-modal feedback-modal" onSubmit={submit}>
        <button type="button" className="auth-close" onClick={() => onClose()} aria-label={t('common.close')}>×</button>
        <div className="auth-head">
          <div className="auth-title serif">{t('feedback.title')}</div>
          <div className="auth-sub">{t('feedback.sub')}</div>
        </div>

        <div className="feedback-question">
          <div className="feedback-label">{t('feedback.typeLabel')}</div>
          <ChoiceList values={types} selected={feedbackType} onSelect={setFeedbackType} />
        </div>

        <label className="feedback-question">
          <span className="feedback-label">{t('feedback.messageLabel')}</span>
          <textarea
            value={message}
            maxLength={MESSAGE_LIMIT}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t('feedback.messagePlaceholder')}
          />
          <span className="feedback-count">{Array.from(message).length}/{MESSAGE_LIMIT}</span>
        </label>

        <div className="feedback-privacy">{t('feedback.privacy')}</div>
        {error && <div className="auth-err">{error}</div>}
        <button className="btn btn-primary feedback-submit" type="submit" disabled={!feedbackType || busy}>
          {busy ? t('feedback.submitting') : t('feedback.submit')}
        </button>
      </form>
    </div>
  ), document.body);
}

function FeedbackHost() {
  const [initial, setInitial] = useState(null);
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    getAnonymousTestId();
    ensureFirstSeen();
    showFeedback = setInitial;
    return () => { showFeedback = null; };
  }, []);
  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(false), 2600);
    return () => clearTimeout(timer);
  }, [success]);
  return (
    <>
      {initial && <FeedbackModal initial={initial} onClose={(result) => {
        setInitial(null);
        if (result === 'submitted') setSuccess(true);
      }} />}
      {success && <div className="feedback-toast" role="status">{t('feedback.thanks')}</div>}
    </>
  );
}

function Day7SurveyModal({ onClose }) {
  const [usageDays, setUsageDays] = useState('');
  const [usedFeatures, setUsedFeatures] = useState([]);
  const [reopenIntent, setReopenIntent] = useState('');
  const [primaryReason, setPrimaryReason] = useState('');
  const [desiredChange, setDesiredChange] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const usageOptions = tArr('feedback.surveyUsage');
  const featureOptions = tArr('feedback.surveyFeatures');
  const intentOptions = tArr('feedback.surveyIntent');
  const reasonOptions = reopenIntent === 'yes'
    ? tArr('feedback.surveyReasonsYes')
    : tArr('feedback.surveyReasonsNo');

  useEffect(() => {
    setPrimaryReason('');
  }, [reopenIntent]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose('skipped'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const toggleFeature = (value) => {
    setUsedFeatures((current) => {
      if (value === 'none') return current.includes('none') ? [] : ['none'];
      const withoutNone = current.filter((item) => item !== 'none');
      return withoutNone.includes(value)
        ? withoutNone.filter((item) => item !== value)
        : [...withoutNone, value];
    });
  };

  const complete = usageDays && usedFeatures.length && reopenIntent && primaryReason;
  const submit = async (event) => {
    event.preventDefault();
    if (!complete || busy) return;
    setBusy(true);
    setError('');
    try {
      await submitDay7Survey({
        usageDays,
        usedFeatures,
        reopenIntent,
        primaryReason,
        desiredChange,
      });
      onClose('submitted');
    } catch (submitError) {
      setError(submitError.message === 'network'
        ? t('feedback.networkError')
        : (submitError.message || t('feedback.submitError')));
    } finally {
      setBusy(false);
    }
  };

  return ReactDOM.createPortal((
    <div className="auth-overlay feedback-overlay" onClick={(event) => {
      if (event.target === event.currentTarget && !busy) onClose('skipped');
    }}>
      <form className="auth-modal feedback-modal survey-modal" onSubmit={submit}>
        <button type="button" className="auth-close" onClick={() => onClose('skipped')} aria-label={t('common.close')}>×</button>
        <div className="modal-scroll-body">
          <div className="auth-head">
            <div className="auth-title serif">{t('feedback.surveyTitle')}</div>
            <div className="auth-sub feedback-survey-intro">{t('feedback.surveyIntro')}</div>
          </div>

          <div className="feedback-question">
            <div className="feedback-label">① {t('feedback.surveyQ1')}</div>
            <ChoiceList values={usageOptions} selected={usageDays} onSelect={setUsageDays} />
          </div>

          <div className="feedback-question">
            <div className="feedback-label">② {t('feedback.surveyQ2')}</div>
            <ChoiceList values={featureOptions} selected={usedFeatures} onSelect={toggleFeature} multiple />
          </div>

          <div className="feedback-question">
            <div className="feedback-label">③ {t('feedback.surveyQ3')}</div>
            <ChoiceList values={intentOptions} selected={reopenIntent} onSelect={setReopenIntent} />
          </div>

          {reopenIntent && (
            <div className="feedback-question">
              <div className="feedback-label">④ {t('feedback.surveyQ4')}</div>
              <ChoiceList values={reasonOptions} selected={primaryReason} onSelect={setPrimaryReason} />
            </div>
          )}

          <label className="feedback-question">
            <span className="feedback-label">{t('feedback.surveyChangeLabel')}</span>
            <textarea
              value={desiredChange}
              maxLength={MESSAGE_LIMIT}
              onChange={(event) => setDesiredChange(event.target.value)}
              placeholder={t('feedback.surveyChangePlaceholder')}
            />
            <span className="feedback-count">{Array.from(desiredChange).length}/{MESSAGE_LIMIT}</span>
          </label>

          <div className="feedback-privacy">{t('feedback.privacy')}</div>
          {error && <div className="auth-err">{error}</div>}
          <div className="feedback-actions">
            <button type="button" className="btn btn-ghost" onClick={() => onClose('skipped')} disabled={busy}>
              {t('feedback.skip')}
            </button>
            <button className="btn btn-primary" type="submit" disabled={!complete || busy}>
              {busy ? t('feedback.submitting') : t('feedback.submitSurvey')}
            </button>
          </div>
        </div>
      </form>
    </div>
  ), document.body);
}

function Day7SurveyHost() {
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    ensureFirstSeen();
    if (!isDay7SurveyEligible()) return undefined;
    let attempts = 0;
    let timer;
    const tryOpen = () => {
      attempts += 1;
      const anotherModal = document.querySelector('.auth-overlay');
      if (anotherModal && attempts < 60) return;
      if (anotherModal) {
        clearInterval(timer);
        return;
      }
      markSurveyHandled('shown');
      setOpen(true);
      clearInterval(timer);
    };
    timer = setInterval(tryOpen, 1000);
    const first = setTimeout(tryOpen, 1400);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, []);

  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(false), 2600);
    return () => clearTimeout(timer);
  }, [success]);

  return (
    <>
      {open && <Day7SurveyModal onClose={(status) => {
        markSurveyHandled(status);
        setOpen(false);
        if (status === 'submitted') setSuccess(true);
      }} />}
      {success && <div className="feedback-toast" role="status">{t('feedback.surveyThanks')}</div>}
    </>
  );
}

Object.assign(window, { openFeedback });

export { Day7SurveyHost, FeedbackHost, openFeedback };
