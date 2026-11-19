import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { routinesApi } from '../api/endpoints';
import type { IrrigationAction, IrrigationOut, RoutineOut, ZoneOut } from '../api/types';
import { StartIrrigationConfirm } from '../components/StartIrrigationConfirm';
import {
  Button,
  Card,
  ConfirmModal,
  DashedButton,
  Dot,
  EmptyState,
  ErrorBanner,
  Loading,
  Screen,
  ScreenHeader,
  SectionTitle,
  Tag,
  Toggle,
} from '../components/ui';
import { queryKeys, useFarm, useIrrigationAction, useIrrigations, useRoutines, useSummary, useZones } from '../hooks/queries';
import { messageOf } from '../lib/errors';
import {
  describeWeekdays,
  estimateVolumeL,
  formatCubicMeters,
  formatDayTime,
  formatHHMM,
  formatLiters,
  formatPct,
  formatTodayLong,
  isSameLocalDay,
} from '../lib/format';
import { ZONE_STATUS } from '../lib/status';
import type { TabNavProp } from '../navigation/types';
import { palette, radius, space, type } from '../theme';

const ORIGIN_TAG: Record<IrrigationOut['origin'], { text: string; bg: string; color: string }> = {
  system: { text: 'Sensor', bg: palette.blue100, color: palette.blue800 },
  routine: { text: 'Rotina', bg: palette.gray100, color: palette.gray600 },
  manual: { text: 'Manual', bg: palette.amber100, color: palette.amber700 },
};

const OPEN = ['recommended', 'approved', 'postponed'];

export function IrrigationScreen() {
  const navigation = useNavigation<TabNavProp<'Irrigation'>>();
  const irrigations = useIrrigations();
  const zones = useZones();
  const routines = useRoutines();
  const farm = useFarm();
  const today = useSummary('today');
  const action = useIrrigationAction();
  const [finishing, setFinishing] = useState<IrrigationOut | null>(null);
  const [confirmZone, setConfirmZone] = useState<ZoneOut | null>(null);
  const [showDone, setShowDone] = useState(false);

  const refresh = () =>
    Promise.all([irrigations.refetch(), zones.refetch(), routines.refetch(), today.refetch(), farm.refetch()]);

  if (irrigations.isPending || zones.isPending) return <Loading />;
  if (irrigations.isError) {
    return (
      <Screen>
        <ErrorBanner message={messageOf(irrigations.error)} onRetry={() => void irrigations.refetch()} />
      </Screen>
    );
  }

  const all = irrigations.data ?? [];
  const zoneList = zones.data ?? [];
  const zoneById = new Map(zoneList.map((z) => [z.id, z]));
  const inProgress = all.filter((i) => i.status === 'in_progress');
  const pending = all.filter((i) => OPEN.includes(i.status)).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const doneToday = all
    .filter(
      (i) =>
        (i.status === 'done' && isSameLocalDay(i.finished_at)) ||
        (i.status === 'skipped' && isSameLocalDay(i.scheduled_at)),
    )
    .sort((a, b) => (b.finished_at ?? b.scheduled_at).localeCompare(a.finished_at ?? a.scheduled_at));
  const urgentZone = zoneList.find((z) => z.status === 'dry' && !inProgress.some((i) => i.zone_id === z.id));
  const subtitle = [formatTodayLong(), farm.data ? `${farm.data.city}, ${farm.data.state}` : null].filter(Boolean).join(' · ');
  const openFor = (zoneId: string) => pending.find((i) => i.zone_id === zoneId) ?? null;

  function run(id: string, act: IrrigationAction) {
    action.mutate({ id, action: act }, { onError: (err) => Alert.alert('Não foi possível concluir', messageOf(err)) });
  }

  function toggleZone(zone: ZoneOut, on: boolean) {
    if (on) {
      setConfirmZone(zone);
      return;
    }
    const current = inProgress.find((i) => i.zone_id === zone.id);
    if (current) setFinishing(current);
  }

  return (
    <>
      <Screen
        refreshing={irrigations.isRefetching}
        onRefresh={refresh}
        header={<ScreenHeader title="Irrigação" subtitle={subtitle} />}
      >
        <View style={styles.stats}>
          <Card style={styles.stat}>
            <Text style={styles.label}>Água usada</Text>
            <Text style={styles.metric}>{formatCubicMeters(today.data?.water_used_l ?? 0)}</Text>
            <Text style={styles.small}>
              de {today.data?.irrigations_done ?? 0} {today.data?.irrigations_done === 1 ? 'irrigação' : 'irrigações'}
            </Text>
          </Card>
          <Card tone="ok" style={styles.stat}>
            <Text style={[styles.label, { color: palette.green700 }]}>Economia</Text>
            <Text style={[styles.metric, { color: palette.green700 }]}>{formatCubicMeters(today.data?.water_saved_l ?? 0)}</Text>
            <Text style={styles.small}>vs. método manual</Text>
          </Card>
        </View>

        {urgentZone ? (
          <View style={styles.urgent}>
            <Text style={styles.urgentTitle}>Irrigação Urgente</Text>
            <Text style={styles.urgentText}>
              {urgentZone.name} ({urgentZone.crop}) com {formatPct(urgentZone.last_moisture_pct)} de umidade — abaixo do
              limiar crítico de {urgentZone.dry_threshold}%. Irrigar agora evita estresse hídrico na cultura.
            </Text>
            <Button
              title="Iniciar irrigação agora"
              variant="onColor"
              textColor={palette.red700}
              onPress={() => setConfirmZone(urgentZone)}
            />
          </View>
        ) : null}

        {inProgress.map((item) => (
          <Card key={item.id} tone="info">
            <Text style={styles.cardTitle}>Em andamento: {item.zone_name}</Text>
            <Text style={styles.cardText}>
              Iniciada às {formatHHMM(item.started_at ?? item.scheduled_at)} • {item.duration_min} min previstos
            </Text>
            <Button title="Encerrar irrigação" icon="stop-circle-outline" onPress={() => setFinishing(item)} />
          </Card>
        ))}

        <Card style={styles.zonesCard}>
          <Text style={styles.zonesTitle}>Controle por Zona</Text>
          {zoneList.length === 0 ? <Text style={[styles.small, { padding: space.lg }]}>Nenhuma zona cadastrada.</Text> : null}
          {zoneList.map((zone) => {
            const running = inProgress.some((i) => i.zone_id === zone.id);
            const meta = ZONE_STATUS[zone.status];
            return (
              <View key={zone.id} style={styles.zoneRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.inline}>
                    <Dot color={meta.ring} />
                    <Text style={styles.zoneName}>{zone.name}</Text>
                  </View>
                  <Text style={styles.small}>
                    {zone.crop} · {zone.last_moisture_pct != null ? `${Math.round(zone.last_moisture_pct)}% umidade` : 'sem leitura'}
                  </Text>
                </View>
                {running ? <Tag text="Irrigando" bg={palette.blue100} color={palette.blue700} /> : null}
                <Toggle
                  label={running ? `Encerrar irrigação de ${zone.name}` : `Iniciar irrigação de ${zone.name}`}
                  value={running}
                  disabled={action.isPending}
                  onValueChange={(on) => toggleZone(zone, on)}
                />
              </View>
            );
          })}
        </Card>

        <View>
          <SectionTitle title="Agenda de Hoje" />
          <Text style={styles.small}>Recomendações do sensor e suas rotinas</Text>
        </View>
        {pending.length === 0 && doneToday.length === 0 ? (
          <EmptyState icon="calendar-outline" title="Nada agendado" text="Quando o sensor indicar necessidade, a recomendação aparece aqui." />
        ) : null}
        {pending.length === 0 && doneToday.length > 0 ? (
          <Text style={styles.cardText}>Nenhuma irrigação pendente.</Text>
        ) : null}
        {pending.map((item) => (
          <AgendaCard
            key={item.id}
            item={item}
            zone={zoneById.get(item.zone_id) ?? null}
            busy={action.isPending}
            autoApprove={farm.data?.auto_approve ?? true}
            onAct={(act) => run(item.id, act)}
            onStart={() => {
              const zone = zoneById.get(item.zone_id);
              if (zone) setConfirmZone(zone);
            }}
            onEnableAuto={() => navigation.navigate('Settings')}
          />
        ))}

        {doneToday.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showDone }}
            onPress={() => setShowDone((v) => !v)}
            style={styles.doneToggle}
          >
            <Ionicons name="checkmark-circle" size={20} color={palette.green700} />
            <Text style={styles.doneToggleText}>
              {doneToday.length} {doneToday.length === 1 ? 'concluída hoje' : 'concluídas hoje'}
            </Text>
            <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={18} color={palette.gray500} />
          </Pressable>
        ) : null}
        {showDone
          ? doneToday.map((item) => (
              <AgendaCard
                key={item.id}
                item={item}
                zone={zoneById.get(item.zone_id) ?? null}
                busy={false}
                autoApprove
                onAct={() => undefined}
                onStart={() => undefined}
                onEnableAuto={() => undefined}
              />
            ))
          : null}

        {(routines.data ?? []).length > 0 ? <SectionTitle title="Minhas rotinas" /> : null}
        {(routines.data ?? []).map((routine) => (
          <RoutineCard
            key={routine.id}
            routine={routine}
            onEdit={() => navigation.navigate('CreateRoutine', { routineId: routine.id })}
          />
        ))}

        <DashedButton title="Criar rotina de irrigação" onPress={() => navigation.navigate('CreateRoutine')} />
      </Screen>

      <StartIrrigationConfirm
        zone={confirmZone}
        openIrrigation={confirmZone ? openFor(confirmZone.id) : null}
        onClose={() => setConfirmZone(null)}
      />

      <ConfirmModal
        visible={finishing !== null}
        title={`Encerrar irrigação de ${finishing?.zone_name ?? ''}?`}
        message={finishing ? finishMessage(finishing, zoneById.get(finishing.zone_id) ?? null) : undefined}
        confirmLabel="Encerrar"
        loading={action.isPending}
        onCancel={() => setFinishing(null)}
        onConfirm={() => {
          if (!finishing) return;
          // Sem volume: o sistema calcula pelo tempo real de irrigação.
          action.mutate(
            { id: finishing.id, action: 'finish' },
            {
              onSuccess: () => setFinishing(null),
              onError: (err) => Alert.alert('Não foi possível encerrar', messageOf(err)),
            },
          );
        }}
      />
    </>
  );
}

function statusLine(item: IrrigationOut): { text: string; color: string } {
  switch (item.status) {
    case 'recommended':
      return { text: 'Aguardando seu aval', color: palette.action };
    case 'approved':
      return { text: 'Programada', color: palette.green700 };
    case 'postponed':
      return { text: `Adiada para ${formatDayTime(item.scheduled_at)}`, color: palette.amber700 };
    case 'done':
      return { text: `Concluída às ${formatHHMM(item.finished_at ?? item.scheduled_at)}`, color: palette.green700 };
    case 'skipped':
      return { text: item.reason ? `Pulada: ${item.reason.toLowerCase()}` : 'Pulada pelo sensor', color: palette.gray600 };
    default:
      return { text: '', color: palette.gray600 };
  }
}

function AgendaCard({
  item,
  zone,
  busy,
  autoApprove,
  onAct,
  onStart,
  onEnableAuto,
}: {
  item: IrrigationOut;
  zone: ZoneOut | null;
  busy: boolean;
  autoApprove: boolean;
  onAct: (action: IrrigationAction) => void;
  onStart: () => void;
  onEnableAuto: () => void;
}) {
  const tag = ORIGIN_TAG[item.origin];
  const line = statusLine(item);
  const volume = item.volume_l_actual ?? item.volume_l_estimated;
  const pending = item.status === 'recommended';

  return (
    <Card tone={pending ? 'info' : 'default'}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.inline}>
            <Text style={styles.zoneName}>{item.zone_name}</Text>
            <Tag text={tag.text} bg={tag.bg} color={tag.color} />
          </View>
          <Text style={styles.small}>
            {[zone?.crop, volume != null ? formatCubicMeters(volume) : item.status === 'done' ? 'volume não informado' : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <View style={styles.inline}>
            <Dot color={line.color} size={6} />
            <Text style={[styles.statusText, { color: line.color }]}>{line.text}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.timeValue}>{formatHHMM(item.scheduled_at)}</Text>
          <Text style={styles.small}>{item.duration_min} min</Text>
        </View>
      </View>

      {pending ? (
        <>
          <View style={styles.actions}>
            <Button title="Aprovar" onPress={() => onAct('approve')} loading={busy} style={{ flex: 1 }} />
            <Button title="Adiar" variant="ghost" onPress={() => onAct('postpone')} disabled={busy} style={{ flex: 1 }} />
          </View>
          {!autoApprove ? (
            <Pressable accessibilityRole="link" onPress={onEnableAuto}>
              <Text style={styles.autoLink}>Não quer aprovar toda vez? Ative a aprovação automática</Text>
            </Pressable>
          ) : null}
        </>
      ) : item.status === 'approved' ? (
        <View style={styles.actions}>
          <Button title="Iniciar" onPress={onStart} disabled={busy} style={{ flex: 1 }} />
          <Button title="Cancelar" variant="ghost" onPress={() => onAct('cancel')} disabled={busy} style={{ flex: 1 }} />
        </View>
      ) : item.status === 'postponed' ? (
        <View style={styles.actions}>
          <Button title="Aprovar" onPress={() => onAct('approve')} loading={busy} style={{ flex: 1 }} />
          <Button title="Cancelar" variant="ghost" onPress={() => onAct('cancel')} disabled={busy} style={{ flex: 1 }} />
        </View>
      ) : null}
    </Card>
  );
}

function RoutineCard({ routine, onEdit }: { routine: RoutineOut; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState(routine.active);
  const [saving, setSaving] = useState(false);

  async function toggle(value: boolean) {
    setActive(value);
    setSaving(true);
    try {
      await routinesApi.update(routine.id, { active: value });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines }),
        queryClient.invalidateQueries({ queryKey: queryKeys.irrigations }),
      ]);
    } catch (err) {
      setActive(!value);
      Alert.alert('Não foi possível salvar', messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Editar rotina de ${routine.zone_name}`} onPress={onEdit}>
      <Card style={[styles.routineCard, !active && { opacity: 0.7 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.inline}>
            <Text style={styles.zoneName}>{routine.zone_name}</Text>
            <Text style={styles.routineTime}>{formatHHMM(routine.start_time)}</Text>
          </View>
          <Text style={styles.small}>
            {describeWeekdays(routine.weekdays)} · {routine.duration_min} min
          </Text>
          <Text style={styles.small}>
            {routine.respect_sensor ? `Só irriga com umidade abaixo de ${routine.moisture_limit}%` : 'Sem regra de sensor'}
          </Text>
        </View>
        <Toggle label={`Rotina de ${routine.zone_name} ativa`} value={active} disabled={saving} onValueChange={toggle} />
        <Ionicons name="chevron-forward" size={18} color={palette.gray500} />
      </Card>
    </Pressable>
  );
}

/** Texto do encerramento: tempo decorrido e volume estimado (mesma regra do backend). */
function finishMessage(item: IrrigationOut, zone: ZoneOut | null): string {
  const started = item.started_at ? new Date(item.started_at).getTime() : null;
  const minutes = started ? Math.max(1, Math.round((Date.now() - started) / 60_000)) : item.duration_min;
  const parts = [`Irrigando há ${minutes} min.`];
  if (zone) parts.push(`Volume estimado pelo sistema: ${formatLiters(estimateVolumeL(zone.area_ha, minutes))}.`);
  return parts.join(' ');
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space.md },
  stat: { flex: 1, gap: 2 },
  label: { ...type.body, color: palette.gray600 },
  metric: { ...type.headline, fontSize: 24, color: palette.gray900 },
  small: { ...type.caption, color: palette.gray500 },
  cardTitle: { ...type.title, color: palette.gray900 },
  cardText: { ...type.body, color: palette.gray700 },
  urgent: { backgroundColor: palette.red700, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  urgentTitle: { ...type.title, color: palette.white },
  urgentText: { ...type.body, color: palette.red100 },
  zonesCard: { padding: 0, gap: 0, overflow: 'hidden' },
  zonesTitle: {
    ...type.bodyStrong,
    fontSize: 15,
    color: palette.gray800,
    padding: space.lg,
    paddingBottom: space.md,
    backgroundColor: palette.gray50,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: palette.gray100,
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  zoneName: { ...type.bodyStrong, fontSize: 16, color: palette.gray900 },
  statusText: { ...type.caption, fontWeight: '700' },
  timeValue: { ...type.headline, fontSize: 20, color: palette.gray800 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  actions: { flexDirection: 'row', gap: space.sm },
  autoLink: { ...type.caption, fontWeight: '700', color: palette.action, textAlign: 'center' },
  doneToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.gray200,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    minHeight: 48,
  },
  doneToggleText: { ...type.bodyStrong, flex: 1, color: palette.gray700 },
  routineCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  routineTime: { ...type.bodyStrong, fontSize: 16, color: palette.action },
});
