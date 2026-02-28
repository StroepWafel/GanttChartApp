import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const USERNAME_KEY = 'gantt_remember_username';
const PASSWORD_KEY = 'gantt_remember_password';

export function isMobileNative(): boolean {
  return Capacitor?.isNativePlatform?.() === true;
}

export async function saveCredentials(username: string, password: string): Promise<void> {
  if (!isMobileNative()) return;
  await Preferences.set({ key: USERNAME_KEY, value: username });
  await Preferences.set({ key: PASSWORD_KEY, value: password });
}

export async function getCredentials(): Promise<{ username: string; password: string } | null> {
  if (!isMobileNative()) return null;
  const username = await Preferences.get({ key: USERNAME_KEY });
  const password = await Preferences.get({ key: PASSWORD_KEY });
  if (username.value && password.value) {
    return { username: username.value, password: password.value };
  }
  return null;
}

export async function clearCredentials(): Promise<void> {
  if (!isMobileNative()) return;
  await Preferences.remove({ key: USERNAME_KEY });
  await Preferences.remove({ key: PASSWORD_KEY });
}
