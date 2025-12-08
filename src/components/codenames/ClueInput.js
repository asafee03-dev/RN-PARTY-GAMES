import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function ClueInput({ 
  currentClue, 
  isMyTurn, 
  isSpymaster, 
  room, 
  onClueSubmit, 
  compact = false, 
  maxClueNumber = 9 
}) {
  const [clueNumber, setClueNumber] = useState(1);

  // Reset clue number when max changes
  useEffect(() => {
    if (maxClueNumber > 0) {
      setClueNumber(prev => Math.min(prev, maxClueNumber));
    }
  }, [maxClueNumber]);

  const handleIncrement = () => {
    if (clueNumber < maxClueNumber) {
      setClueNumber(clueNumber + 1);
    }
  };

  const handleDecrement = () => {
    if (clueNumber > 1) {
      setClueNumber(clueNumber - 1);
    }
  };

  const handleSubmit = () => {
    if (clueNumber < 1 || clueNumber > maxClueNumber) {
      return;
    }
    onClueSubmit(clueNumber);
  };

  if (currentClue?.number) {
    return (
      <View style={[styles.container, compact && styles.compactContainer]}>
        <LinearGradient
          colors={['#A78BFA', '#EC4899']}
          style={styles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <View style={styles.content}>
            <Text style={[styles.label, compact && styles.compactLabel]}>הרמז הנוכחי:</Text>
            <View style={styles.clueDisplay}>
              <View style={[styles.badge, compact && styles.compactBadge]}>
                <Text style={[styles.badgeText, compact && styles.compactBadgeText]}>
                  {currentClue.number}
                </Text>
              </View>
              <Text style={[styles.guessesText, compact && styles.compactGuessesText]}>
                {room.guesses_remaining} ניחושים נותרו
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  }

  if (isMyTurn && isSpymaster) {
    const maxValue = Math.max(1, maxClueNumber);
    const minValue = 1;
    
    return (
      <View style={[styles.container, compact && styles.compactContainer]}>
        <LinearGradient
          colors={['#A78BFA', '#EC4899']}
          style={styles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <View style={styles.content}>
            <Text style={[styles.label, compact && styles.compactLabel, styles.centerLabel]}>
              תן רמז לקבוצה שלך
            </Text>
            <View style={styles.inputContainer}>
              <View style={styles.numberControls}>
                <TouchableOpacity
                  style={[styles.controlButton, clueNumber >= maxValue && styles.controlButtonDisabled]}
                  onPress={handleIncrement}
                  disabled={clueNumber >= maxValue}
                >
                  <Text style={styles.controlButtonText}>▲</Text>
                </TouchableOpacity>
                <View style={styles.numberDisplay}>
                  <Text style={[styles.numberText, compact && styles.compactNumberText]}>
                    {clueNumber}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.controlButton, clueNumber <= minValue && styles.controlButtonDisabled]}
                  onPress={handleDecrement}
                  disabled={clueNumber <= minValue}
                >
                  <Text style={styles.controlButtonText}>▼</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.submitButton, compact && styles.compactSubmitButton]}
                onPress={handleSubmit}
              >
                <Text style={[styles.submitButtonText, compact && styles.compactSubmitButtonText]}>
                  שלח רמז
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.hint, compact && styles.compactHint]}>
              בחר כמה מילים קשורות לרמז שלך (1-{maxValue})
            </Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={[styles.container, compact && styles.compactContainer]}>
      <View style={styles.grayContainer}>
        <Text style={[styles.waitingText, compact && styles.compactWaitingText]}>
          {isMyTurn 
            ? 'ממתין למרגל לתת רמז...' 
            : 'התור של הקבוצה השנייה'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  compactContainer: {
    marginBottom: 8,
  },
  gradient: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  grayContainer: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 16,
  },
  content: {
    gap: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B21A8',
    textAlign: 'center',
  },
  compactLabel: {
    fontSize: 14,
  },
  centerLabel: {
    textAlign: 'center',
  },
  clueDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  badge: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  compactBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  compactBadgeText: {
    fontSize: 18,
  },
  guessesText: {
    fontSize: 16,
    color: '#6B21A8',
    fontWeight: '600',
  },
  compactGuessesText: {
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  numberControls: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  controlButton: {
    width: 40,
    height: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  controlButtonDisabled: {
    opacity: 0.5,
  },
  controlButtonText: {
    fontSize: 12,
    color: '#374151',
  },
  numberDisplay: {
    minWidth: 48,
    paddingVertical: 8,
    alignItems: 'center',
  },
  numberText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#374151',
  },
  compactNumberText: {
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  compactSubmitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  compactSubmitButtonText: {
    fontSize: 14,
  },
  hint: {
    fontSize: 14,
    color: '#6B21A8',
    textAlign: 'center',
  },
  compactHint: {
    fontSize: 12,
  },
  waitingText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  compactWaitingText: {
    fontSize: 14,
  },
});

