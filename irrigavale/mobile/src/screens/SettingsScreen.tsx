import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { farmApi } from '../api/endpoints';
import type { FarmOut } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, GroupCard, ListRow, Loading, Screen, ScreenHeader, Select, Toggle } from '../components/ui';
import { APP_VERSION } from '../config';
import { queryKeys, useDevices, useFarm, useSummary, useZones } from '../hooks/queries';
import { messageOf } from '../lib/errors';
import { formatBRL, formatCubicMeters, initials } from '../lib/format';
import type { TabNavProp } from '../navigation/types';
import { palette, radius, space, type } from '../theme';

const INTERVALS = [5, 10, 15, 30, 60];
const PROJECT_TAGS = ['ESP32', 'Arduino', 'SMS', 'Baixo custo', 'Qualquer porte'];

export function SettingsScreen() {
  const navigation = useNavigation<TabNavProp<'Settings'>>();
  const { user, signOut } = useAuth();
  const farm = useFarm();
  const devices = useDevices();
  const zones = useZones();
  const month = useSummary('month');
  const queryClient = useQueryClient();

  async function saveFarm(payload: Partial<FarmOut>) {
    try {
      await farmApi.update(payload);
      await queryClient.invalidateQueries({ queryKey: queryKeys.farm });
    } catch (err) {
      Alert.alert('Não foi possível salvar', messageOf(err));
    }
  }

  if (farm.isPending || !farm.data) return <Loading />;
  const f = farm.data;
  const zoneList = zones.data ?? [];
  const totalArea = zoneList.reduce((sum, z) => sum + z.area_ha, 0);
  const deviceCount = (devices.data ?? []).length;
  const name = user?.name ?? '';

  return (
    <Screen
      refreshing={farm.isRefetching}
      onRefresh={() => Promise.all([farm.refetch(), devices.refetch(), zones.refetch(), month.refetch()])}
      header={<ScreenHeader title="Configurações" subtitle={`IrrigaVale v${APP_VERSION} · ${f.name}`} />}
    >
      <Card tone="navy" style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
        <View style={{ flex: 1, gap: space.xs }}>
          <Text style={styles.profileName}>{name}</Text>
          <Text style={styles.profileFarm}>
            {f.name} · {f.city}, {f.state}
          </Text>
          <View style={styles.pills}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{totalArea.toFixed(1).replace('.', ',')} ha cadastrados</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                {deviceCount} {deviceCount === 1 ? 'sensor' : 'sensores'}
              </Text>
            </View>
          </View>
        </View>
      </Card>

      <GroupCard title="Automação e avisos">
        <ListRow
          title="Aprovação automática"
          subtitle="As recomendações do sensor entram direto na agenda, sem pedir seu aval."
          right={<Toggle label="Aprovação automática" value={f.auto_approve} onValueChange={(v) => void saveFarm({ auto_approve: v })} />}
        />
        <ListRow
          title="Notificações no celular"
          subtitle="Avisos na tela do app. Desligar interrompe só esses avisos — os alertas por SMS continuam."
          right={
            <Toggle
              label="Notificações no celular"
              value={f.app_notifications_enabled}
              onValueChange={(v) => void saveFarm({ app_notifications_enabled: v })}
            />
          }
        />
      </GroupCard>

      <GroupCard title="Fazenda">
        <ListRow
          title="Dados da fazenda"
          subtitle="Nome, cidade, meta de água, preço da água e horários"
          onPress={() => navigation.navigate('FarmSettings')}
        />
      </GroupCard>

      <GroupCard title="Sensores">
        <ListRow title="Adicionar sensor" subtitle="Via ESP32 ou Arduino" onPress={() => navigation.navigate('AddSensor')} />
        <ListRow
          title="Sensores cadastrados"
          subtitle={`${deviceCount} ${deviceCount === 1 ? 'dispositivo' : 'dispositivos'}`}
          onPress={() => navigation.navigate('Devices')}
        />
        <Select
          label="Intervalo de leitura"
          value={f.reading_interval_min}
          options={INTERVALS.map((m) => ({ label: `A cada ${m} minutos`, value: m }))}
          onChange={(m) => void saveFarm({ reading_interval_min: m })}
          renderTrigger={(open, current) => (
            <ListRow title="Intervalo de leitura" subtitle={current?.label ?? '—'} onPress={open} />
          )}
        />
      </GroupCard>

      <GroupCard title="Sobre o projeto">
        <View style={styles.about}>
          <Text style={styles.aboutTitle}>IrrigaVale — Irrigação Inteligente</Text>
          <Text style={styles.aboutText}>
            Sistema de irrigação inteligente para propriedades de qualquer porte no Vale do São Francisco. Os sensores ESP32
            enviam as leituras por Wi-Fi e o nosso sistema avisa o produtor por SMS.
          </Text>
          <View style={styles.pills}>
            {PROJECT_TAGS.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      </GroupCard>

      <Card>
        <Text style={styles.cardTitle}>Resumo do Mês</Text>
        <View style={styles.summary}>
          <SummaryTile
            value={month.data ? formatCubicMeters(month.data.water_saved_l).replace(',0 ', ' ') : '—'}
            label="Água economizada"
            color={palette.action}
          />
          <SummaryTile value={month.data ? formatBRL(month.data.savings_brl) : '—'} label="Economia" color={palette.green700} />
          <SummaryTile value={month.data ? String(month.data.irrigations_done) : '—'} label="Irrigações" color={palette.gray700} />
        </View>
      </Card>

      <Button title="Sair da conta" variant="outlineDanger" onPress={() => void signOut()} />
    </Screen>
  );
}

function SummaryTile({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...type.title, color: palette.white },
  profileName: { ...type.title, color: palette.white },
  profileFarm: { ...type.body, fontSize: 13, color: palette.blue200 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  pill: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3 },
  pillText: { ...type.caption, fontWeight: '700', color: palette.white },
  about: { padding: space.lg, gap: space.sm },
  aboutTitle: { ...type.bodyStrong, fontSize: 15, color: palette.gray900 },
  aboutText: { ...type.body, color: palette.gray600 },
  tag: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.blue200,
    backgroundColor: palette.blue50,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  tagText: { ...type.caption, fontWeight: '700', color: palette.blue800 },
  cardTitle: { ...type.bodyStrong, fontSize: 16, color: palette.gray900 },
  summary: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, backgroundColor: palette.gray50, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.xs, alignItems: 'center', gap: 2 },
  tileValue: { ...type.title, fontSize: 17, textAlign: 'center' },
  tileLabel: { ...type.caption, color: palette.gray500, textAlign: 'center' },
});
