import React from 'react';
import { View } from 'react-native';

/**
 * Esconde um desenho dos leitores de tela (TalkBack e navegador).
 * As props de acessibilidade ficam na View, que sabe traduzi-las na web;
 * no <Svg> elas vazam para o DOM e geram aviso do React.
 */
export function Decorative({ children }: { children: React.ReactNode }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      {children}
    </View>
  );
}
