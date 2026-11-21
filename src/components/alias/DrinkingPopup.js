import React from 'react';
import { S } from '../../strings';
import { AppText, Button, Dialog } from '../../ui';
import { colors } from '../../theme';

// Drinking mode: the team that advanced least in the round drinks.
export default function DrinkingPopup({ visible, onClose, teamName }) {
  if (!visible) return null;

  return (
    <Dialog
      visible={visible}
      icon="drink"
      title={S.alias.drinking.title(teamName)}
      onRequestClose={onClose}
      dismissOnScrim
      actions={<Button title={S.alias.drinking.understood} icon="check" onPress={onClose} fullWidth />}
    >
      <AppText align="center" color={colors.inkSoft}>
        {S.alias.drinking.subtext}
      </AppText>
    </Dialog>
  );
}
