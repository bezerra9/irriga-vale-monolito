import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type MainTabParamList = {
  Dashboard: undefined;
  Sensors: undefined;
  Irrigation: undefined;
  Alerts: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  AddSensor: undefined;
  CreateRoutine: { routineId?: string } | undefined;
  FarmSettings: undefined;
  Devices: undefined;
};

export type RootNavProp = NativeStackNavigationProp<RootStackParamList>;

export type TabNavProp<T extends keyof MainTabParamList> = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, T>,
  NativeStackNavigationProp<RootStackParamList>
>;
