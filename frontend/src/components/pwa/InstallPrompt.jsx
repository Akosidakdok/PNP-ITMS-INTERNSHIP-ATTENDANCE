import { useState, useEffect } from 'react';
import { Download, Share, X, Smartphone, Plus, MoreVertical } from 'lucide-react';
import usePWAInstall from '../../hooks/usePWAInstall.js';

const SESSION_KEY = 'pnp_install_dismissed';

export default function InstallPrompt() {
  const { isIOS, isAndroid, isInstalled, canInstall, triggerInstall } = usePWAInstall();
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Don't show if already installed as a PWA or dismissed this session
    if (isInstalled) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    // Show on iOS (Safari manual steps)
    if (isIOS) {
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }

    // Show on Android — either native prompt (canInstall) or manual fallback
    if (isAndroid) {
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }
  }, [isIOS, isAndroid, isInstalled, canInstall]);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem(SESSION_KEY, '1');
  };

  const handleAndroidInstall = async () => {
    if (!canInstall) return;
    setInstalling(true);
    const accepted = await triggerInstall();
    setInstalling(false);
    if (accepted) dismiss();
  };

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm"
        onClick={dismiss}
        aria-hidden="true"
      />

      {/* Modal — bottom sheet on mobile, centered card on desktop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Install PNP-ITMS App"
        className="fixed z-[9999] bottom-0 left-0 right-0 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-sm w-full"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        <div
          className="relative rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
          style={{ background: '#fff' }}
        >
          {/* Header gradient */}
          <div
            className="relative flex flex-col items-center pt-8 pb-6 px-6"
            style={{ background: 'linear-gradient(135deg, #001240 0%, #003087 60%, #0050c8 100%)' }}
          >
            {/* Close button */}
            <button
              onClick={dismiss}
              aria-label="Dismiss install prompt"
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* App icon */}
            <div
              className="w-20 h-20 rounded-2xl overflow-hidden mb-3 shadow-lg border-2 border-white/20"
              style={{ background: '#fff' }}
            >
              <img
                src="/ITMS_LOGO.png"
                alt="PNP-ITMS Logo"
                className="w-full h-full object-contain"
              />
            </div>

            <h2 className="text-xl font-bold text-white mb-0.5" style={{ fontFamily: 'Outfit, sans-serif' }}>
              PNP-ITMS
            </h2>
            <p className="text-blue-200 text-sm text-center leading-tight">
              Internship Management System
            </p>

            {/* Platform badge */}
            <div className="mt-3 flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1">
              <Smartphone className="w-3.5 h-3.5 text-white" />
              <span className="text-white text-xs font-medium">
                {isIOS ? 'iOS App' : 'Android App'}
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 pt-5 pb-6">
            {isIOS ? (
              <IOSInstructions onDismiss={dismiss} />
            ) : (
              <AndroidPrompt
                canInstall={canInstall}
                installing={installing}
                onInstall={handleAndroidInstall}
                onDismiss={dismiss}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Android Prompt ─────────────────────────────────────────── */
function AndroidPrompt({ canInstall, installing, onInstall, onDismiss }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="font-semibold text-gray-800 text-base mb-1">Install as an App</p>
        <p className="text-gray-500 text-sm leading-relaxed">
          Add PNP-ITMS to your home screen for faster access and a full-screen experience — no browser needed.
        </p>
      </div>

      {/* Benefits */}
      <ul className="space-y-1.5">
        {[
          '⚡ Instant launch from your home screen',
          '📴 Works even with limited connectivity',
          '🔔 No browser bar — feels like a native app',
        ].map((item) => (
          <li key={item} className="text-sm text-gray-600">{item}</li>
        ))}
      </ul>

      {canInstall ? (
        /* Native one-tap install */
        <button
          id="pwa-install-android-btn"
          onClick={onInstall}
          disabled={installing}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white text-sm transition-all active:scale-95 disabled:opacity-60"
          style={{
            background: installing ? '#6aaeff' : 'linear-gradient(135deg, #003087, #0060e6)',
            boxShadow: '0 4px 16px rgba(0,48,135,0.35)',
          }}
        >
          <Download className="w-4 h-4" />
          {installing ? 'Installing…' : 'Install App'}
        </button>
      ) : (
        /* Manual fallback — Chrome menu steps */
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">How to install:</p>
          {[
            {
              icon: <MoreVertical className="w-4 h-4 text-white" />,
              label: 'Tap the ⋮ menu',
              detail: 'Tap the three-dot menu in the top-right corner of Chrome.',
            },
            {
              icon: <Plus className="w-4 h-4 text-white" />,
              label: 'Tap "Add to Home screen"',
              detail: 'Scroll down in the menu and tap "Add to Home screen".',
            },
            {
              icon: <Smartphone className="w-4 h-4 text-white" />,
              label: 'Tap "Add" to confirm',
              detail: 'Tap "Add" in the dialog. The app icon will appear on your home screen.',
            },
          ].map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #003087, #0060e6)' }}
              >
                {s.icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  <span className="text-blue-600 mr-1">Step {i + 1}.</span>{s.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{s.detail}</p>
              </div>
            </div>
          ))}

          {/* Visual hint */}
          <div
            className="rounded-2xl p-3 flex items-center gap-2 border"
            style={{ background: '#f8faff', borderColor: '#d4e8ff' }}
          >
            <MoreVertical className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="text-xs text-gray-600">
              <span className="font-medium">⋮ Menu</span> → <span className="font-medium">Add to Home screen</span> → <span className="font-medium">Add</span>
            </p>
          </div>
        </div>
      )}

      <button
        id="pwa-dismiss-android-btn"
        onClick={onDismiss}
        className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
      >
        Maybe Later
      </button>
    </div>
  );
}

/* ── iOS Instructions ───────────────────────────────────────── */
function IOSInstructions({ onDismiss }) {
  const steps = [
    {
      icon: <Share className="w-5 h-5 text-white" />,
      label: 'Tap the Share button',
      detail: 'Look for the share icon at the bottom of Safari — a box with an arrow pointing up.',
    },
    {
      icon: <Plus className="w-5 h-5 text-white" />,
      label: 'Tap "Add to Home Screen"',
      detail: 'Scroll down in the Share menu until you see "Add to Home Screen" and tap it.',
    },
    {
      icon: <Smartphone className="w-5 h-5 text-white" style={{ color: '#16a34a' }} />,
      label: 'Tap "Add" to confirm',
      detail: 'Confirm the name "PNP-ITMS" and tap "Add" in the top-right corner. Done!',
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="font-semibold text-gray-800 text-base mb-1">Add to Home Screen</p>
        <p className="text-gray-500 text-sm leading-relaxed">
          Follow these 3 steps in <strong>Safari</strong> to install PNP-ITMS on your iPhone or iPad.
        </p>
      </div>

      {/* Safari warning */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
        <span className="text-amber-500 text-base mt-0.5">⚠️</span>
        <p className="text-xs text-amber-700">
          Must use <strong>Safari</strong>. If you're in Chrome or another browser, open this page in Safari first.
        </p>
      </div>

      {/* Steps */}
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
              style={{ background: i === 2 ? 'linear-gradient(135deg, #16a34a, #22c55e)' : 'linear-gradient(135deg, #003087, #0060e6)' }}
            >
              {s.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800 leading-tight">
                <span className="text-blue-600 mr-1">Step {i + 1}.</span>{s.label}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Visual hint */}
      <div
        className="rounded-2xl p-3 flex items-center gap-3 border"
        style={{ background: '#f8faff', borderColor: '#d4e8ff' }}
      >
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #003087, #0060e6)' }}>
            <Share className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-gray-400 text-xs">→</span>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-gray-100 border border-gray-200">
            <Plus className="w-3.5 h-3.5 text-gray-600" />
          </div>
        </div>
        <p className="text-xs text-gray-600 leading-snug">
          <span className="font-medium">Share</span> → <span className="font-medium">Add to Home Screen</span>
        </p>
      </div>

      <button
        id="pwa-dismiss-ios-btn"
        onClick={onDismiss}
        className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
      >
        Maybe Later
      </button>
    </div>
  );
}
