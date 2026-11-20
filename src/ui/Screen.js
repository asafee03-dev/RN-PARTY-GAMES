import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

/**
 * Screen shell: warm paper background, safe-area padding, optional scroll,
 * and a fixed `footer` slot (e.g. the banner ad) below the content.
 */
export default function Screen({ scroll = true, header, footer, contentStyle, children, keyboardShouldPersistTaps = 'handled', scrollEnabled = true }) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: header ? spacing.sm : Math.max(insets.top, spacing.lg),
    paddingBottom: footer ? spacing.lg : Math.max(insets.bottom, spacing.lg),
  };

  return (
    <View style={styles.root}>
      {header ? <View style={{ paddingTop: insets.top }}>{header}</View> : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, padding, contentStyle]}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          showsVerticalScrollIndicator={false}
          scrollEnabled={scrollEnabled}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, padding, contentStyle]}>{children}</View>
      )}
      {footer ? <View style={{ paddingBottom: insets.bottom }}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  fill: {
    flex: 1,
  },
});
