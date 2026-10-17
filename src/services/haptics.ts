/** Subtle haptic feedback on native apps (and vibration on Android browsers). */
import { isNative } from './platform';

type Kind = 'light' | 'medium' | 'success';

export async function haptic(kind: Kind = 'light'): Promise<void> {
  try {
    if (isNative()) {
      const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
      if (kind === 'success') await Haptics.notification({ type: NotificationType.Success });
      else await Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
      return;
    }
    if ('vibrate' in navigator && matchMedia('(pointer: coarse)').matches) navigator.vibrate(kind === 'success' ? [12, 40, 18] : kind === 'medium' ? 14 : 8);
  } catch {
    /* best effort */
  }
}
