import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { farmApi, zonesApi } from '../api/endpoints';
import type { AlertKind, AlertOut, FarmOut, ZoneOut } from '../api/types';
import {
  Button,
  Card,
  ConfirmModal,
  Dot,
  EmptyState,
  ErrorBanner,
  Field,
  Loading,
  Screen,
  ScreenHeader,
  Select,
  Tag,
  Toggle,
} from '../components/ui';
import { queryKeys, useAlertActions, useAlerts, useFarm, useZones } from '../hooks/queries';
import { messageOf } from '../lib/errors';
import { formatDayTime, formatPhoneBR, isSameLocalDay, toE164BR } from '../lib/format';
import { palette, radius, space, type } from '../theme';

const KIND_META: Record<AlertKind, { label: string; bg: string; color: string; cardBg: string; cardBorder: string; dot: string }> = {
  critical: {
    label: 'Crítico',
    bg: palette.red100,
    color: palette.red700,
    cardBg: palette.red50,
    cardBorder: palette.red200,
    dot: palette.dry,
  },
  warning: {
    label: 'Atenção',
    bg: palette.amber100,
    color: palette.amber700,
    cardBg: palette.amber50,
    cardBorder: palette.amber200,
    dot: palette.amber,
  },
  done: {
    label: 'Concluído',
    bg: palette.green100,
    color: palette.green700,
    cardBg: palette.white,
    cardBorder: palette.gray200,
    dot: palette.green,
  },
  info: {
    label: 'Aviso',
    bg: palette.blue100,
    color: palette.blue700,
    cardBg: palette.white,
    cardBorder: palette.gray200,
    dot: palette.accent,
  },
  device: {
    label: 'Sensor',
    bg: palette.gray100,
    color: palette.gray600,
    cardBg: palette.white,
    cardBorder: palette.gray200,
    dot: palette.gray400,
  },
};

const ALL_ZONES = '__todas__';
/** Distância mínima entre os limiares seco e úmido. */
const MIN_GAP = 10;
// Faixas permitidas nos controles: evitam limiares que desligam os alertas (ex.: seco em 5%).
const DRY_RANGE = { min: 10, max: 60 };
const WET_RANGE = { min: 40, max: 95 };

export function AlertsScreen() {
  const alerts = useAlerts();
  const zones = useZones();
  const farm = useFarm();
  const actions = useAlertActions();
  const [smsExpanded, setSmsExpanded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Ao abrir a aba, marca os alertas como lidos (zera o contador da navegação).
  const hasUnread = (alerts.data ?? []).some((a) => a.read_at === null);
  useEffect(() => {
    if (hasUnread) actions.readAll.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread]);

  if (alerts.isPending || zones.isPending || farm.isPending) return <Loading />;

  const list = alerts.data ?? [];
  // Os alertas são marcados como lidos ao abrir a aba; o selo mostra os críticos de hoje.
  const critical = list.filter((a) => a.kind === 'critical' && isSameLocalDay(a.created_at)).length;

  return (
    <Screen
      refreshing={alerts.isRefetching}
      onRefresh={() => Promise.all([alerts.refetch(), zones.refetch(), farm.refetch()])}
      header={
        <ScreenHeader
          title="Alertas"
          subtitle={list.length ? `${list.length} ${list.length === 1 ? 'notificação' : 'notificações'}` : 'Nenhuma notificação'}
          right={
            critical > 0 ? (
              <View style={styles.criticalBadge}>
                <Text style={styles.criticalText}>
                  {critical} {critical === 1 ? 'crítico hoje' : 'críticos hoje'}
                </Text>
              </View>
            ) : undefined
          }
        />
      }
    >
      {alerts.isError ? <ErrorBanner message={messageOf(alerts.error)} onRetry={() => void alerts.refetch()} /> : null}

      {farm.data ? (
        <SmsCard
          key={farm.dataUpdatedAt}
          farm={farm.data}
          zones={zones.data ?? []}
          expanded={smsExpanded}
          onToggleExpanded={() => setSmsExpanded((v) => !v)}
          onExpand={() => setSmsExpanded(true)}
        />
      ) : null}

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Histórico</Text>
        {list.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => setConfirmClear(true)} disabled={actions.clear.isPending}>
            <Text style={styles.clear}>Limpar tudo</Text>
          </Pressable>
        ) : null}
      </View>
      {list.length === 0 ? (
        <EmptyState icon="checkmark-done-outline" title="Tudo em ordem" text="Quando algo precisar da sua atenção, aparece aqui." />
      ) : (
        list.map((alert) => <AlertCard key={alert.id} alert={alert} />)
      )}

      <ConfirmModal
        visible={confirmClear}
        title="Limpar histórico?"
        message="Os alertas somem desta tela. O registro é mantido para auditoria."
        confirmLabel="Limpar"
        destructive
        loading={actions.clear.isPending}
        onConfirm={() => actions.clear.mutate(undefined, { onSettled: () => setConfirmClear(false) })}
        onCancel={() => setConfirmClear(false)}
      />
    </Screen>
  );
}

function SmsCard({
  farm,
  zones,
  expanded,
  onToggleExpanded,
  onExpand,
}: {
  farm: FarmOut;
  zones: ZoneOut[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onExpand: () => void;
}) {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState(formatPhoneBR(farm.sms_phone));
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [savingPhone, setSavingPhone] = useState(false);
  const [zoneChoice, setZoneChoice] = useState<string>(zones[0]?.id ?? ALL_ZONES);
  const [confirmAll, setConfirmAll] = useState(false);

  const reference = zoneChoice === ALL_ZONES ? zones[0] : zones.find((z) => z.id === zoneChoice);
  const [dry, setDry] = useState(reference?.dry_threshold ?? 30);
  const [wet, setWet] = useState(reference?.wet_threshold ?? 70);
  const [savingThresholds, setSavingThresholds] = useState(false);

  // Ao trocar a zona, os controles mostram os limiares dela.
  useEffect(() => {
    if (reference) {
      setDry(reference.dry_threshold);
      setWet(reference.wet_threshold);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneChoice]);

  const phoneChanged = (toE164BR(phone) ?? phone) !== (farm.sms_phone ?? '');

  async function patchFarm(payload: Partial<FarmOut>) {
    await farmApi.update(payload);
    await queryClient.invalidateQueries({ queryKey: queryKeys.farm });
  }

  async function savePhone() {
    setPhoneError(null);
    const e164 = phone.trim() ? toE164BR(phone) : null;
    if (phone.trim() && !e164) return setPhoneError('Use o formato (87) 9 9999-8888.');
    setSavingPhone(true);
    try {
      await patchFarm(e164 ? { sms_phone: e164 } : { sms_phone: null, sms_enabled: false });
      setPhone(formatPhoneBR(e164));
    } catch (err) {
      setPhoneError(messageOf(err));
    } finally {
      setSavingPhone(false);
    }
  }

  async function toggleSms(value: boolean) {
    if (value && !farm.sms_phone) {
      onExpand();
      setPhoneError('Informe e salve o número antes de ativar os alertas por SMS.');
      return;
    }
    try {
      await patchFarm({ sms_enabled: value });
    } catch (err) {
      Alert.alert('Não foi possível salvar', messageOf(err));
    }
  }

  const targets = zoneChoice === ALL_ZONES ? zones : zones.filter((z) => z.id === zoneChoice);
  const dirty = reference ? dry !== reference.dry_threshold || wet !== reference.wet_threshold : false;
  const mixed = zoneChoice === ALL_ZONES && new Set(zones.map((z) => `${z.dry_threshold}/${z.wet_threshold}`)).size > 1;

  function resetSliders() {
    if (reference) {
      setDry(reference.dry_threshold);
      setWet(reference.wet_threshold);
    }
  }

  async function saveThresholds(nextDry: number, nextWet: number) {
    setConfirmAll(false);
    setSavingThresholds(true);
    try {
      await Promise.all(targets.map((z) => zonesApi.update(z.id, { dry_threshold: nextDry, wet_threshold: nextWet })));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.zones }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
      ]);
    } catch (err) {
      Alert.alert('Não foi possível salvar os limiares', messageOf(err));
    } finally {
      setSavingThresholds(false);
    }
  }

  const zoneOptions = [
    ...(zones.length > 1 ? [{ label: 'Todas as zonas', value: ALL_ZONES }] : []),
    ...zones.map((z) => ({ label: `${z.name} — ${z.crop}`, value: z.id })),
  ];

  return (
    <Card style={styles.smsCard}>
      <View style={[styles.row, styles.smsHeader, expanded && styles.smsHeaderOpen]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel="Configurar alertas por SMS e limiares"
          onPress={onToggleExpanded}
          style={[styles.row, { flex: 1 }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.cardTitle}>Alertas por SMS</Text>
            <Text style={styles.small} numberOfLines={expanded ? undefined : 1}>
              {expanded
                ? 'Mensagem de texto enviada pelo sistema, funciona sem o app aberto.'
                : [farm.sms_enabled ? 'Ligado' : 'Desligado', farm.sms_phone ? formatPhoneBR(farm.sms_phone) : 'sem celular'].join(' · ')}
            </Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={palette.gray500} />
        </Pressable>
        <Toggle label="Alertas por SMS" value={farm.sms_enabled} onValueChange={(v) => void toggleSms(v)} />
      </View>

      {expanded ? <View style={styles.smsBody}>
        <Field
          label="Número de celular"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="(87) 9 9999-8888"
          error={phoneError}
          onSubmitEditing={() => void savePhone()}
          right={
            phoneChanged ? (
              <Pressable accessibilityRole="button" onPress={() => void savePhone()} style={styles.inlineSave} disabled={savingPhone}>
                <Text style={styles.inlineSaveText}>{savingPhone ? 'Salvando…' : 'Salvar'}</Text>
              </Pressable>
            ) : undefined
          }
        />

        {zones.length > 0 ? (
          <>
            {zones.length > 1 ? <Select label="Limiares da zona" value={zoneChoice} options={zoneOptions} onChange={setZoneChoice} /> : null}
            <ThresholdSlider
              label="Limiar de alerta — Solo seco"
              value={dry}
              color={palette.red700}
              track={palette.dry}
              disabled={savingThresholds}
              min={DRY_RANGE.min}
              max={DRY_RANGE.max}
              onChange={(v) => setDry(Math.min(v, wet - MIN_GAP))}
            />
            <ThresholdSlider
              label="Limiar de alerta — Solo úmido"
              value={wet}
              color={palette.blue700}
              track={palette.accent}
              disabled={savingThresholds}
              min={WET_RANGE.min}
              max={WET_RANGE.max}
              onChange={(v) => setWet(Math.max(v, dry + MIN_GAP))}
            />
            {mixed && !dirty ? (
              <Text style={styles.small}>As zonas têm limiares diferentes. Os valores mostrados são do {zones[0]?.name}.</Text>
            ) : null}
            {dirty ? (
              <View style={styles.thresholdActions}>
                <Button title="Desfazer" variant="ghost" onPress={resetSliders} disabled={savingThresholds} style={{ flex: 1 }} />
                <Button
                  title={zoneChoice === ALL_ZONES ? `Aplicar às ${targets.length} zonas` : 'Salvar limiares'}
                  onPress={() => (zoneChoice === ALL_ZONES ? setConfirmAll(true) : void saveThresholds(dry, wet))}
                  loading={savingThresholds}
                  style={{ flex: 1 }}
                />
              </View>
            ) : null}
            <ConfirmModal
              visible={confirmAll}
              title={`Aplicar a todas as ${targets.length} zonas?`}
              message={`Solo seco abaixo de ${dry}% e úmido acima de ${wet}% em todas as zonas. Os limiares próprios de cada cultura serão substituídos.`}
              confirmLabel="Aplicar"
              destructive
              loading={savingThresholds}
              onConfirm={() => void saveThresholds(dry, wet)}
              onCancel={() => setConfirmAll(false)}
            />
          </>
        ) : null}

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Quem envia o SMS é o nosso sistema, não o sensor. Você recebe o alerta no celular mesmo sem estar com o app aberto.
          </Text>
        </View>
      </View> : null}
    </Card>
  );
}

function ThresholdSlider({
  label,
  value,
  color,
  track,
  disabled,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  color: string;
  track: string;
  disabled: boolean;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={styles.sliderLabel}>{label}</Text>
      <View style={styles.row}>
        <Slider
          style={{ flex: 1, height: 36 }}
          minimumValue={min}
          maximumValue={max}
          step={1}
          value={value}
          disabled={disabled}
          minimumTrackTintColor={track}
          maximumTrackTintColor={palette.gray200}
          thumbTintColor={track}
          onValueChange={(v) => onChange(Math.round(v))}
          accessibilityLabel={`${label}: ${value} por cento`}
        />
        <Text style={[styles.sliderValue, { color }]}>{value}%</Text>
      </View>
    </View>
  );
}

function AlertCard({ alert }: { alert: AlertOut }) {
  const meta = KIND_META[alert.kind];
  return (
    <Card style={{ backgroundColor: meta.cardBg, borderColor: alert.read_at ? meta.cardBorder : palette.accent, gap: space.sm }}>
      <View style={styles.inline}>
        <Dot color={meta.dot} size={10} />
        <Tag text={meta.label} bg={meta.bg} color={meta.color} />
        {alert.zone_name ? <Text style={[styles.small, { flex: 1 }]} numberOfLines={1}>{alert.zone_name}</Text> : null}
      </View>
      <Text style={styles.message}>{alert.message}</Text>
      <View style={styles.inline}>
        <Text style={styles.time}>{formatDayTime(alert.created_at)}</Text>
        {alert.sms_sent ? <Text style={styles.sms}>✓ SMS enviado</Text> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  small: { ...type.caption, color: palette.gray500 },
  time: { ...type.caption, color: palette.gray500 },
  sms: { ...type.caption, fontWeight: '700', color: palette.green700 },
  message: { ...type.body, fontSize: 15, color: palette.gray800 },
  cardTitle: { ...type.bodyStrong, fontSize: 16, color: palette.gray900 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  criticalBadge: { backgroundColor: palette.red700, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs },
  criticalText: { ...type.caption, fontWeight: '700', color: palette.white },
  smsCard: { padding: 0, gap: 0, overflow: 'hidden' },
  smsHeader: { padding: space.lg },
  smsHeaderOpen: { borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  smsBody: { padding: space.lg, gap: space.md },
  inlineSave: { paddingHorizontal: space.md, height: 46, justifyContent: 'center' },
  inlineSaveText: { ...type.bodyStrong, color: palette.action },
  thresholdActions: { flexDirection: 'row', gap: space.sm },
  sliderLabel: { ...type.body, color: palette.gray600 },
  sliderValue: { ...type.title, minWidth: 48, textAlign: 'right' },
  note: { backgroundColor: palette.green50, borderRadius: radius.md, padding: space.md },
  noteText: { ...type.body, color: palette.green700 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm },
  sectionTitle: { ...type.title, color: palette.gray800 },
  clear: { ...type.bodyStrong, color: palette.gray500 },
});
