/**
 * TEMPORARY dev-only screen to review the design system (open web with ?design).
 * Removed in the redesign cleanup step.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { S } from '../../strings';
import { colors, GameThemeProvider, gameThemes, radii, spacing } from '../../theme';
import { AppText, Badge, Button, Card, Dialog, Icon, IconButton, PlayerChip, ScoreToken, Screen, TextField, TimerDisplay } from '../../ui';

const T = S.designPreview;

const BASE_SWATCHES = [
  ['paper', colors.paper, colors.ink],
  ['card', colors.card, colors.ink],
  ['cardboard', colors.cardboard, colors.ink],
  ['line', colors.line, colors.ink],
  ['ink', colors.ink, colors.white],
  ['inkSoft', colors.inkSoft, colors.white],
  ['success', colors.success, colors.white],
  ['danger', colors.danger, colors.white],
  ['gold', colors.gold, colors.ink],
];

const GAMES = ['alias', 'codenames', 'spy', 'frequency', 'draw'];

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

function Swatch({ name, hex, fg }) {
  return (
    <View style={[styles.swatch, { backgroundColor: hex }]}>
      <AppText variant="label" color={fg} align="center">
        {name}
      </AppText>
      <AppText variant="caption" color={fg} align="center" style={styles.hex}>
        {hex}
      </AppText>
    </View>
  );
}

function GameRow({ game }) {
  const theme = gameThemes[game];
  return (
    <GameThemeProvider game={game}>
      <Card tone="tint" style={styles.gameCard}>
        <View style={styles.gameHeader}>
          <View style={[styles.gameEmblem, { backgroundColor: theme.accent, borderColor: theme.accentDeep }]}>
            <Icon name={game} size={28} color={theme.onAccent} />
          </View>
          <AppText variant="title" color={theme.accentInk}>
            {T.gameNames[game]}
          </AppText>
          <View style={styles.flex} />
          <ScoreToken value={7} size={44} />
        </View>
        <View style={styles.swatchRow}>
          <Swatch name="accent" hex={theme.accent} fg={theme.onAccent} />
          <Swatch name="tint" hex={theme.tint} fg={colors.ink} />
          {theme.signal ? <Swatch name="signal" hex={theme.signal} fg={colors.ink} /> : null}
        </View>
        <View style={styles.buttonRow}>
          <Button title={T.primary} size="sm" icon="play" style={styles.flex} />
          <Button title={T.secondary} size="sm" variant="secondary" icon="join" style={styles.flex} />
        </View>
      </Card>
    </GameThemeProvider>
  );
}

function TeamTile({ label, fill, fg, icon, deep }) {
  return (
    <View style={[styles.teamTile, { backgroundColor: fill, borderColor: deep }]}>
      <Icon name={icon} size={22} color={fg} />
      <AppText variant="label" color={fg} align="center" maxScale={1.3}>
        {label}
      </AppText>
    </View>
  );
}

export default function DesignPreviewScreen() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const cn = gameThemes.codenames;

  return (
    <Screen>
      <View style={styles.hero}>
        <AppText variant="display" align="center">
          {T.title}
        </AppText>
        <AppText variant="subtitle" color={colors.inkSoft} align="center">
          {T.subtitle}
        </AppText>
        <AppText variant="caption" color={colors.inkSoft} align="center">
          {T.textScaleNote}
        </AppText>
      </View>

      <Section title={T.sectionPalette}>
        <View style={styles.swatchGrid}>
          {BASE_SWATCHES.map(([n, hex, fg]) => (
            <Swatch key={n} name={n} hex={hex} fg={fg} />
          ))}
        </View>
      </Section>

      <Section title={T.sectionGames}>
        {GAMES.map((g) => (
          <GameRow key={g} game={g} />
        ))}
      </Section>

      <Section title={T.sectionType}>
        <Card>
          <AppText variant="display">{T.typeDisplay}</AppText>
          <AppText variant="heading">{T.typeHeading}</AppText>
          <AppText variant="title">{T.typeTitle}</AppText>
          <AppText variant="subtitle">{T.typeSubtitle}</AppText>
          <AppText variant="body">{T.typeBody}</AppText>
          <AppText variant="caption" color={colors.inkSoft}>
            {T.typeCaption}
          </AppText>
        </Card>
      </Section>

      <Section title={T.sectionButtons}>
        <GameThemeProvider game="draw">
          <View style={styles.stack}>
            <Button title={T.primary} icon="play" fullWidth />
            <Button title={T.secondary} variant="secondary" icon="join" fullWidth />
            <View style={styles.buttonRow}>
              <Button title={T.danger} variant="danger" icon="exit" size="sm" style={styles.flex} />
              <Button title={T.ghost} variant="ghost" icon="help" size="sm" style={styles.flex} />
            </View>
            <View style={styles.buttonRow}>
              <Button title={T.disabled} disabled size="sm" style={styles.flex} />
              <Button title={T.loadingButton} loading size="sm" style={styles.flex} />
            </View>
            <View style={styles.iconRow}>
              <IconButton icon="share" label={S.common.share} />
              <IconButton icon="rules" label={S.common.rules} />
              <IconButton icon="copy" label={S.common.copy} />
              <IconButton icon="exit" label={S.common.exit} variant="accent" />
              <IconButton icon="back" label={S.common.back} />
            </View>
            <Button title={T.openDialog} variant="secondary" icon="info" onPress={() => setDialogOpen(true)} />
          </View>
        </GameThemeProvider>
      </Section>

      <Section title={T.sectionChips}>
        <GameThemeProvider game="frequency">
          <View style={styles.chipWrap}>
            <PlayerChip name="דנה" isHost hostLabel={S.common.host} color="#C2453A" />
            <PlayerChip name="יואב" isMe meLabel={S.common.you} color="#2F6FB5" status={{ label: T.badgeTurn, icon: 'play', tone: 'accent' }} />
            <PlayerChip name="נועה" color="#3F7D3A" status={{ label: T.badgeSubmitted, icon: 'check', tone: 'success' }} />
            <PlayerChip name="עומר" color="#7A4FC2" dimmed status={{ label: T.badgeLeft, icon: 'exit', tone: 'muted' }} />
          </View>
          <View style={styles.badgeRow}>
            <Badge label={S.common.drinkingMode} icon="drink" tone="gold" />
            <Badge label={T.badgeSubmitted} icon="check" tone="success" />
            <Badge label={S.common.host} icon="crown" tone="accent" />
            <Badge label={T.badgeLeft} icon="exit" tone="neutral" />
          </View>
        </GameThemeProvider>
      </Section>

      <Section title={T.sectionCards}>
        <GameThemeProvider game="spy">
          <View style={styles.stack}>
            <Card>
              <AppText variant="title">{T.cardTitle}</AppText>
              <AppText>{T.cardBody}</AppText>
            </Card>
            <Card tone="tint">
              <AppText>{T.tintedCardBody}</AppText>
            </Card>
            <Card tone="cardboard">
              <AppText>{T.cardboardCardBody}</AppText>
            </Card>
          </View>
        </GameThemeProvider>
      </Section>

      <Section title={T.sectionInputs}>
        <GameThemeProvider game="alias">
          <View style={styles.stack}>
            <TextField label={T.nameLabel} placeholder={T.namePlaceholder} value={name} onChangeText={setName} />
            <TextField label={T.nameLabel} placeholder={T.namePlaceholder} value="" error={T.nameError} />
          </View>
        </GameThemeProvider>
      </Section>

      <Section title={T.sectionTimer}>
        <GameThemeProvider game="draw">
          <View style={styles.stack}>
            <TimerDisplay remaining={42} total={60} />
            <TimerDisplay remaining={7} total={60} warningLabel={S.common.secondsShort(7)} />
            <TimerDisplay remaining={215} total={360} compact />
          </View>
        </GameThemeProvider>
      </Section>

      <Section title={T.sectionTeams}>
        <View style={styles.teamRow}>
          <TeamTile label={T.teamRed} fill={cn.teams.red.fill} deep={cn.teams.red.deep} fg={colors.white} icon="team-red" />
          <TeamTile label={T.teamBlue} fill={cn.teams.blue.fill} deep={cn.teams.blue.deep} fg={colors.white} icon="team-blue" />
          <TeamTile label={T.assassin} fill={cn.assassin.fill} deep={cn.assassin.deep} fg={colors.white} icon="assassin" />
          <TeamTile label={T.neutral} fill={cn.neutral.fill} deep={cn.neutral.deep} fg={colors.ink} icon="neutral" />
        </View>
      </Section>

      <Section title={T.sectionIcons}>
        <Card>
          <View style={styles.iconGrid}>
            {['back', 'forward', 'exit', 'share', 'copy', 'rules', 'crown', 'trophy', 'timer', 'players', 'drink', 'golden', 'clue', 'location', 'vote', 'pencil', 'eraser', 'undo', 'skip', 'eye', 'alias', 'codenames', 'spy', 'frequency', 'draw'].map((n) => (
              <View key={n} style={styles.iconCell}>
                <Icon name={n} size={28} color={colors.ink} />
                <AppText variant="caption" color={colors.inkSoft} align="center" maxScale={1.2} style={styles.iconLabel}>
                  {n}
                </AppText>
              </View>
            ))}
          </View>
        </Card>
      </Section>

      <GameThemeProvider game="frequency">
        <Dialog
          visible={dialogOpen}
          icon="trophy"
          title={T.dialogTitle}
          onRequestClose={() => setDialogOpen(false)}
          dismissOnScrim
          actions={<Button title={S.common.continue} onPress={() => setDialogOpen(false)} fullWidth />}
        >
          <AppText align="center">{T.dialogBody}</AppText>
          <View style={styles.dialogScores}>
            <ScoreToken value={4} label={T.scoreLabel} />
            <ScoreToken value={2.5} label={T.scoreLabel} />
          </View>
        </Dialog>
      </GameThemeProvider>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  section: {
    gap: spacing.md,
  },
  stack: {
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swatch: {
    width: 104,
    minHeight: 72,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
  hex: {
    fontSize: 14,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gameCard: {
    gap: spacing.md,
  },
  gameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  gameEmblem: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    borderWidth: 2,
    borderBottomWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconRow: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  teamRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  teamTile: {
    width: 120,
    minHeight: 76,
    borderRadius: radii.md,
    borderWidth: 2,
    borderBottomWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  iconCell: {
    width: 64,
    alignItems: 'center',
    gap: 2,
  },
  iconLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  dialogScores: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xxl,
  },
});
