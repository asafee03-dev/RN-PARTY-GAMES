import React, { useEffect, useRef } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { arrayRemove, arrayUnion, doc, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase';
import { S } from '../../strings';
import { colors, radii, spacing, useGameTheme } from '../../theme';
import { AppText, Badge, Button, Card, Icon, Screen } from '../../ui';
import UnifiedTopBar from '../shared/UnifiedTopBar';
import BannerAd from '../shared/BannerAd';

/**
 * Two-phones lobby for Codenames. Exactly two phones take part: one shows the
 * key card to the clue-givers of BOTH teams, the other shows the board to the
 * guessers of BOTH teams.
 *
 * The role is stored in the existing team fields so the game screen and the
 * start logic keep working: the clue-givers phone is the spymaster of both
 * teams, the guessers phone is the only guesser of both teams.
 * Claiming a role is a transaction that writes only the fields that change.
 */

export const phoneRoleOf = (room, name) => {
  if (!room || !name) return null;
  if (room.red_team?.spymaster === name) return 'clue';
  if (room.red_team?.guessers?.includes(name)) return 'guess';
  return null;
};

const spymasterOf = (room) => room.red_team?.spymaster || '';
const guesserOf = (room) => (room.red_team?.guessers || [])[0] || '';

async function claimPhoneRole(roomId, name, role) {
  const roomRef = doc(db, 'CodenamesRoom', roomId);
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);
    if (!snap.exists()) return 'missing';
    const fresh = snap.data();
    if (fresh.play_mode !== 'two_phones' || fresh.game_status !== 'setup') return 'closed';

    const spy = fresh.red_team?.spymaster || '';
    const guess = (fresh.red_team?.guessers || [])[0] || '';
    if (role === 'clue') {
      if (spy && spy !== name) return 'taken';
      if (spy === name) return 'ok';
      const updates = { 'red_team.spymaster': name, 'blue_team.spymaster': name };
      // Switching roles: let go of the guessers seat
      if (guess === name) {
        updates['red_team.guessers'] = arrayRemove(name);
        updates['blue_team.guessers'] = arrayRemove(name);
      }
      transaction.update(roomRef, updates);
      return 'ok';
    }
    if (guess && guess !== name) return 'taken';
    if (guess === name) return 'ok';
    const updates = { 'red_team.guessers': arrayUnion(name), 'blue_team.guessers': arrayUnion(name) };
    if (spy === name) {
      updates['red_team.spymaster'] = '';
      updates['blue_team.spymaster'] = '';
    }
    transaction.update(roomRef, updates);
    return 'ok';
  });
}

export default function TwoPhonesLobby({ room, roomCode, playerName, isHost, onStart, onExit }) {
  const theme = useGameTheme();
  const claimingRef = useRef(false);

  const spy = spymasterOf(room);
  const guess = guesserOf(room);
  const myRole = phoneRoleOf(room, playerName);
  const bothReady = !!spy && !!guess;
  const isFull = !myRole && bothReady;

  const claim = async (role) => {
    if (claimingRef.current) return;
    claimingRef.current = true;
    try {
      const result = await claimPhoneRole(room.id, playerName, role);
      if (result === 'taken') Alert.alert(S.codenames.setup.error, S.codenames.phones.full);
    } catch (error) {
      console.error('❌ [CODENAMES] Error claiming phone role:', error);
      Alert.alert(S.codenames.setup.error, S.codenames.phones.claimFailed);
    } finally {
      claimingRef.current = false;
    }
  };

  // The second phone takes whichever role is left (once the host has chosen)
  useEffect(() => {
    if (isHost || myRole || !playerName) return;
    if (spy && !guess) claim('guess');
    else if (guess && !spy) claim('clue');
  }, [isHost, myRole, spy, guess, playerName]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderRole = (role) => {
    const isClue = role === 'clue';
    const holder = isClue ? spy : guess;
    const mine = myRole === role;
    const taken = !!holder && !mine;
    return (
      <Card key={role} tone={mine ? 'tint' : 'paper'} style={styles.roleCard}>
        <View style={styles.row}>
          <Icon name={isClue ? 'spy' : 'players'} size={26} color={theme.accentInk} />
          <AppText variant="title" color={theme.accentInk} style={styles.flex}>
            {isClue ? S.codenames.phones.clueGivers : S.codenames.phones.guessers}
          </AppText>
          {mine ? <Badge label={S.codenames.phones.thisPhone} icon="phone" tone="success" /> : null}
          {taken ? <Badge label={S.codenames.phones.otherPhone} icon="phones" tone="neutral" /> : null}
        </View>
        <AppText color={colors.inkSoft}>{isClue ? S.codenames.phones.clueGiversHint : S.codenames.phones.guessersHint}</AppText>
        {isHost && !mine && !taken ? (
          <Button title={isClue ? S.codenames.phones.clueGivers : S.codenames.phones.guessers} icon="phone" onPress={() => claim(role)} fullWidth />
        ) : null}
      </Card>
    );
  };

  return (
    <Screen
      header={<UnifiedTopBar roomCode={roomCode} variant="codenames" onExit={onExit} showRules={false} />}
      footer={<BannerAd />}
    >
      <View style={styles.titleBlock}>
        <Icon name="phones" size={40} color={theme.accentInk} />
        <AppText variant="display" align="center" accessibilityRole="header">
          {S.codenames.phones.title}
        </AppText>
        <AppText variant="subtitle" align="center" color={colors.inkSoft}>
          {S.codenames.phones.subtitle}
        </AppText>
      </View>

      {isFull ? (
        <Card tone="tint" style={styles.roleCard}>
          <View style={styles.row}>
            <Icon name="alert" size={24} color={colors.dangerDeep} />
            <AppText variant="bodyStrong" color={colors.dangerDeep} style={styles.flex}>
              {S.codenames.phones.full}
            </AppText>
          </View>
          <Button title={S.codenames.phones.backHome} icon="home" variant="secondary" onPress={onExit} fullWidth />
        </Card>
      ) : (
        <>
          {isHost && !myRole ? (
            <AppText align="center" color={colors.inkSoft}>
              {S.codenames.phones.hostPick}
            </AppText>
          ) : null}
          {!isHost && !myRole ? (
            <AppText align="center" color={colors.inkSoft}>
              {S.codenames.phones.waitingHostPick}
            </AppText>
          ) : null}
          {renderRole('clue')}
          {renderRole('guess')}

          {myRole && !bothReady ? (
            <View style={styles.row}>
              <Icon name="hourglass" size={22} color={colors.inkSoft} />
              <AppText color={colors.inkSoft} style={styles.flex}>
                {S.codenames.phones.waitingOther}
              </AppText>
            </View>
          ) : null}

          {bothReady && isHost ? (
            <>
              <Badge label={S.codenames.phones.bothReady} icon="checkCircle" tone="success" />
              <Button title={S.codenames.setup.startGame} icon="play" onPress={onStart} fullWidth />
            </>
          ) : null}
          {bothReady && !isHost ? (
            <View style={styles.row}>
              <Icon name="hourglass" size={22} color={colors.inkSoft} />
              <AppText color={colors.inkSoft} style={styles.flex}>
                {S.codenames.phones.waitingHostStart}
              </AppText>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleBlock: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.md },
  roleCard: { gap: spacing.md, borderRadius: radii.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
