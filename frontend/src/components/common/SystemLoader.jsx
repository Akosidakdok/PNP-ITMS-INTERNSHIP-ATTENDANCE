import { useEffect, useMemo, useState } from 'react';

const EDGE_SEGMENTS = 24;
const MINIMUM_DISPLAY_TIME = 2200;
const MAX_FALLBACK_TIMEOUT = 6000;

function getLoadingStatus(progress, systemLoading, waitingLong) {
  if (progress >= 100) return 'System ready';
  if (systemLoading && waitingLong) return 'Waking up secure server...';
  if (systemLoading && progress >= 72) return 'Establishing secure connection';
  if (progress >= 48) return 'Loading secure modules';
  return 'Initializing system';
}

export default function SystemLoader({ systemLoading = false }) {
  const [progress, setProgress] = useState(0);
  const [pageLoaded, setPageLoaded] = useState(document.readyState === 'complete');
  const [minimumTimeElapsed, setMinimumTimeElapsed] = useState(false);
  const [waitingLong, setWaitingLong] = useState(false);
  const [forceComplete, setForceComplete] = useState(false);
  const [phase, setPhase] = useState('visible');

  const edgeSegments = useMemo(
    () => Array.from({ length: EDGE_SEGMENTS }, (_, index) => index),
    []
  );

  useEffect(() => {
    if (document.readyState === 'complete') {
      setPageLoaded(true);
      return undefined;
    }

    const handleLoad = () => setPageLoaded(true);
    window.addEventListener('load', handleLoad, { once: true });
    // Safety timer in case window.load was already dispatched or sub-resources stall
    const pageTimer = window.setTimeout(() => setPageLoaded(true), 2500);
    return () => {
      window.removeEventListener('load', handleLoad);
      window.clearTimeout(pageTimer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setMinimumTimeElapsed(true),
      MINIMUM_DISPLAY_TIME
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    // If backend takes longer than 3.5s, update status to reassure user
    const waitTimer = window.setTimeout(() => {
      setWaitingLong(true);
    }, 3500);

    // Hard safety cap: after 6.0s, force finish the splash screen so user is never stuck
    const fallbackTimer = window.setTimeout(() => {
      setForceComplete(true);
    }, MAX_FALLBACK_TIMEOUT);

    return () => {
      window.clearTimeout(waitTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  const canFinish = forceComplete || (pageLoaded && minimumTimeElapsed && !systemLoading);

  useEffect(() => {
    if (phase !== 'visible') return undefined;

    const timer = window.setInterval(() => {
      setProgress((current) => {
        const limit = canFinish ? 100 : (systemLoading ? (waitingLong ? 94 : 88) : 94);
        const distance = limit - current;

        if (distance <= 0.08) return limit;

        const increment = canFinish
          ? Math.max(0.9, distance * 0.22)
          : Math.max(0.18, distance * 0.045);
        const next = Math.min(limit, current + increment);

        return canFinish && next >= 99.45 ? 100 : next;
      });
    }, 90);

    return () => window.clearInterval(timer);
  }, [canFinish, phase, systemLoading, waitingLong]);

  useEffect(() => {
    if (progress < 100 || phase !== 'visible') return undefined;

    const fadeTimer = window.setTimeout(() => setPhase('leaving'), 220);
    return () => window.clearTimeout(fadeTimer);
  }, [phase, progress]);

  useEffect(() => {
    if (phase !== 'leaving') return undefined;

    const removeTimer = window.setTimeout(() => setPhase('hidden'), 680);
    return () => window.clearTimeout(removeTimer);
  }, [phase]);

  if (phase === 'hidden') return null;

  const roundedProgress = Math.min(100, Math.round(progress));
  const loadingStatus = getLoadingStatus(roundedProgress, systemLoading, waitingLong);

  return (
    <div
      className={`system-loader${phase === 'leaving' ? ' system-loader--leaving' : ''}`}
      style={{ '--loader-progress': `${progress}%` }}
      role="status"
      aria-live="polite"
      aria-label={`${loadingStatus}. ${roundedProgress} percent`}
    >
      <div className="system-loader__frame" aria-hidden="true" />

      <div className="system-loader__classification" aria-hidden="true">
        <span className="system-loader__classification-rule" />
        <span>Official system access</span>
      </div>

      <main className="system-loader__content">
        <div className="system-loader__logo-stage" aria-hidden="true">
          <div className="system-loader__logo-shadow" />
          <div className="system-loader__logo-halo" />
          <div className="system-loader__logo-rotator">
            <div className="system-loader__logo-face system-loader__logo-face--front">
              <img src="/ITMS_LOGO.png" alt="" draggable="false" />
              <span className="system-loader__logo-highlight" />
            </div>

            <div className="system-loader__logo-face system-loader__logo-face--back">
              <img src="/ITMS_LOGO.png" alt="" draggable="false" />
              <span className="system-loader__logo-highlight" />
            </div>

            <span className="system-loader__logo-spine" />

            {edgeSegments.map((index) => (
              <span
                className="system-loader__logo-edge"
                style={{ '--edge-index': index }}
                key={index}
              />
            ))}
          </div>
        </div>

        <div className="system-loader__identity">
          <p className="system-loader__agency">Philippine National Police</p>
          <h1>PNP-IDTMS</h1>
          <p className="system-loader__subtitle">
            Information Technology and Data Management System
          </p>
          <div className="system-loader__status" aria-hidden="true">
            <span className="system-loader__status-dot" />
            <span>{loadingStatus}</span>
          </div>
          {waitingLong && phase === 'visible' && (
            <button
              type="button"
              onClick={() => setForceComplete(true)}
              className="system-loader__skip-btn"
            >
              Server waking up &bull; Click to proceed &rarr;
            </button>
          )}
        </div>
      </main>

      <aside className="system-loader__meter" aria-hidden="true">
        <span className="system-loader__meter-label">System initialization</span>
        <div className="system-loader__meter-track">
          <div className="system-loader__meter-fill" />
        </div>
        <span className="system-loader__percentage">
          {String(roundedProgress).padStart(2, '0')}<small>%</small>
        </span>
      </aside>

      <p className="system-loader__footer" aria-hidden="true">
        Secure internal information system
      </p>
    </div>
  );
}
