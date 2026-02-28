import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

const USERNAME_KEY = 'gantt_remember_username';
const PASSWORD_KEY = 'gantt_remember_password';

export function isMobileNative(): boolean {
  return Capacitor?.isNativePlatform?.() === true;
}

export async function saveCredentials(username: string, password: string): Promise<void> {
  if (!isMobileNative()) return;
  await SecureStoragePlugin.set({ key: USERNAME_KEY, value: username });
  await SecureStoragePlugin.set({ key: PASSWORD_KEY, value: password });
}

export async function getCredentials(): Promise<{ username: string; password: string } | null> {
  if (!isMobileNative()) return null;
  try {
    const usernameResult = await SecureStoragePlugin.get({ key: USERNAME_KEY });
    const passwordResult = await SecureStoragePlugin.get({ key: PASSWORD_KEY });
    if (usernameResult.value && passwordResult.value) {
      return { username: usernameResult.value, password: passwordResult.value };
    }
  } catch {
    // Try Preferences fallback (migrate from old storage)
    const username = await Preferences.get({ key: USERNAME_KEY });
    const password = await Preferences.get({ key: PASSWORD_KEY });
    if (username.value && password.value) {
      const creds = { username: username.value, password: password.value };
      await saveCredentials(creds.username, creds.password);
      await Preferences.remove({ key: USERNAME_KEY });
      await Preferences.remove({ key: PASSWORD_KEY });
      return creds;
    }
  }
  return null;
}

export async function clearCredentials(): Promise<void> {
  if (!isMobileNative()) return;
  try {
    await SecureStoragePlugin.remove({ key: USERNAME_KEY });
    await SecureStoragePlugin.remove({ key: PASSWORD_KEY });
  } catch {
    /* ignore */
  }
  await Preferences.remove({ key: USERNAME_KEY });
  await Preferences.remove({ key: PASSWORD_KEY });
}
