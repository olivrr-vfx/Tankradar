/**
 * Thin platform layer: one API for browser/PWA, Capacitor (iOS/Android) and Tauri (desktop).
 */
import { Capacitor } from '@capacitor/core';
import { isTauri } from './http';
import type { LatLng } from '../lib/types';

export const isNative = () => Capacitor.isNativePlatform();
export const platformName = (): 'ios' | 'android' | 'desktop' | 'web' =>
  isTauri() ? 'desktop' : (Capacitor.getPlatform() as 'ios' | 'android' | 'web');

export const isAppleDevice = () =>
  platformName() === 'ios' || /iPad|iPhone|iPod|Macintosh/.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');

export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }
  if (isNative()) {
    const { AppLauncher } = await import('@capacitor/app-launcher');
    await AppLauncher.openUrl({ url });
    return;
  }
  window.open(url, '_blank', 'noopener');
}

export async function getPosition(): Promise<LatLng> {
  if (isNative()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Geolocation nicht verfügbar'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e.message)),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 },
    );
  });
}

/** Save a text file (GPX, ICS, CSV, JSON backup). */
export async function saveTextFile(filename: string, content: string, mime: string): Promise<void> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: filename });
    if (path) await writeTextFile(path, content);
    return;
  }
  if (isNative()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const res = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: filename, url: res.uri });
    return;
  }
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function shareText(title: string, text: string, url?: string): Promise<boolean> {
  try {
    if (isNative()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url });
      return true;
    }
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return true;
    }
    await navigator.clipboard.writeText([text, url].filter(Boolean).join('\n'));
    return false;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (isTauri()) {
      const n = await import('@tauri-apps/plugin-notification');
      if (await n.isPermissionGranted()) return true;
      return (await n.requestPermission()) === 'granted';
    }
    if (isNative()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const res = await LocalNotifications.requestPermissions();
      return res.display === 'granted';
    }
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export async function notify(title: string, body: string): Promise<void> {
  try {
    if (isTauri()) {
      const n = await import('@tauri-apps/plugin-notification');
      n.sendNotification({ title, body });
      return;
    }
    if (isNative()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({ notifications: [{ id: Math.floor(Math.random() * 1e9), title, body }] });
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/badge-72.png' });
      else new Notification(title, { body, icon: 'icons/icon-192.png' });
    }
  } catch {
    /* notifications are best effort */
  }
}
