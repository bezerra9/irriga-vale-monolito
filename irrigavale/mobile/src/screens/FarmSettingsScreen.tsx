import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { farmApi } from '../api/endpoints';
import type { FarmOut } from '../api/types';
import { Button, Card, Field, Loading, Screen, SectionTitle } from '../components/ui';
import { queryKeys, useFarm } from '../hooks/queries';
import { messageOf } from '../lib/errors';
import { parseHHMM } from '../lib/format';
import type { RootNavProp } from '../navigation/types';
import { palette, space, type } from '../theme';

export function FarmSettingsScreen() {
  const farm = useFarm();
  if (farm.isPending || !farm.data) return <Loading />;
  return <FarmForm key={farm.dataUpdatedAt} farm={farm.data} />;
}

function parseDecimal(text: string): number {
  return Number(text.replace(/\./g, '').replace(',', '.'));
}

function FarmForm({ farm }: { farm: FarmOut }) {
  const navigation = useNavigation<RootNavProp>();
  const queryClient = useQueryClient();
  const [name, setName] = useState(farm.name);
  const [city, setCity] = useState(farm.city);
  const [goal, setGoal] = useState(String(farm.daily_water_goal_l));
  const [price, setPrice] = useState(farm.water_price_brl_per_m3.toFixed(2).replace('.', ','));
  const [startWindow, setStartWindow] = useState(farm.irrigation_window_start.slice(0, 5));
  const [quietStart, setQuietStart] = useState(farm.quiet_hours_start.slice(0, 5));
  const [quietEnd, setQuietEnd] = useState(farm.quiet_hours_end.slice(0, 5));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    const next: Record<string, string> = {};
    const w = parseHHMM(startWindow);
    const qs = parseHHMM(quietStart);
    const qe = parseHHMM(quietEnd);
    const litres = Number(goal.replace(/\D/g, ''));
    const priceValue = parseDecimal(price);
    if (name.trim().length < 2) next.name = 'Informe o nome da fazenda.';
    if (!w) next.window = 'Use o formato HH:MM (ex.: 05:00).';
    if (!qs) next.quietStart = 'Use HH:MM.';
    if (!qe) next.quietEnd = 'Use HH:MM.';
    if (!goal.trim() || !Number.isFinite(litres)) next.goal = 'Informe um número de litros.';
    if (!Number.isFinite(priceValue) || priceValue < 0 || priceValue > 1000) next.price = 'Informe o preço em reais por m³.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !w || !qs || !qe) return;

    setSaving(true);
    try {
      await farmApi.update({
        name: name.trim(),
        city: city.trim(),
        daily_water_goal_l: litres,
        water_price_brl_per_m3: priceValue,
        irrigation_window_start: w,
        quiet_hours_start: qs,
        quiet_hours_end: qe,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.farm }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: queryKeys.weather }),
        queryClient.invalidateQueries({ queryKey: ['summary'] }),
      ]);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Não foi possível salvar', messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Field label="Nome da fazenda" value={name} onChangeText={setName} error={errors.name} />
        <Field label="Cidade" value={city} onChangeText={setCity} />
        <Text style={styles.small}>A cidade também define a previsão do tempo mostrada no início.</Text>
      </Card>

      <SectionTitle title="Água" />
      <Card>
        <Field label="Limite diário de água (litros)" value={goal} onChangeText={setGoal} keyboardType="number-pad" error={errors.goal} />
        <Field
          label="Preço da água (R$ por m³)"
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          error={errors.price}
        />
        <Text style={styles.small}>Usado para calcular a economia em reais em relação à irrigação sem sensor.</Text>
      </Card>

      <SectionTitle title="Horários" />
      <Card>
        <Field
          label="Início da janela de irrigação (HH:MM)"
          value={startWindow}
          onChangeText={setStartWindow}
          keyboardType="numbers-and-punctuation"
          error={errors.window}
        />
        <Text style={styles.small}>As recomendações são agendadas nesse horário, de madrugada, quando a evaporação é menor.</Text>
        <View style={styles.twoCols}>
          <View style={{ flex: 1 }}>
            <Field
              label="SMS em silêncio: início"
              value={quietStart}
              onChangeText={setQuietStart}
              keyboardType="numbers-and-punctuation"
              error={errors.quietStart}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Fim"
              value={quietEnd}
              onChangeText={setQuietEnd}
              keyboardType="numbers-and-punctuation"
              error={errors.quietEnd}
            />
          </View>
        </View>
      </Card>

      <Button title="Salvar" onPress={save} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  small: { ...type.caption, color: palette.gray500 },
  twoCols: { flexDirection: 'row', gap: space.md },
});
