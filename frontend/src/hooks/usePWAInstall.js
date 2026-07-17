import { useState, useEffect, useRef } from 'react';

/**
 * usePWAInstall — detects platform and manages the install lifecycle.
 *
 * Returns:
 *   isIOS        — true if running on iOS (iPhone/iPad)
 *   isAndroid    — true if running on Android
 *   isInstalled  — true if already running as a standalone PWA
 *   canInstall   — true if the browser deferred prompt is ready (Android)
 *   triggerInstall — call this to open the native Android install dialog
 */
export default function usePWAInstall() {
  const deferredPromptRef = useRef(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || '';

    // Detect iOS (iPhone, iPad, iPod) — includes modern iPads that report as Mac
    const ios =
      /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Detect Android
    const android = /Android/i.test(ua);

    setIsIOS(ios);
    setIsAndroid(android);

    // Check if already installed / running in standalone mode
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    setIsInstalled(standalone);

    // Listen for Android's beforeinstallprompt event
    const handleBeforeInstall = (e) => {
      e.preventDefault(); // Stop browser from auto-showing its own prompt
      deferredPromptRef.current = e;
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // If app was installed after prompt was shown
    const handleInstalled = () => {
      setCanInstall(false);
      setIsInstalled(true);
      deferredPromptRef.current = null;
    };

    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const triggerInstall = async () => {
    if (!deferredPromptRef.current) return false;
    deferredPromptRef.current.prompt();
    const { outcome } = await deferredPromptRef.current.userChoice;
    deferredPromptRef.current = null;
    setCanInstall(false);
    return outcome === 'accepted';
  };

  return { isIOS, isAndroid, isInstalled, canInstall, triggerInstall };
}
