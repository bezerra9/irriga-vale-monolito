import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useAuth } from '../auth/AuthContext';
import { Decorative } from '../components/Decorative';
import { Button, Field } from '../components/ui';
import { messageOf } from '../lib/errors';
import type { RootNavProp } from '../navigation/types';
import { palette, space, type } from '../theme';

/** Gota sobre ondas: marca do IrrigaVale. */
function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <Decorative>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Path d="M24 6c5 7 9 11.5 9 16.5a9 9 0 0 1-18 0C15 17.5 19 13 24 6z" fill={palette.white} />
        <Path d="M11 30c3 6 8 9 13 9s10-3 13-9" stroke={palette.white} strokeWidth={3.2} strokeLinecap="round" fill="none" />
        <Path
          d="M16 32.5c2.2 3 5 4.5 8 4.5s5.8-1.5 8-4.5"
          stroke={palette.blue200}
          strokeWidth={3.2}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Decorative>
  );
}

export function LoginScreen() {
  const navigation = useNavigation<RootNavProp>();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  async function submit() {
    setError(null);
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = 'Informe seu e-mail.';
    else if (!email.includes('@')) next.email = 'E-mail inválido.';
    if (!password) next.password = 'Informe sua senha.';
    setFieldErrors(next);
    if (next.email || next.password) return;
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={[styles.circle, styles.circleTop]} />
      <View style={[styles.circle, styles.circleBottom]} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        {/* Com edge-to-edge (SDK 54+) o Android não redimensiona a tela para o teclado: 'padding' nas duas plataformas. */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          {/* A área azul cresce para ocupar a tela; o cartão branco tem só a altura do formulário. */}
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={styles.brand}>
              <View style={styles.logo}>
                <LogoMark />
              </View>
              <Text style={styles.brandName} accessibilityRole="header">
                Irriga<Text style={{ fontWeight: '800' }}>Vale</Text>
              </Text>
              <Text style={styles.brandTagline}>Irrigação inteligente para o Vale do São Francisco</Text>
            </View>

            <View style={[styles.sheet, styles.sheetContent]}>
              <View>
                <Text style={styles.title}>Entrar</Text>
                <Text style={styles.subtitle}>Acesse o painel da sua fazenda</Text>
              </View>

              <Field
                label="E-mail"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="voce@suafazenda.com.br"
                error={fieldErrors.email}
              />

              <Field
                label="Senha"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                textContentType="password"
                onSubmitEditing={submit}
                error={fieldErrors.password}
                right={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    onPress={() => setShowPassword((v) => !v)}
                    style={styles.showButton}
                  >
                    <Text style={styles.link}>{showPassword ? 'Ocultar' : 'Mostrar'}</Text>
                  </Pressable>
                }
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Button title="Entrar" onPress={submit} loading={loading} />

              <Text style={styles.footer}>
                Ainda não tem conta?{' '}
                <Text style={styles.link} onPress={() => navigation.navigate('Register')}>
                  Cadastre-se
                </Text>
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.navy, overflow: 'hidden' },
  circle: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', pointerEvents: 'none' },
  circleTop: { width: 220, height: 220, top: -60, right: -90 },
  circleBottom: { width: 180, height: 180, top: 330, left: -80 },
  brand: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: space.xxl,
    paddingBottom: 48,
    gap: space.sm,
    paddingHorizontal: space.xl,
  },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontSize: 32, lineHeight: 40, color: palette.white, marginTop: space.md },
  brandTagline: { ...type.body, color: palette.blue200, textAlign: 'center' },
  sheet: { backgroundColor: palette.white, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetContent: { padding: space.xxl, gap: space.md, paddingBottom: 40 },
  title: { ...type.headline, color: palette.gray900 },
  subtitle: { ...type.body, color: palette.gray500 },
  showButton: { height: 46, justifyContent: 'center', paddingHorizontal: space.md },
  error: { ...type.body, color: palette.red700 },
  footer: { ...type.body, color: palette.gray500, textAlign: 'center', marginTop: space.sm },
  link: { ...type.bodyStrong, color: palette.action, fontWeight: '700' },
});
