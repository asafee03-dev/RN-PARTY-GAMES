import React from 'react';
import { Text } from 'react-native';
import { colors, typography } from '../theme';
import { textAlignFor } from './direction';

/**
 * The only text component screens should use.
 * - Rubik via the type scale (`variant`)
 * - Respects the system font size (allowFontScaling stays on); pass
 *   `maxScale` only for very dense elements like board tiles
 * - `align` is logical: 'start' | 'center' | 'end' (correct in RTL)
 */
export default function AppText({
  variant = 'body',
  color = colors.ink,
  align = 'start',
  maxScale,
  style,
  children,
  ...rest
}) {
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={maxScale}
      style={[typography[variant] || typography.body, { color, textAlign: textAlignFor(align) }, style]}
    >
      {children}
    </Text>
  );
}
