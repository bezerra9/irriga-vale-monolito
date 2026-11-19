import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Text } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { Button, Field, Screen } from '../components/ui';
import { messageOf } from '../lib/errors';
import type { RootNavProp } from '../navigation/types';
import { palette, space, type } from '../theme';

export function RegisterScreen() {
  const navigation = useNavigation<RootNavProp>();
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', farmName: '', email: '', password: '', city: 'Petrolina' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    setError(null);
    if (form.name.trim().length < 2) return setError('Informe seu nome.');
    if (form.farmName.trim().length < 2) return setError('Informe o nome da fazenda.');
    if (!form.email.includes('@')) return setError('Informe um e-mail válido.');
    if (form.password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');

    setLoading(true);
    try {
      await register({
        name: form.name.trim(),
        farm_name: form.farmName.trim(),
        email: form.email.trim(),
        password: form.password,
        city: form.city.trim() || 'Petrolina',
        state: 'PE',
      });
      // A navegação para o painel acontece sozinha quando o status vira "signedIn".
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen
      footer={
        <>
          <Button title="Criar conta" onPress={submit} loading={loading} />
          <Text style={{ ...type.body, color: palette.gray500, textAlign: 'center', paddingVertical: space.sm }} onPress={() => navigation.goBack()}>
            Já tenho conta
          </Text>
        </>
      }
    >
      <Field label="Seu nome" value={form.name} onChangeText={set('name')} textContentType="name" />
      <Field label="Nome da fazenda" value={form.farmName} onChangeText={set('farmName')} />
      <Field
        label="E-mail"
        value={form.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <Field label="Senha (mínimo 8 caracteres)" value={form.password} onChangeText={set('password')} secureTextEntry />
      <Field label="Cidade" value={form.city} onChangeText={set('city')} />
      {error ? <Text style={{ ...type.body, color: palette.red700 }}>{error}</Text> : null}
    </Screen>
  );
}
