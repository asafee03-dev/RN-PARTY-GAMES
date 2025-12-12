import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientButton from '../codenames/GradientButton';
import { copyRoomCode, copyRoomLink } from '../../utils/clipboard';

export default function UnifiedTopBar({ 
  roomCode, 
  variant = 'draw', 
  onExit, 
  onRulesPress,
  showRules = true 
}) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  const handleCopyRoomCode = async () => {
    await copyRoomCode(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyRoomLink = async () => {
    await copyRoomLink(roomCode, variant);
  };

  // Theme colors per variant (matching GradientButton colors)
  const themeColors = {
    draw: '#C48CFF', // סגול בהיר
    frequency: '#0A1A3A', // כחול כהה
    codenames: '#D9C3A5', // חום בהיר
    alias: '#4FA8FF', // כחול בהיר
    spy: '#7ED957', // ירוק בהיר
  };

  const themeColor = themeColors[variant] || themeColors.draw;

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 8) }]}>
      {/* Right to Left: Share Link, Room Code, Rules, Exit */}
      <View style={styles.content}>
        {/* Share Room Link Button */}
        <Pressable onPress={handleCopyRoomLink} style={styles.shareButton}>
          <Text style={styles.shareIcon}>🔗</Text>
        </Pressable>

        {/* Room Code + Copy */}
        <Pressable onPress={handleCopyRoomCode} style={[styles.roomCodeContainer, { borderColor: themeColor }]}>
          <Text style={styles.roomCodeLabel}>קוד:</Text>
          <Text style={[styles.roomCodeText, { color: themeColor }]}>{roomCode}</Text>
          <Text style={styles.copyIcon}>{copied ? '✓' : '📋'}</Text>
        </Pressable>

        {/* Rules Button */}
        {showRules && (
          <Pressable onPress={onRulesPress} style={[styles.rulesButton, { backgroundColor: themeColor }]}>
            <Text style={styles.rulesText}>חוקים</Text>
          </Pressable>
        )}

        {/* Exit Button */}
        <GradientButton
          title="יציאה"
          onPress={onExit}
          variant={variant}
          style={styles.exitButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    width: '100%',
  },
  shareButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareIcon: {
    fontSize: 14,
  },
  roomCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    borderWidth: 1,
  },
  roomCodeLabel: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
  },
  roomCodeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  copyIcon: {
    fontSize: 12,
  },
  rulesButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rulesText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  exitButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 60,
  },
});

