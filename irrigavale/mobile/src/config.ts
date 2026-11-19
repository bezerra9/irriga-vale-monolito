import { Platform } from 'react-native';

// Definida por perfil de build no eas.json (EXPO_PUBLIC_API_URL).
// Na web (navegador do notebook) a API fica em localhost.
export const API_URL: string =
  Platform.OS === 'web'
    ? process.env.EXPO_PUBLIC_WEB_API_URL ?? 'http://localhost:8000/api/v1'
    : process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000/api/v1';

export const DASHBOARD_REFRESH_MS = 30_000;

// Mantenha igual a "version" do app.json.
export const APP_VERSION = '0.1.0';
