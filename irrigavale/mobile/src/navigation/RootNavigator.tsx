import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { Loading } from '../components/ui';
import { useDashboard } from '../hooks/queries';
import { AddSensorScreen } from '../screens/AddSensorScreen';
import { AlertsScreen } from '../screens/AlertsScreen';
import { CreateRoutineScreen } from '../screens/CreateRoutineScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { DevicesScreen } from '../screens/DevicesScreen';
import { FarmSettingsScreen } from '../screens/FarmSettingsScreen';
import { IrrigationScreen } from '../screens/IrrigationScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { SensorsScreen } from '../screens/SensorsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { palette } from '../theme';
import type { MainTabParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// [inativo, ativo]: a aba selecionada usa o ícone preenchido.
const TAB_ICONS: Record<keyof MainTabParamList, [IconName, IconName]> = {
  Dashboard: ['home-outline', 'home'],
  Sensors: ['radio-outline', 'radio'],
  Irrigation: ['water-outline', 'water'],
  Alerts: ['notifications-outline', 'notifications'],
  Settings: ['settings-outline', 'settings'],
};

const TAB_LABELS: Record<keyof MainTabParamList, string> = {
  Dashboard: 'Início',
  Sensors: 'Sensores',
  Irrigation: 'Irrigação',
  Alerts: 'Alertas',
  Settings: 'Config.',
};

function MainTabs() {
  const { data } = useDashboard();
  const unread = data?.unread_alerts ?? 0;
  // Edge-to-edge: a barra de abas precisa somar a área da barra de navegação do Android.
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.action,
        tabBarInactiveTintColor: palette.gray500,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: { borderTopColor: palette.gray200, height: 64 + bottom, paddingBottom: 8 + bottom, paddingTop: 6 },
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons name={TAB_ICONS[route.name][focused ? 1 : 0]} size={size} color={color} />
        ),
        tabBarLabel: TAB_LABELS[route.name],
      })}
    >
      <Tabs.Screen name="Dashboard" component={DashboardScreen} />
      <Tabs.Screen name="Sensors" component={SensorsScreen} />
      <Tabs.Screen name="Irrigation" component={IrrigationScreen} />
      <Tabs.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{ tabBarBadge: unread > 0 ? unread : undefined, tabBarBadgeStyle: { backgroundColor: palette.dry, color: palette.red700 } }}
      />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: palette.pageBg,
    card: palette.white,
    primary: palette.action,
    border: palette.gray200,
  },
};

export function RootNavigator() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerTintColor: palette.gray800,
          headerStyle: { backgroundColor: palette.white },
          headerShadowVisible: false,
        }}
      >
        {status === 'signedIn' ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen
              name="AddSensor"
              component={AddSensorScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <Stack.Screen
              name="CreateRoutine"
              component={CreateRoutineScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <Stack.Screen name="FarmSettings" component={FarmSettingsScreen} options={{ title: 'Dados da fazenda' }} />
            <Stack.Screen name="Devices" component={DevicesScreen} options={{ title: 'Sensores cadastrados' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Criar conta' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
