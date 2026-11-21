import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { S } from '../../strings';
import { colors, spacing, useGameTheme } from '../../theme';
import { AppText, Badge, Button, Card, HAPTICS_KEY, Icon, IconButton, Screen, TextField, setHapticsEnabled } from '../../ui';
import storage from '../../utils/storage';

export default function SettingsScreen({ navigation }) {
  const theme = useGameTheme();
  const [nickname, setNickname] = useState('');
  const [haptics, setHaptics] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const name = (await storage.getItem('playerName')) || '';
        const h = await storage.getItem(HAPTICS_KEY);
        if (!active) return;
        setNickname(name);
        setHaptics(h !== 'false');
      } catch (e) {
        console.error('Error loading settings:', e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async () => {
    const name = nickname.trim();
    if (!name) {
      setError(S.settings.nicknameEmpty);
      return;
    }
    try {
      await storage.setItem('playerName', name);
      await storage.setItem(HAPTICS_KEY, haptics ? 'true' : 'false');
      setHapticsEnabled(haptics);
      setNickname(name);
      setError('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      console.log('✅ Settings saved');
    } catch (e) {
      console.error('Error saving settings:', e);
      Alert.alert(S.settings.error, S.settings.saveFailed);
    }
  };

  return (
    <Screen
      header={
        <View style={styles.topBar}>
          <IconButton icon="back" label={S.settings.back} onPress={() => navigation.goBack()} />
        </View>
      }
    >
      <View style={styles.titleBlock}>
        <AppText variant="display" align="center" accessibilityRole="header">
          {S.settings.title}
        </AppText>
        <AppText variant="subtitle" align="center" color={colors.inkSoft}>
          {S.settings.subtitle}
        </AppText>
      </View>

      <Card style={styles.section}>
        <View style={styles.row}>
          <Icon name="player" size={24} color={theme.accentInk} />
          <AppText variant="title" color={theme.accentInk} accessibilityRole="header">
            {S.settings.nicknameTitle}
          </AppText>
        </View>
        <TextField
          label={S.settings.nicknameLabel}
          value={nickname}
          onChangeText={(t) => {
            setNickname(t);
            if (error) setError('');
          }}
          placeholder={S.settings.nicknamePlaceholder}
          maxLength={20}
          error={error}
        />
      </Card>

      <Card style={styles.section}>
        <View style={styles.row}>
          <Icon name="gesture" size={24} color={theme.accentInk} />
          <AppText variant="title" color={theme.accentInk} accessibilityRole="header">
            {S.settings.experienceTitle}
          </AppText>
        </View>
        <View style={styles.row}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{S.settings.haptics}</AppText>
            <AppText variant="caption" color={colors.inkSoft}>
              {S.settings.hapticsHint}
            </AppText>
          </View>
          <Switch
            value={haptics}
            onValueChange={setHaptics}
            accessibilityLabel={S.settings.haptics}
            trackColor={{ false: colors.line, true: theme.accent }}
            thumbColor={colors.card}
          />
        </View>
      </Card>

      <Button title={S.settings.save} icon="check" onPress={handleSave} fullWidth />
      {saved ? <Badge label={S.settings.saved} icon="checkCircle" tone="success" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  titleBlock: { gap: spacing.xs, paddingTop: spacing.md },
  section: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
});
