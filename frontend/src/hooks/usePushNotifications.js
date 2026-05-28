import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const arr     = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

/**
 * usePushNotifications — manages Web Push subscription lifecycle.
 *
 * Returns:
 *  supported  {bool}   — browser supports push
 *  permission {string} — 'default' | 'granted' | 'denied'
 *  subscribed {bool}   — currently subscribed
 *  subscribe  {fn}     — request permission + subscribe
 *  unsubscribe {fn}    — unsubscribe
 */
export function usePushNotifications() {
  const supported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager'   in window
    && 'Notification'  in window;

  const [permission,  setPermission]  = useState(supported ? Notification.permission : 'denied');
  const [subscribed,  setSubscribed]  = useState(false);
  const [checking,    setChecking]    = useState(false);

  // Check current subscription status on mount
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    }).catch(() => {});
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported) return false;
    try {
      // Get VAPID public key
      const { publicKey } = await api.get('/push/vapid-key');
      if (!publicKey) throw new Error('Servidor não suporta push');

      // Request notification permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return false;

      // Register service worker subscription
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Send to backend
      const json = sub.toJSON();
      await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
      setSubscribed(true);
      return true;
    } catch (err) {
      console.warn('[Push] subscribe error:', err.message);
      return false;
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const json = sub.toJSON();
        await api.delete('/push/unsubscribe', { data: { endpoint: json.endpoint } });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      console.warn('[Push] unsubscribe error:', err.message);
    }
  }, [supported]);

  return { supported, permission, subscribed, subscribe, unsubscribe };
}
