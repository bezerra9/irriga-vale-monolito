import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// No Android usa o armazenamento seguro; na web (só para desenvolvimento) usa localStorage.
const isWeb = Platform.OS === 'web';

export const tokenStorage = {
  get: (key: string): Promise<string | null> =>
    isWeb ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null) : SecureStore.getItemAsync(key),
  set: async (key: string, value: string): Promise<void> => {
    if (isWeb) globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  remove: async (key: string): Promise<void> => {
    if (isWeb) globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
};
