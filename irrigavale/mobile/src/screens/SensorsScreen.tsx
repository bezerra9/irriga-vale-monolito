import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { DeviceOut, IrrigationOut, ZoneOut, ZoneStatus } from '../api/types';
import { Ring } from '../components/Ring';
import { Sparkline } from '../components/Sparkline';
import {
  Card,
  Chip,
  DashedButton,
  EmptyState,
  ErrorBanner,
  Loading,
  Screen,
  ScreenHeader,
  SignalBars,
  Tag,
} from '../components/ui';
import { useDevices, useFarm, useIrrigations, useZoneReadings, useZones } from '../hooks/queries';
import { messageOf } from '../lib/errors';
import { formatElapsed, formatHHMM, formatPct } from '../lib/format';
import { batteryColor, needsAttention, signalBars, ZONE_STATUS } from '../lib/status';
import type { TabNavProp } from '../navigation/types';
import { palette, radius, space, type } from '../theme';

type Filter = 'todos' | 'atencao' | 'offline';

const FILTERS: Filter[] = ['todos', 'atencao', 'offline'];
const FILTER_LABEL: Record<Filter, string> = { todos: 'Todos', atencao: 'Atenção', offline: 'Offline' };

function matches(filter: Filter, status: ZoneStatus): boolean {
  if (filter === 'todos') return true;
  if (filter === 'atencao') return needsAttention(status);
  return status === 'offline' || status === 'no_data';
}

export function SensorsScreen() {
  const navigation = useNavigation<TabNavProp<'Sensors'>>();
  const zones = useZones();
  const devices = useDevices();
  const farm = useFarm();
  const irrigations = useIrrigations();
  const [filter, setFilter] = useState<Filter>('todos');

  const counts = useMemo(() => {
    const list = zones.data ?? [];
    return {
      todos: list.length,
      atencao: list.filter((z) => needsAttention(z.status)).length,
      offline: list.filter((z) => matches('offline', z.status)).length,
    };
  }, [zones.data]);

  const visible = (zones.data ?? []).filter((z) => matches(filter, z.status));
  const active = (devices.data ?? []).filter((d) => d.connection === 'online').length;
  const subtitle = [
    devices.data ? `${active} ${active === 1 ? 'sensor ativo' : 'sensores ativos'}` : null,
    farm.data ? `${farm.data.city}, ${farm.data.state}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen
      refreshing={zones.isRefetching || devices.isRefetching}
      onRefresh={() => Promise.all([zones.refetch(), devices.refetch(), irrigations.refetch()])}
      header={
        <View style={styles.headerWrap}>
          <ScreenHeader title="Meus Sensores" subtitle={subtitle || undefined} />
          <View style={styles.chips}>
            {FILTERS.map((f) => (
              <Chip key={f} label={FILTER_LABEL[f]} count={counts[f]} selected={filter === f} onPress={() => setFilter(f)} />
            ))}
          </View>
        </View>
      }
    >
      {zones.isPending ? <Loading /> : null}
      {zones.isError ? <ErrorBanner message={messageOf(zones.error)} onRetry={() => void zones.refetch()} /> : null}

      {zones.data && visible.length === 0 ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title={filter === 'offline' ? 'Nenhum sensor offline' : 'Nenhuma zona nesta lista'}
          text={filter === 'offline' ? 'Todos os sensores estão transmitindo normalmente.' : 'Tudo certo por aqui.'}
        />
      ) : null}

      {visible.map((zone) => (
        <ZoneSensorCard
          key={zone.id}
          zone={zone}
          device={(devices.data ?? []).find((d) => d.zone_id === zone.id) ?? null}
          recommendation={
            (irrigations.data ?? []).find(
              (i) => i.zone_id === zone.id && (i.status === 'recommended' || i.status === 'approved'),
            ) ?? null
          }
        />
      ))}

      <DashedButton title="Adicionar sensor" onPress={() => navigation.navigate('AddSensor')} />
      <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Devices')} style={styles.manage}>
        <Text style={styles.manageText}>Gerenciar ou remover sensores</Text>
      </Pressable>
    </Screen>
  );
}

/** "nas próximas 2 horas" ou "amanhã às 05:00". */
function whenText(iso: string, now = Date.now()): string {
  const hours = Math.ceil((new Date(iso).getTime() - now) / 3_600_000);
  if (hours <= 1) return 'agora';
  if (hours <= 12) return `nas próximas ${hours} horas`;
  const date = new Date(iso);
  const today = new Date(now);
  const sameDay = date.getDate() === today.getDate() && date.getMonth() === today.getMonth();
  return `${sameDay ? 'hoje' : 'amanhã'} às ${formatHHMM(iso)}`;
}

function ZoneSensorCard({
  zone,
  device,
  recommendation,
}: {
  zone: ZoneOut;
  device: DeviceOut | null;
  recommendation: IrrigationOut | null;
}) {
  const { width } = useWindowDimensions();
  const readings = useZoneReadings(zone.id, 8);
  const meta = ZONE_STATUS[zone.status];
  const sparkWidth = Math.max(120, Math.min(width - 170, 260));
  const history = (readings.data ?? []).map((r) => r.moisture_pct);

  let banner: string | null = null;
  if (zone.status === 'dry') {
    banner = recommendation
      ? `Irrigação recomendada ${whenText(recommendation.scheduled_at)}`
      : `Solo abaixo do limiar seco (${zone.dry_threshold}%)`;
  }

  return (
    <Card style={{ borderColor: meta.border, borderWidth: meta.border === palette.gray200 ? 1 : 1.5 }}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.nameRow}>
            <Text style={styles.zoneName}>{zone.name}</Text>
            <Tag text={meta.label} bg={meta.tagBg} color={meta.tagText} />
          </View>
          <Text style={styles.small}>
            {zone.crop} • {zone.area_ha.toFixed(1).replace('.', ',')} ha
          </Text>
        </View>
        {device ? <DeviceBadge device={device} /> : <Text style={styles.muted}>Sem sensor</Text>}
      </View>

      <View style={styles.body}>
        <View style={{ alignItems: 'center', width: 92, gap: space.xs }}>
          <View>
            <Ring size={92} stroke={9} pct={zone.last_moisture_pct} color={meta.ring} track={palette.gray100} />
            <View style={styles.ringCenter}>
              <Text style={[styles.ringValue, { color: meta.tagText }]}>{formatPct(zone.last_moisture_pct)}</Text>
              <Text style={styles.muted}>umidade</Text>
            </View>
          </View>
          <Text style={[styles.ringLabel, { color: meta.tagText }]}>{meta.label}</Text>
        </View>

        <View style={{ flex: 1, gap: space.sm }}>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {zone.last_temperature_c != null ? `${Math.round(zone.last_temperature_c)}°` : '—'}
              </Text>
              <Text style={styles.muted}>Temperatura</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatElapsed(zone.last_reading_at)}</Text>
              <Text style={styles.muted}>Última leitura</Text>
            </View>
          </View>
          <Text style={styles.muted}>Histórico (8h)</Text>
          {history.length >= 2 ? (
            <Sparkline values={history} width={sparkWidth} height={44} color={meta.ring} fill={meta.fill} />
          ) : (
            <Text style={styles.muted}>Aparece após as primeiras leituras.</Text>
          )}
        </View>
      </View>

      {banner ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>
      ) : null}
    </Card>
  );
}

function DeviceBadge({ device }: { device: DeviceOut }) {
  const navigation = useNavigation<TabNavProp<'Sensors'>>();
  const offline = device.connection !== 'online';
  const color = offline ? palette.gray500 : batteryColor(device.battery_pct);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Gerenciar sensor ${device.code}`}
      onPress={() => navigation.navigate('Devices')}
      style={styles.device}
      hitSlop={6}
    >
      <Text style={styles.muted}>{device.code}</Text>
      <View style={styles.deviceRow}>
        <SignalBars bars={offline ? 0 : signalBars(device.signal_dbm)} color={color} />
        <Text style={[styles.deviceText, { color }]}>
          {offline ? 'Offline' : device.battery_pct != null ? `${device.battery_pct}%` : '—'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  manage: { alignSelf: 'center', paddingVertical: space.sm, paddingHorizontal: space.md },
  manageText: { ...type.bodyStrong, color: palette.action },
  headerWrap: { backgroundColor: palette.white, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', paddingHorizontal: space.lg, paddingBottom: space.md },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  zoneName: { ...type.title, color: palette.gray900 },
  small: { ...type.body, fontSize: 13, color: palette.gray500 },
  muted: { ...type.caption, color: palette.gray500 },
  body: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  ringCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  ringValue: { fontSize: 20, lineHeight: 24, fontWeight: '800' },
  ringLabel: { ...type.caption, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: { flex: 1, backgroundColor: palette.gray50, borderRadius: radius.md, padding: space.sm, gap: 2, alignItems: 'center' },
  statValue: { ...type.title, color: palette.gray800 },
  device: { alignItems: 'flex-end', gap: 2 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  deviceText: { ...type.caption, fontWeight: '700' },
  banner: {
    backgroundColor: palette.red50,
    borderColor: palette.red200,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  bannerText: { ...type.bodyStrong, fontSize: 13, color: palette.red700 },
});
