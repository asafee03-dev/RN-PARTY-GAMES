import React from 'react';
import { StyleSheet, View } from 'react-native';
import { S } from '../../strings';
import { colors, spacing } from '../../theme';
import { AppText, Button, Dialog } from '../../ui';

/**
 * Asked only of the host who is creating a room: regular mode (one phone per
 * player, room + lobby) or the game's local mode.
 * props: visible, onClose, onRegular, onLocal, localTitle, localHint, localIcon
 */
export default function PlayModeDialog({ visible, onClose, onRegular, onLocal, localTitle, localHint, localIcon = 'phone' }) {
  return (
    <Dialog visible={visible} icon="players" title={S.local.chooseTitle} onRequestClose={onClose} dismissOnScrim>
      <View style={styles.options}>
        <View style={styles.option}>
          <Button
            title={S.local.regularTitle}
            icon="players"
            onPress={() => {
              onClose();
              onRegular();
            }}
            fullWidth
          />
          <AppText variant="caption" align="center" color={colors.inkSoft}>
            {S.local.regularHint}
          </AppText>
        </View>
        <View style={styles.option}>
          <Button
            title={localTitle}
            icon={localIcon}
            variant="secondary"
            onPress={() => {
              onClose();
              onLocal();
            }}
            fullWidth
          />
          <AppText variant="caption" align="center" color={colors.inkSoft}>
            {localHint}
          </AppText>
        </View>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  options: { gap: spacing.lg },
  option: { gap: spacing.xs },
});
