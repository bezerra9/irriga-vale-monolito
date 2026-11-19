import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { routinesApi } from '../api/endpoints';
import type { RoutineOut } from '../api/types';
import { Button, Card, ConfirmModal, Field, Loading, Screen, Select, SheetHeader, Toggle } from '../components/ui';
import { queryKeys, useInvalidateIrrigationViews, useRoutines, useZones } from '../hooks/queries';
import { useQueryClient } from '@tanstack/react-query';
import { messageOf } from '../lib/errors';
import { estimateVolumeL, formatCubicMeters, formatHHMM, parseHHMM, WEEK_DISPLAY_ORDER, weekdayName } from '../lib/format';
import type { RootNavProp, RootStackParamList } from '../navigation/types';
import { palette, radius, space, type } from '../theme';

const DURATIONS = [15, 30, 45, 60, 90, 120];
const MOISTURE_STEP = 5;
// Letras na ordem de exibição (domingo primeiro).
const DAY_LETTER: Record<number, string> = { 6: 'D', 0: 'S', 1: 'T', 2: 'Q', 3: 'Q', 4: 'S', 5: 'S' };

/** Cria uma rotina ou, com `routineId`, edita/exclui uma existente. */
export function CreateRoutineScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'CreateRoutine'>>();
  const routines = useRoutines();
  const routineId = route.params?.routineId;
  if (routineId && routines.isPending) return <Loading />;
  const routine = routineId ? (routines.data ?? []).find((r) => r.id === routineId) ?? null : null;
  return <RoutineForm key={routine?.id ?? 'nova'} routine={routine} />;
}

function RoutineForm({ routine }: { routine: RoutineOut | null }) {
  const navigation = useNavigation<RootNavProp>();
  const queryClient = useQueryClient();
  const zones = useZones();
  const invalidate = useInvalidateIrrigationViews();
  const editing = routine !== null;

  const [zoneId, setZoneId] = useState<string | null>(routine?.zone_id ?? null);
  const [days, setDays] = useState<number[]>(routine?.weekdays ?? [0, 1, 2, 3, 4]);
  const [startTime, setStartTime] = useState(routine ? formatHHMM(routine.start_time) : '05:00');
  const [duration, setDuration] = useState(routine?.duration_min ?? 30);
  const [respectSensor, setRespectSensor] = useState(routine?.respect_sensor ?? true);
  const [limit, setLimit] = useState(routine?.moisture_limit ?? 40);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!routine) return;
    setDeleting(true);
    try {
      await routinesApi.remove(routine.id);
      await Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: queryKeys.routines })]);
      setConfirmDelete(false);
      navigation.goBack();
    } catch (err) {
      setConfirmDelete(false);
      setError(messageOf(err));
    } finally {
      setDeleting(false);
    }
  }

  const zoneList = zones.data ?? [];
  // Rotinas antigas podem ter uma duração fora da lista padrão (ex.: 40 min).
  const durationOptions = [...new Set([...DURATIONS, duration])]
    .sort((a, b) => a - b)
    .map((d) => ({ label: `${d} min`, value: d }));
  const selectedZoneId = zoneId ?? zoneList[0]?.id ?? null;
  const selectedZone = zoneList.find((z) => z.id === selectedZoneId) ?? null;
  const estimate = selectedZone ? estimateVolumeL(selectedZone.area_ha, duration) : null;

  function toggleDay(index: number) {
    setDays((current) => (current.includes(index) ? current.filter((d) => d !== index) : [...current, index].sort()));
  }

  async function save() {
    setError(null);
    const time = parseHHMM(startTime);
    if (!selectedZoneId) return setError('Cadastre uma zona antes de criar rotinas.');
    if (days.length === 0) return setError('Escolha pelo menos um dia da semana.');
    if (!time) return setError('Use o horário no formato HH:MM (ex.: 05:00).');

    setSaving(true);
    try {
      const fields = {
        weekdays: days,
        start_time: time,
        duration_min: duration,
        respect_sensor: respectSensor,
        moisture_limit: limit,
      };
      if (routine) await routinesApi.update(routine.id, fields);
      else await routinesApi.create({ zone_id: selectedZoneId, ...fields });
      await Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: queryKeys.routines })]);
      navigation.goBack();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      header={
        <SheetHeader
          title={editing ? 'Editar rotina' : 'Criar rotina'}
          subtitle={routine ? routine.zone_name : 'Programe uma irrigação recorrente'}
          onClose={() => navigation.goBack()}
        />
      }
    >
      <Card>
        {editing ? null : (
          <Select
            label="Zona"
            value={selectedZoneId}
            options={zoneList.map((z) => ({ label: `${z.name} — ${z.crop}`, value: z.id }))}
            onChange={setZoneId}
            placeholder="Nenhuma zona cadastrada"
          />
        )}

        <View style={{ gap: space.xs }}>
          <Text style={styles.label}>Dias da semana</Text>
          <View style={styles.days}>
            {WEEK_DISPLAY_ORDER.map((index) => {
              const on = days.includes(index);
              return (
                <Pressable
                  key={index}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={weekdayName(index)}
                  onPress={() => toggleDay(index)}
                  style={[styles.day, { backgroundColor: on ? palette.action : palette.gray100 }]}
                >
                  <Text style={[styles.dayText, { color: on ? palette.white : palette.gray600 }]}>{DAY_LETTER[index]}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.twoCols}>
          <View style={{ flex: 1 }}>
            <Field
              label="Horário de início"
              value={startTime}
              onChangeText={setStartTime}
              keyboardType="numbers-and-punctuation"
              placeholder="05:00"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Select
              label="Duração"
              value={duration}
              options={durationOptions}
              onChange={setDuration}
            />
          </View>
        </View>

        <View style={styles.estimate}>
          <Text style={styles.estimateLabel}>Volume estimado</Text>
          <Text style={styles.estimateValue}>{estimate != null ? formatCubicMeters(estimate) : '—'}</Text>
        </View>
      </Card>

      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.cardTitle}>Respeitar o sensor</Text>
            <Text style={styles.small}>Pula a rotina se o solo já estiver úmido</Text>
          </View>
          <Toggle label="Respeitar o sensor" value={respectSensor} onValueChange={setRespectSensor} />
        </View>
        {respectSensor ? (
          <View style={styles.limitBox}>
            <Text style={styles.limitText}>Só irrigar se a umidade estiver abaixo de</Text>
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Diminuir limite"
                onPress={() => setLimit((v) => Math.max(5, v - MOISTURE_STEP))}
                style={styles.stepButton}
                hitSlop={6}
              >
                <Text style={styles.stepButtonText}>−</Text>
              </Pressable>
              <Text style={styles.limitValue} accessibilityLabel={`Limite: ${limit} por cento`}>{limit}%</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Aumentar limite"
                onPress={() => setLimit((v) => Math.min(95, v + MOISTURE_STEP))}
                style={styles.stepButton}
                hitSlop={6}
              >
                <Text style={styles.stepButtonText}>+</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Salvar rotina" onPress={save} loading={saving} disabled={days.length === 0} />
      <Button title="Cancelar" variant="text" onPress={() => navigation.goBack()} disabled={saving} />
      {editing ? (
        <Button title="Excluir rotina" variant="outlineDanger" onPress={() => setConfirmDelete(true)} disabled={saving} />
      ) : null}

      <ConfirmModal
        visible={confirmDelete}
        title="Excluir rotina?"
        message={routine ? `${routine.zone_name} às ${formatHHMM(routine.start_time)}. Irrigações já registradas não são apagadas.` : undefined}
        confirmLabel="Excluir"
        destructive
        loading={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { ...type.bodyStrong, color: palette.gray700 },
  cardTitle: { ...type.bodyStrong, fontSize: 16, color: palette.gray900 },
  small: { ...type.caption, color: palette.gray500 },
  days: { flexDirection: 'row', gap: space.xs, justifyContent: 'space-between' },
  day: { flex: 1, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  dayText: { ...type.bodyStrong },
  twoCols: { flexDirection: 'row', gap: space.md },
  estimate: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: palette.gray50,
    borderRadius: radius.md,
    padding: space.md,
  },
  estimateLabel: { ...type.body, color: palette.gray500 },
  estimateValue: { ...type.bodyStrong, fontSize: 16, color: palette.action },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  limitBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: palette.blue50,
    borderRadius: radius.md,
    padding: space.md,
  },
  limitText: { ...type.caption, flex: 1, color: palette.blue800 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonText: { ...type.title, color: palette.blue800 },
  limitValue: { ...type.title, minWidth: 44, textAlign: 'center', color: palette.blue900 },
  error: { ...type.body, color: palette.red700 },
});
