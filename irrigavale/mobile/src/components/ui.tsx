import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, radius, space, type } from '../theme';

type CardTone = 'default' | 'brand' | 'navy' | 'info' | 'danger' | 'ok' | 'warn';

const CARD_TONE: Record<CardTone, { bg: string; border: string }> = {
  default: { bg: palette.white, border: palette.gray200 },
  brand: { bg: palette.blue50, border: palette.blue200 },
  navy: { bg: palette.navy, border: palette.navy },
  info: { bg: palette.blue50, border: palette.blue200 },
  danger: { bg: palette.red50, border: palette.red200 },
  ok: { bg: palette.green50, border: palette.green200 },
  warn: { bg: palette.amber50, border: palette.amber200 },
};

export function Card({
  children,
  tone = 'default',
  style,
}: {
  children: React.ReactNode;
  tone?: CardTone;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = CARD_TONE[tone];
  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

export function Screen({
  children,
  refreshing = false,
  onRefresh,
  scroll = true,
  header,
  top,
  footer,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  /** Fica fixo acima da rolagem. */
  header?: React.ReactNode;
  /** Rola junto com o conteúdo, sem o espaçamento lateral (ex.: faixa colorida do Início). */
  top?: React.ReactNode;
  /** Fica fixo no rodapé (ex.: botão principal do formulário) e sobe junto com o teclado. */
  footer?: React.ReactNode;
}) {
  const refresh = onRefresh ? (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.action} />
  ) : undefined;
  // Edge-to-edge: o fim da rolagem não pode ficar sob a barra de gestos (telas sem barra de abas).
  const { bottom } = useSafeAreaInsets();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {header}
      {/* Com edge-to-edge (SDK 54+) o Android não redimensiona a tela para o teclado. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {scroll ? (
          <ScrollView
            contentContainerStyle={[top ? undefined : styles.content, { paddingBottom: footer ? space.lg : space.xxl + bottom }]}
            refreshControl={refresh}
            keyboardShouldPersistTaps="handled"
          >
            {top ? (
              <>
                {top}
                <View style={styles.content}>{children}</View>
              </>
            ) : (
              children
            )}
          </ScrollView>
        ) : (
          <View style={[styles.content, { flex: 1 }]}>{children}</View>
        )}
        {footer ? <View style={[styles.footer, { paddingBottom: space.md + bottom }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  textColor,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outlineDanger' | 'onColor' | 'text';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Cor do texto no variant "onColor" (botão branco sobre card colorido). */
  textColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;
  const variantStyle = {
    primary: { bg: palette.action, fg: palette.white, border: palette.action },
    secondary: { bg: palette.blue100, fg: palette.blue800, border: palette.blue100 },
    ghost: { bg: palette.white, fg: palette.gray600, border: palette.gray300 },
    danger: { bg: palette.red100, fg: palette.red700, border: palette.red200 },
    outlineDanger: { bg: palette.white, fg: palette.red700, border: palette.red200 },
    onColor: { bg: palette.white, fg: textColor ?? palette.brand, border: palette.white },
    text: { bg: 'transparent', fg: palette.gray500, border: 'transparent' },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: variantStyle.bg, borderColor: variantStyle.border },
        variant === 'primary' && styles.buttonShadow,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Ionicons name={icon} size={18} color={variantStyle.fg} /> : null}
          <Text style={[styles.buttonText, { color: variantStyle.fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  count,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  count?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? palette.blue200 : palette.gray100 }]}
    >
      <Text style={[styles.chipText, { color: selected ? palette.blue900 : palette.gray600 }]}>{label}</Text>
      {count !== undefined ? (
        <View style={[styles.chipCount, { backgroundColor: palette.white }]}>
          <Text style={styles.chipCountText}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Tag({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color }]}>{text}</Text>
    </View>
  );
}

export function Field({
  label,
  error,
  right,
  ...input
}: TextInputProps & { label: string; error?: string | null; right?: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputBox, error ? { borderColor: palette.red700 } : null]}>
        <TextInput
          placeholderTextColor={palette.gray400}
          accessibilityLabel={label}
          style={styles.inputText}
          {...input}
        />
        {right}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function Toggle({
  value,
  onValueChange,
  label,
  disabled,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      trackColor={{ false: palette.gray300, true: palette.accent }}
      thumbColor={palette.white}
      // No react-native-web a bolinha ativa tem cor própria (verde-azulada por padrão).
      {...({ activeThumbColor: palette.white } as object)}
    />
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText} accessibilityRole="header">{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button">
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ icon, title, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={24} color={palette.blue700} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={palette.action} size="large" />
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card tone="danger">
      <Text style={styles.errorBannerText}>{message}</Text>
      {onRetry ? <Button title="Tentar de novo" variant="ghost" onPress={onRetry} /> : null}
    </Card>
  );
}

/** Cabeçalho das telas abertas como modal: título, subtítulo e botão fechar. */
export function SheetHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={styles.closeButton} hitSlop={8}>
        <Ionicons name="close" size={20} color={palette.gray600} />
      </Pressable>
    </View>
  );
}

export interface SelectOption<T extends string | number> {
  label: string;
  value: T;
}

/** Campo de seleção que abre uma lista em modal. */
export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Selecione',
  renderTrigger,
}: {
  label?: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  /** Substitui o campo padrão (ex.: uma linha de configurações que abre a lista). */
  renderTrigger?: (open: () => void, current: SelectOption<T> | undefined) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={renderTrigger ? undefined : styles.field}>
      {label && !renderTrigger ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      {renderTrigger ? renderTrigger(() => setOpen(true), current) : <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${current?.label ?? placeholder}` : current?.label ?? placeholder}
        onPress={() => setOpen(true)}
        style={styles.inputBox}
      >
        <Text style={[styles.inputText, styles.selectText, !current && { color: palette.gray500 }]} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={palette.gray400} style={{ marginRight: space.md }} />
      </Pressable>}
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.selectBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.selectSheet}>
            {label ? <Text style={styles.selectTitle}>{label}</Text> : null}
            <FlatList
              data={options}
              keyExtractor={(o) => String(o.value)}
              renderItem={({ item }) => {
                const selected = item.value === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    style={[styles.selectOption, selected && { backgroundColor: palette.blue50 }]}
                  >
                    <Text style={[styles.selectOptionText, selected && { color: palette.blue800, fontWeight: '700' }]}>
                      {item.label}
                    </Text>
                    {selected ? <Ionicons name="checkmark" size={18} color={palette.blue800} /> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/**
 * Confirmação em modal. Funciona também na web, onde o Alert.alert com botões não aparece.
 * Ações que mexem em água ou apagam dados devem passar por aqui.
 */
export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
      <View style={styles.selectBackdrop}>
        <View style={styles.confirmCard} accessibilityViewIsModal>
          <Text style={styles.confirmTitle} accessibilityRole="header">{title}</Text>
          {message ? <Text style={styles.confirmText}>{message}</Text> : null}
          <View style={styles.confirmActions}>
            <Button title="Cancelar" variant="ghost" onPress={onCancel} disabled={loading} style={{ flex: 1 }} />
            <Button
              title={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              onPress={onConfirm}
              loading={loading}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Botão tracejado de "adicionar" no fim das listas. */
export function DashedButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.dashed, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.dashedIcon}>
        <Ionicons name="add" size={16} color={palette.white} />
      </View>
      <Text style={styles.dashedText}>{title}</Text>
    </Pressable>
  );
}

/** Card de configurações com rótulo em caixa alta e linhas separadas. */
export function GroupCard({ title, children }: { title: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.card, styles.group]}>
      <Text style={styles.groupTitle}>{title.toUpperCase()}</Text>
      {items.map((child, index) => (
        <View key={index} style={styles.groupItem}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  onPress,
  right,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  const content = (
    <View style={styles.listRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.listRowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.listRowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={palette.gray400} /> : null)}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { backgroundColor: palette.gray50 }}>
      {content}
    </Pressable>
  );
}

/** Indicador de sinal em barras (0 a 3). */
export function SignalBars({ bars, color }: { bars: number; color: string }) {
  return (
    <View style={styles.bars} accessibilityLabel={`Sinal ${bars} de 3`}>
      {[1, 2, 3].map((level) => (
        <View
          key={level}
          style={[styles.bar, { height: 4 + level * 3, backgroundColor: level <= bars ? color : palette.gray200 }]}
        />
      ))}
    </View>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.pageBg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm, backgroundColor: palette.pageBg },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.lg,
    gap: space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: palette.white,
    borderBottomWidth: 1,
    borderBottomColor: palette.gray100,
    gap: space.md,
  },
  headerTitle: { ...type.title, color: palette.gray900 },
  headerSubtitle: { ...type.caption, color: palette.gray500, marginTop: 2 },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonDisabled: { opacity: 0.5 },
  // Web usa boxShadow (shadow* está descontinuado lá); no Android, elevation/shadow* funcionam
  // em qualquer arquitetura.
  buttonShadow: Platform.select({
    web: { boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)' },
    default: {
      shadowColor: palette.action,
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
  }),
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  buttonText: { ...type.bodyStrong },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    minHeight: 40,
  },
  chipText: { ...type.bodyStrong },
  chipCount: { borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  chipCountText: { ...type.caption, color: palette.gray700, fontWeight: '700' },
  tag: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3, alignSelf: 'flex-start' },
  tagText: { ...type.caption, fontWeight: '700' },
  field: { gap: space.xs },
  fieldLabel: { ...type.bodyStrong, color: palette.gray700 },
  inputBox: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.gray200,
    backgroundColor: palette.gray50,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputText: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: space.md,
    fontSize: 16,
    color: palette.gray800,
  },
  selectText: { textAlignVertical: 'center', lineHeight: 46 },
  selectBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', justifyContent: 'center', padding: space.xl },
  selectSheet: { backgroundColor: palette.white, borderRadius: radius.xl, paddingVertical: space.md, maxHeight: '70%' },
  selectTitle: { ...type.bodyStrong, color: palette.gray500, paddingHorizontal: space.xl, paddingBottom: space.sm },
  selectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    minHeight: 48,
  },
  selectOptionText: { ...type.body, fontSize: 16, color: palette.gray800 },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCard: { backgroundColor: palette.white, borderRadius: radius.xl, padding: space.xl, gap: space.md },
  confirmTitle: { ...type.title, color: palette.gray900 },
  confirmText: { ...type.body, color: palette.gray700 },
  confirmActions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  dashed: {
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: palette.blue200,
    backgroundColor: palette.blue50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  dashedIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedText: { ...type.bodyStrong, color: palette.blue800 },
  group: { padding: 0, gap: 0, overflow: 'hidden', backgroundColor: palette.white, borderColor: palette.gray200 },
  groupTitle: {
    ...type.caption,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: palette.gray500,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    backgroundColor: palette.gray50,
  },
  groupItem: { borderTopWidth: 1, borderTopColor: palette.gray100 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
  listRowTitle: { ...type.bodyStrong, fontSize: 15, color: palette.gray900 },
  listRowSubtitle: { ...type.caption, color: palette.gray500 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 13 },
  bar: { width: 4, borderRadius: 1 },
  errorText: { ...type.caption, color: palette.red700 },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm },
  sectionTitleText: { ...type.title, color: palette.gray800 },
  sectionAction: { ...type.bodyStrong, color: palette.action },
  empty: { alignItems: 'center', paddingVertical: space.xxl, gap: space.sm },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...type.title, color: palette.gray700 },
  emptyText: { ...type.body, color: palette.gray500, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  errorBannerText: { ...type.body, color: palette.red700 },
});
