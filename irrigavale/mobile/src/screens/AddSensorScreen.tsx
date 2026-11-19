import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { devicesApi, zonesApi } from '../api/endpoints';
import type { DeviceCreatedOut } from '../api/types';
import { Button, Card, Field, Screen, Select, SheetHeader, type SelectOption } from '../components/ui';
import { queryKeys, useZones } from '../hooks/queries';
import { messageOf } from '../lib/errors';
import type { RootNavProp } from '../navigation/types';
import { palette, radius, space, type } from '../theme';

const CODE_REGEX = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
const CROPS = ['Manga Tommy', 'Manga Palmer', 'Uva Itália', 'Uva Vitória', 'Acerola', 'Goiaba', 'Coco', 'Maracujá'];
const OTHER_CROP = '__outra__';
const NEW_ZONE = '__nova__';

const STEPS = [
  'Ligue o ESP32 e aguarde o LED de status piscar.',
  'Anote o código impresso na etiqueta (ex.: ESP32-0004).',
  'Fique a até 10 metros do dispositivo.',
];

export function AddSensorScreen() {
  const navigation = useNavigation<RootNavProp>();
  const queryClient = useQueryClient();
  const zones = useZones();

  const [code, setCode] = useState('');
  const [zoneChoice, setZoneChoice] = useState<string | null>(null);
  const [zoneName, setZoneName] = useState('');
  const [cropChoice, setCropChoice] = useState<string | null>(null);
  const [otherCrop, setOtherCrop] = useState('');
  const [area, setArea] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<DeviceCreatedOut | null>(null);

  const zoneList = zones.data ?? [];
  const selectedZone = zoneChoice ?? NEW_ZONE;
  const isNewZone = selectedZone === NEW_ZONE;
  const zoneOptions: SelectOption<string>[] = [
    { label: '+ Nova zona', value: NEW_ZONE },
    ...zoneList.map((z) => ({ label: `${z.name} — ${z.crop}`, value: z.id })),
  ];
  const cropOptions: SelectOption<string>[] = [
    ...CROPS.map((c) => ({ label: c, value: c })),
    { label: 'Outra cultura…', value: OTHER_CROP },
  ];

  async function submit() {
    setError(null);
    const normalizedCode = code.trim().toUpperCase();
    if (!CODE_REGEX.test(normalizedCode)) return setError('Código inválido. Use letras, números e hífen (ex.: ESP32-0004).');

    let targetZoneName = zoneList.find((z) => z.id === selectedZone)?.name ?? '';
    let crop = '';
    let areaValue = 0;
    if (isNewZone) {
      crop = cropChoice === OTHER_CROP ? otherCrop.trim() : cropChoice ?? '';
      areaValue = Number(area.replace(/[^\d,.]/g, '').replace(',', '.'));
      if (zoneName.trim().length < 1) return setError('Informe o nome da zona.');
      if (crop.length < 1) return setError('Selecione a cultura.');
      if (!area.trim() || !Number.isFinite(areaValue) || areaValue <= 0) return setError('Informe a área monitorada em hectares.');
      targetZoneName = zoneName.trim();
    }

    setSaving(true);
    try {
      let targetZoneId = selectedZone;
      if (isNewZone) {
        const zone = await zonesApi.create({ name: targetZoneName, crop, area_ha: areaValue });
        targetZoneId = zone.id;
      }
      const device = await devicesApi.create({
        code: normalizedCode,
        name: `Sensor ${targetZoneName}`.slice(0, 80),
        zone_id: targetZoneId,
      });
      setCreated(device);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.zones }),
        queryClient.invalidateQueries({ queryKey: queryKeys.devices }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
      ]);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <SheetHeader
      title={created ? 'Sensor pareado' : 'Adicionar sensor'}
      subtitle={created ? undefined : 'Pareie um novo dispositivo à sua fazenda'}
      onClose={() => navigation.goBack()}
    />
  );

  if (created) {
    return (
      <Screen header={header}>
          <Card tone="ok">
            <Text style={styles.title}>Sensor cadastrado</Text>
            <Text style={styles.body}>
              {created.code} está pronto. Grave a chave abaixo no firmware do ESP32 (cabeçalho{' '}
              <Text style={styles.mono}>X-Device-Key</Text>).
            </Text>
          </Card>
          <Card tone="warn">
            <Text style={styles.warnTitle}>Esta chave só aparece agora.</Text>
            <Text selectable style={styles.key}>{created.api_key}</Text>
            <Text style={styles.body}>Se perder a chave, gere outra em Configurações. A antiga deixa de funcionar.</Text>
          </Card>
          <Button title="Concluir" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      <Card>
        <Text style={styles.cardTitle}>Antes de começar</Text>
        {STEPS.map((step, index) => (
          <View key={step} style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <Text style={[styles.body, { flex: 1 }]}>{step}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Field
          label="Código do sensor"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="ESP32-0004"
        />
        {zoneList.length > 0 ? (
          <Select label="Zona" value={selectedZone} options={zoneOptions} onChange={setZoneChoice} />
        ) : null}
        {isNewZone ? (
          <>
            <Field label="Nome da zona" value={zoneName} onChangeText={setZoneName} placeholder="Zona D" />
            <Select
              label="Cultura"
              value={cropChoice}
              options={cropOptions}
              onChange={setCropChoice}
              placeholder="Selecione a cultura"
            />
            {cropChoice === OTHER_CROP ? (
              <Field label="Qual cultura?" value={otherCrop} onChangeText={setOtherCrop} placeholder="Ex.: Banana" />
            ) : null}
            <Field
              label="Área monitorada (ha)"
              value={area}
              onChangeText={setArea}
              keyboardType="decimal-pad"
              placeholder="2,0"
            />
          </>
        ) : null}
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Parear sensor" onPress={submit} loading={saving} />
      <Button title="Cancelar" variant="text" onPress={() => navigation.goBack()} disabled={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: palette.gray900 },
  cardTitle: { ...type.bodyStrong, fontSize: 16, color: palette.gray900 },
  body: { ...type.body, color: palette.gray700 },
  warnTitle: { ...type.bodyStrong, color: palette.amber700 },
  mono: { fontWeight: '700' },
  key: {
    ...type.bodyStrong,
    fontFamily: 'monospace',
    backgroundColor: palette.white,
    borderRadius: radius.sm,
    padding: space.md,
    color: palette.gray900,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { ...type.caption, fontWeight: '700', color: palette.blue800 },
  error: { ...type.body, color: palette.red700 },
});
