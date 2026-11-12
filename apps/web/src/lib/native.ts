// Native bridge. Everything here is a no-op in a plain browser and lights up
// inside the Capacitor shells (apps/mobile): background location for partners,
// FCM push, haptics, status bar, deep links. The web code never imports
// Capacitor plugins directly; it goes through these helpers.
import { Capacitor } from '@capacitor/core';
import type { LatLng } from '@getme/core';
import { post } from './api';

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform() as 'web' | 'android' | 'ios';
export const APP_TARGET = (import.meta.env.VITE_APP_TARGET as 'customer' | 'partner' | 'shop' | undefined) ?? undefined;

/** Foreground + background location watch (partner app). Falls back to the browser API on the web. */
export async function nativeWatchPosition(onPos: (p: LatLng, accuracyM: number) => void, onError: (code: 'denied' | 'unavailable') => void, opts: { background?: boolean } = {}): Promise<() => void> {
  if (!isNative()) {
    if (!('geolocation' in navigator)) { onError('unavailable'); return () => {}; }
    const id = navigator.geolocation.watchPosition(p => onPos({ lat: p.coords.latitude, lng: p.coords.longitude }, Math.round(p.coords.accuracy)), e => onError(e.code === 1 ? 'denied' : 'unavailable'), { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    return () => navigator.geolocation.clearWatch(id);
  }
  if (opts.background) {
    const { registerPlugin } = await import('@capacitor/core');
    const BackgroundGeolocation = registerPlugin<any>('BackgroundGeolocation');
    const id: string = await BackgroundGeolocation.addWatcher(
      { backgroundMessage: 'GetMe is sharing your location with the customer during the job.', backgroundTitle: 'On a delivery', requestPermissions: true, stale: false, distanceFilter: 15 },
      (loc: any, err: any) => { if (err) { onError(err.code === 'NOT_AUTHORIZED' ? 'denied' : 'unavailable'); return; } if (loc) onPos({ lat: loc.latitude, lng: loc.longitude }, Math.round(loc.accuracy ?? 20)); },
    );
    return () => { void BackgroundGeolocation.removeWatcher({ id }); };
  }
  const { Geolocation } = await import('@capacitor/geolocation');
  const perm = await Geolocation.requestPermissions().catch(() => ({ location: 'denied' as const }));
  if (perm.location === 'denied') { onError('denied'); return () => {}; }
  const id = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 15000 }, (p, err) => { if (err) { onError('unavailable'); return; } if (p) onPos({ lat: p.coords.latitude, lng: p.coords.longitude }, Math.round(p.coords.accuracy)); });
  return () => { void Geolocation.clearWatch({ id }); };
}

/** One-shot position through the native plugin when available. */
export async function nativeGetPosition(): Promise<{ pos: LatLng; accuracyM: number } | { error: 'denied' | 'unavailable' }> {
  if (!isNative()) return { error: 'unavailable' };
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    const perm = await Geolocation.requestPermissions();
    if (perm.location === 'denied') return { error: 'denied' };
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
    return { pos: { lat: p.coords.latitude, lng: p.coords.longitude }, accuracyM: Math.round(p.coords.accuracy) };
  } catch { return { error: 'unavailable' }; }
}

/** Register for FCM/APNs push and store the device token on the API. Returns true when registered. */
export async function registerNativePush(onOpen?: (url: string) => void): Promise<boolean> {
  if (!isNative()) return false;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return false;
  return new Promise<boolean>(resolve => {
    PushNotifications.addListener('registration', async t => { try { await post('/api/push/native', { token: t.value, platform: platform(), app: APP_TARGET ?? 'customer' }); resolve(true); } catch { resolve(false); } });
    PushNotifications.addListener('registrationError', () => resolve(false));
    PushNotifications.addListener('pushNotificationActionPerformed', a => { const url = a.notification.data?.url; if (url && onOpen) onOpen(url); });
    void PushNotifications.register();
  });
}

export async function haptic(kind: 'light' | 'medium' | 'success' | 'warning' = 'light') {
  if (!isNative()) { try { navigator.vibrate?.(kind === 'light' ? 20 : 40); } catch { /* ignore */ } return; }
  const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
  if (kind === 'success') return Haptics.notification({ type: NotificationType.Success });
  if (kind === 'warning') return Haptics.notification({ type: NotificationType.Warning });
  return Haptics.impact({ style: kind === 'light' ? ImpactStyle.Light : ImpactStyle.Medium });
}

/** Status bar colour + deep-link handling. Call once at startup. */
export async function initNative(navigate: (path: string) => void) {
  if (!isNative()) return;
  try { const { StatusBar, Style } = await import('@capacitor/status-bar'); await StatusBar.setStyle({ style: Style.Dark }); if (platform() === 'android') await StatusBar.setBackgroundColor({ color: '#14534A' }); } catch { /* ignore */ }
  try { const { SplashScreen } = await import('@capacitor/splash-screen'); await SplashScreen.hide(); } catch { /* ignore */ }
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('appUrlOpen', e => { try { const u = new URL(e.url); navigate(u.pathname + u.search); } catch { /* ignore */ } });
    App.addListener('backButton', ({ canGoBack }) => { if (canGoBack) window.history.back(); else App.exitApp(); });
  } catch { /* ignore */ }
}

/** Native camera when available; returns a File-like Blob for uploadFile, or null to fall back to <input type=file>. */
export async function nativePhoto(): Promise<Blob | null> {
  if (!isNative()) return null;
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const p = await Camera.getPhoto({ quality: 70, resultType: CameraResultType.DataUrl, source: CameraSource.Prompt, width: 1280 });
    const r = await fetch(p.dataUrl!); return await r.blob();
  } catch { return null; }
}
