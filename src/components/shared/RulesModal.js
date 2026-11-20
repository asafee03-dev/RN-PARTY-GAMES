import React from 'react';
import { StyleSheet } from 'react-native';
import { S } from '../../strings';
import { GameThemeProvider, spacing } from '../../theme';
import { AppText, Button, Dialog } from '../../ui';

/**
 * In-game rules window. Same props as before, so every game keeps working:
 * visible, onClose, variant (game key), gameMode ('word' -> Spy word mode).
 * Built on the shared Dialog; texts live in S.rules.
 */
export default function RulesModal({ visible, onClose, variant = 'draw', gameMode = null }) {
  const rulesKey = variant === 'spy' && gameMode === 'word' ? 'spyWord' : variant;
  const rules = S.rules[rulesKey] || S.rules.draw;
  // One paragraph per line of the original text, for comfortable reading
  const paragraphs = rules.content.split('\n').map((p) => p.trim()).filter(Boolean);

  return (
    <GameThemeProvider game={variant}>
      <Dialog
        visible={visible}
        icon="rules"
        title={rules.title}
        onRequestClose={onClose}
        dismissOnScrim
        actions={<Button title={S.common.close} icon="check" onPress={onClose} fullWidth />}
      >
        {paragraphs.map((p, i) => (
          <AppText key={i} variant="body" style={styles.paragraph}>
            {p}
          </AppText>
        ))}
      </Dialog>
    </GameThemeProvider>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    marginBottom: spacing.xs,
  },
});
