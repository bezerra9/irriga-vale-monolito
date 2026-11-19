import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DeviceOut, IrrigationOut, WeatherIcon, WeatherOut, ZoneOut } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Ring } from '../components/Ring';
import { StartIrrigationConfirm } from '../components/StartIrrigationConfirm';
import { Button, Card, Dot, EmptyState, ErrorBanner, Loading, Screen, SectionTitle, Tag } from '../components/ui';
import { useDashboard, useDevices, useFarm, useSummary, useWeather } from '../hooks/queries';
import { messageOf } from '../lib/errors';
import { formatAgo, formatBRL, formatHourShort, formatLiters, formatPct, uvLabel } from '../lib/format';
import { batteryColor, ZONE_STATUS } from '../lib/status';
import type { ZoneStatus } from '../api/types';
import type { TabNavProp } from '../navigation/types';
import { palette, radius, space, type } from '../theme';

const WEATHER_ICON: Record<WeatherIcon, React.ComponentProps<typeof Ionicons>['name']> = {
  sunny: 'sunny',
  partly: 'partly-sunny',
  cloudy: 'cloudy',
  fog: 'cloud-outline',
  rain: 'rainy',
  storm: 'thunderstorm',
  night: 'moon',
};

/** A partir desta temperatura a recomendação cita a evapotranspiração. */
const HOT_TEMPERATURE_C = 32;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function DashboardScreen() {
  const navigation = useNavigation<TabNavProp<'Dashboard'>>();
  const dashboard = useDashboard();
  const devices = useDevices();
  const farm = useFarm();
  const weather = useWeather();
  const month = useSummary('month');
  const { user } = useAuth();
  const [confirmZone, setConfirmZone] = useState<ZoneOut | null>(null);

  const refetch = () =>
    Promise.all([dashboard.refetch(), devices.refetch(), weather.refetch(), month.refetch()]);

  if (dashboard.isPending) return <Loading />;
  if (dashboard.isError) {
    return (
      <Screen>
        <ErrorBanner message={messageOf(dashboard.error)} onRetry={() => void dashboard.refetch()} />
      </Screen>
    );
  }

  const data = dashboard.data;
  const inProgress = data.active_irrigations.find((i) => i.status === 'in_progress');
  const recommendation = data.active_irrigations.find((i) => i.status === 'recommended');
  const dryZone = data.zones.find(
    (z) => z.status === 'dry' && !data.active_irrigations.some((i) => i.zone_id === z.id && i.status === 'in_progress'),
  );
  const attentionZones = data.zones.filter((z) => ATTENTION.includes(z.status));
  const waterPct = data.water_goal_l > 0 ? (data.water_used_today_l / data.water_goal_l) * 100 : 0;
  const location = farm.data ? `${farm.data.city}, ${farm.data.state}` : null;

  return (
    <Screen
      refreshing={dashboard.isRefetching}
      onRefresh={refetch}
      top={
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.greeting}>
                {greeting()}, {user?.name ?? data.user_name}!
              </Text>
              <Text style={styles.farm} accessibilityRole="header">{data.farm_name}</Text>
              {location ? (
                <View style={styles.location}>
                  <Ionicons name="location" size={14} color={palette.blue200} />
                  <Text style={styles.locationText}>{location}</Text>
                </View>
              ) : null}
            </View>
            {weather.data ? <WeatherBadge weather={weather.data} /> : null}
          </View>
          {weather.data ? <WeatherStats weather={weather.data} /> : null}
        </View>
      }
    >
      {dryZone ? (
        <View style={styles.urgent}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.urgentTitle}>Irrigação necessária!</Text>
            <Text style={styles.urgentText} numberOfLines={2}>
              {dryZone.name} — {dryZone.crop} ({formatPct(dryZone.last_moisture_pct)} umidade)
            </Text>
          </View>
          <Button
            title="Irrigar"
            variant="onColor"
            textColor={palette.red700}
            onPress={() => setConfirmZone(dryZone)}
            style={styles.urgentButton}
          />
        </View>
      ) : null}

      {inProgress ? (
        <Card tone="info">
          <Text style={styles.cardTitle}>Irrigando {inProgress.zone_name}</Text>
          <Text style={styles.cardText}>Acompanhe ou encerre a irrigação na aba Irrigação.</Text>
          <Button title="Ver irrigação" variant="secondary" onPress={() => navigation.navigate('Irrigation')} />
        </Card>
      ) : null}

      <Card>
        <View style={styles.row}>
          <Text style={styles.label}>Água utilizada hoje</Text>
          {month.data && month.data.savings_brl > 0 ? (
            <View style={styles.savingsPill} accessibilityLabel={`Economia no mês: ${formatBRL(month.data.savings_brl)}`}>
              <Text style={styles.savingsText}>Economia {formatBRL(month.data.savings_brl)}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.metric}>
          {(data.water_used_today_l / 1000).toFixed(1).replace('.', ',')} / {(data.water_goal_l / 1000).toFixed(1).replace('.', ',')} m³
        </Text>
        <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ now: Math.round(waterPct), min: 0, max: 100 }}>
          <View
            style={[
              styles.fill,
              { width: `${Math.min(100, waterPct)}%`, backgroundColor: waterPct > 100 ? palette.dry : palette.accent },
            ]}
          />
        </View>
        <Text style={styles.small}>
          {waterPct > 100 ? `${Math.round(waterPct)}% — acima do limite diário` : `${Math.round(waterPct)}% do limite diário`}
        </Text>
      </Card>

      <SectionTitle title="Sensores" action="Ver todos →" onAction={() => navigation.navigate('Sensors')} />
      {data.zones.length === 0 ? (
        <EmptyState icon="leaf-outline" title="Nenhuma zona cadastrada" text="Adicione um sensor para começar a acompanhar sua lavoura." />
      ) : (
        <>
          <ZoneSummary zones={data.zones} />
          {attentionZones.length === 0 ? (
            <Card tone="ok">
              <Text style={styles.cardText}>Nenhuma zona precisa de atenção agora.</Text>
            </Card>
          ) : (
            attentionZones.map((zone) => (
              <ZoneCard
                key={zone.id}
                zone={zone}
                device={(devices.data ?? []).find((d) => d.zone_id === zone.id) ?? null}
                onPress={() => navigation.navigate('Sensors')}
              />
            ))
          )}
        </>
      )}

      {recommendation ? (
        <RecommendationCard
          irrigation={recommendation}
          zone={data.zones.find((z) => z.id === recommendation.zone_id) ?? null}
          onPress={() => navigation.navigate('Irrigation')}
        />
      ) : null}

      <StartIrrigationConfirm
        zone={confirmZone}
        openIrrigation={
          confirmZone
            ? data.active_irrigations.find((i) => i.zone_id === confirmZone.id && i.status !== 'in_progress') ?? null
            : null
        }
        onClose={() => setConfirmZone(null)}
      />
    </Screen>
  );
}

/** Zonas que aparecem no Início: as que pedem alguma ação ou verificação. */
const ATTENTION: ZoneStatus[] = ['dry', 'attention', 'offline'];

const SUMMARY_GROUPS: { label: string; statuses: ZoneStatus[]; color: string }[] = [
  { label: 'ok', statuses: ['ideal', 'wet', 'planned_stress'], color: palette.green700 },
  { label: 'atenção', statuses: ['attention'], color: palette.amber700 },
  { label: 'seca', statuses: ['dry'], color: palette.red700 },
  { label: 'offline', statuses: ['offline', 'no_data'], color: palette.gray500 },
];

function ZoneSummary({ zones }: { zones: ZoneOut[] }) {
  return (
    <View style={styles.summary} accessibilityRole="summary">
      {SUMMARY_GROUPS.map((group) => {
        const count = zones.filter((z) => group.statuses.includes(z.status)).length;
        return (
          <View key={group.label} style={[styles.summaryItem, count === 0 && { opacity: 0.45 }]}>
            <Dot color={group.color} />
            <Text style={styles.summaryText}>
              <Text style={{ fontWeight: '800', color: palette.gray900 }}>{count}</Text> {group.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function WeatherBadge({ weather }: { weather: WeatherOut }) {
  return (
    <View style={styles.weather} accessibilityLabel={`${Math.round(weather.temperature_c)} graus, ${weather.condition}`}>
      <View style={styles.weatherTop}>
        <Ionicons name={WEATHER_ICON[weather.icon]} size={20} color={palette.white} />
        <Text style={styles.weatherTemp}>{Math.round(weather.temperature_c)}°C</Text>
      </View>
      <Text style={styles.weatherCondition}>{weather.condition}</Text>
    </View>
  );
}

function WeatherStats({ weather }: { weather: WeatherOut }) {
  const items = [
    { value: `${Math.round(weather.humidity_pct)}%`, label: 'Umid. Ar' },
    { value: `${Math.round(weather.wind_kmh)} km/h`, label: 'Vento' },
    { value: uvLabel(weather.uv_index), label: 'UV' },
    { value: `${weather.precipitation_mm.toFixed(0)} mm`, label: 'Chuva' },
  ];
  return (
    <View style={styles.weatherStats}>
      {items.map((item) => (
        <View key={item.label} style={styles.weatherStat}>
          <Text style={styles.weatherStatValue} numberOfLines={1}>{item.value}</Text>
          <Text style={styles.weatherStatLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function ZoneCard({ zone, device, onPress }: { zone: ZoneOut; device: DeviceOut | null; onPress: () => void }) {
  const meta = ZONE_STATUS[zone.status];
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card style={styles.zoneCard}>
        <View>
          <Ring size={60} stroke={6} pct={zone.last_moisture_pct} color={meta.ring} track={palette.gray100} />
          <View style={styles.ringCenter}>
            <Text style={[styles.ringValue, { color: meta.tagText }]}>{formatPct(zone.last_moisture_pct)}</Text>
          </View>
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <View style={styles.nameRow}>
            <Text style={styles.zoneName} numberOfLines={2}>{zone.name}</Text>
            <Tag text={meta.label} bg={meta.tagBg} color={meta.tagText} />
          </View>
          <Text style={styles.small} numberOfLines={1}>{zone.crop}</Text>
          <Text style={styles.smaller}>{formatAgo(zone.last_reading_at)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={styles.temp}>
            {zone.last_temperature_c != null ? `${Math.round(zone.last_temperature_c)}°C` : '—'}
          </Text>
          {device?.battery_pct != null ? (
            <Text style={[styles.smaller, device.battery_pct <= 20 && { color: batteryColor(device.battery_pct) }]}>
              Bateria {device.battery_pct}%
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

function RecommendationCard({
  irrigation,
  zone,
  onPress,
}: {
  irrigation: IrrigationOut;
  zone: ZoneOut | null;
  onPress: () => void;
}) {
  const crop = zone ? ` (${zone.crop})` : '';
  const parts = [
    `Irrigar ${irrigation.zone_name}${crop} por ${irrigation.duration_min} minutos a partir das ${formatHourShort(irrigation.scheduled_at)}.`,
  ];
  if (irrigation.volume_l_estimated != null) parts.push(`Volume estimado: ${formatLiters(irrigation.volume_l_estimated)}.`);
  if (zone?.last_temperature_c != null && zone.last_temperature_c >= HOT_TEMPERATURE_C) {
    parts.push(`Temperatura de ${Math.round(zone.last_temperature_c)}°C aumenta a evapotranspiração.`);
  } else if (irrigation.reason) {
    parts.push(`${irrigation.reason}.`);
  }
  return (
    <Card tone="navy">
      <Text style={[styles.cardTitle, { color: palette.white }]}>Recomendação do Sistema</Text>
      <Text style={[styles.cardText, { color: palette.blue100 }]}>{parts.join(' ')}</Text>
      <Button title="Ver plano de irrigação" variant="onColor" textColor={palette.brand} onPress={onPress} />
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: palette.brand,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    gap: space.lg,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  greeting: { ...type.body, color: palette.blue200 },
  farm: { ...type.headline, fontSize: 24, color: palette.white },
  location: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { ...type.body, color: palette.blue200 },
  weather: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  weatherTop: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  weatherTemp: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: palette.white },
  weatherCondition: { ...type.caption, color: palette.blue100 },
  weatherStats: { flexDirection: 'row', gap: space.sm },
  weatherStat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    paddingVertical: space.sm,
    alignItems: 'center',
  },
  weatherStatValue: { ...type.bodyStrong, color: palette.white },
  weatherStatLabel: { ...type.caption, fontSize: 12, color: palette.blue100 },
  urgent: {
    backgroundColor: palette.red700,
    borderRadius: radius.lg,
    padding: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  urgentTitle: { ...type.title, fontSize: 16, color: palette.white },
  urgentText: { ...type.body, color: palette.red100 },
  urgentButton: { minHeight: 40, paddingHorizontal: space.lg, borderRadius: radius.md },
  cardTitle: { ...type.title, color: palette.gray900 },
  cardText: { ...type.body, color: palette.gray700 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  label: { ...type.body, color: palette.gray600 },
  small: { ...type.body, fontSize: 13, color: palette.gray500 },
  smaller: { ...type.caption, color: palette.gray500 },
  metric: { ...type.metric, fontSize: 24, color: palette.gray900 },
  savingsPill: { backgroundColor: palette.green50, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm },
  savingsText: { ...type.caption, fontWeight: '700', color: palette.green700 },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: palette.gray100, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.pill },
  zoneCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  ringCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  ringValue: { ...type.caption, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  zoneName: { ...type.bodyStrong, fontSize: 16, color: palette.gray900, flexShrink: 1 },
  temp: { ...type.bodyStrong, color: palette.gray700 },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.gray200,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  summaryText: { ...type.body, color: palette.gray600 },
});
