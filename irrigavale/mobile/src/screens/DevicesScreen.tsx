import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { devicesApi } from '../api/endpoints';
import type { DeviceOut } from '../api/types';
import { Card, ConfirmModal, DashedButton, EmptyState, ErrorBanner, Loading, Screen, SignalBars, Tag } from '../components/ui';
import { queryKeys, useDevices, useZones } from '../hooks/queries';
import { messageOf } from '../lib/errors';
import { formatAgo } from '../lib/format';
import { batteryColor, signalBars } from '../lib/status';
import type { RootNavProp } from '../navigation/types';
import { palette, space, type } from '../theme';

export function DevicesScreen() {
  const navigation = useNavigation<RootNavProp>();
  const queryClient = useQueryClient();
  const devices = useDevices();
  const zones = useZones();
  const [removing, setRemoving] = useState<DeviceOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (devices.isPending) return <Loading />;
  const list = devices.data ?? [];
  const zoneName = (device: DeviceOut) => (zones.data ?? []).find((z) => z.id === device.zone_id)?.name ?? null;

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      await devicesApi.revoke(removing.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.devices }),
        queryClient.invalidateQueries({ queryKey: queryKeys.zones }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
      ]);
      setRemoving(null);
    } catch (err) {
      setRemoving(null);
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen refreshing={devices.isRefetching} onRefresh={() => Promise.all([devices.refetch(), zones.refetch()])}>
      {error ? <ErrorBanner message={error} /> : null}
      {list.length === 0 ? (
        <EmptyState icon="radio-outline" title="Nenhum sensor" text="Cadastre o primeiro sensor para começar." />
      ) : (
        <Card style={{ padding: 0, gap: 0 }}>
          {list.map((device, index) => {
            const tone =
              device.connection === 'online'
                ? { text: 'Online', bg: palette.green100, color: palette.green700 }
                : device.connection === 'offline'
                  ? { text: 'Offline', bg: palette.red100, color: palette.red700 }
                  : { text: 'Aguardando', bg: palette.gray100, color: palette.gray600 };
            return (
              <View key={device.id} style={[styles.row, index > 0 && styles.divider]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.inline}>
                    <Text style={styles.code}>{device.code}</Text>
                    <Tag text={tone.text} bg={tone.bg} color={tone.color} />
                  </View>
                  <Text style={styles.small}>
                    {zoneName(device) ?? 'Sem zona'} ·{' '}
                    {device.last_seen_at ? `visto ${formatAgo(device.last_seen_at)}` : 'nunca enviou dados'}
                  </Text>
                  {device.battery_pct != null ? (
                    <View style={styles.inline}>
                      <SignalBars bars={signalBars(device.signal_dbm)} color={batteryColor(device.battery_pct)} />
                      <Text style={[styles.small, { color: batteryColor(device.battery_pct), fontWeight: '700' }]}>
                        Bateria {device.battery_pct}%
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remover sensor ${device.code}`}
                  onPress={() => setRemoving(device)}
                  style={styles.removeButton}
                  hitSlop={6}
                >
                  <Ionicons name="trash-outline" size={20} color={palette.red700} />
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}
      <DashedButton title="Adicionar sensor" onPress={() => navigation.navigate('AddSensor')} />

      <ConfirmModal
        visible={removing !== null}
        title={`Remover o sensor ${removing?.code ?? ''}?`}
        message={
          removing
            ? [
                `Ele deixa de enviar leituras${zoneName(removing) ? ` para ${zoneName(removing)}` : ''} e a chave atual para de funcionar.`,
                'O histórico de leituras é mantido. Para usar o mesmo aparelho de novo, basta pareá-lo outra vez.',
              ].join('\n\n')
            : undefined
        }
        confirmLabel="Remover"
        destructive
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  divider: { borderTopWidth: 1, borderTopColor: palette.gray100 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  code: { ...type.bodyStrong, color: palette.gray900 },
  small: { ...type.caption, color: palette.gray500 },
  removeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.red50,
  },
});
