import React from 'react';
import { S } from '../../strings';
import { AppText, Button, Dialog } from '../../ui';
import { colors } from '../../theme';

// Shown to the teams that are NOT playing when the word is golden.
export default function GoldenWordPopup({ visible, onClose }) {
  if (!visible) return null;

  return (
    <Dialog
      visible={visible}
      icon="golden"
      title={S.alias.golden.popupTitle}
      onRequestClose={onClose}
      dismissOnScrim
      actions={<Button title={S.alias.golden.understood} icon="check" onPress={onClose} fullWidth />}
    >
      <AppText align="center" color={colors.inkSoft}>
        {S.alias.golden.popupSubtext}
      </AppText>
    </Dialog>
  );
}
