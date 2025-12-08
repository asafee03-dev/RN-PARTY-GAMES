import React, { useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable } from 'react-native';
import GradientBackground from '../../components/codenames/GradientBackground';
import DrawCanvas from '../../components/draw/DrawCanvas';
import Timer from '../../components/shared/Timer';
import GradientButton from '../../components/codenames/GradientButton';

export default function DrawGameScreen({ navigation }) {
  const canvasRef = useRef(null);
  
  // Mock game state - will be replaced with real state management
  const [gameState] = useState({
    players: [
      { name: 'יוסי', score: 0, hasSubmitted: false },
      { name: 'שרה', score: 0, hasSubmitted: false },
    ],
    currentTurnIndex: 0,
    currentWord: 'כלב',
    gameStatus: 'playing',
    turnStartTime: Date.now(),
  });

  const [drawingStrokes, setDrawingStrokes] = useState([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isDrawing, setIsDrawing] = useState(true);

  const currentDrawer = gameState.players[gameState.currentTurnIndex];
  const isMyTurn = true; // TODO: Replace with actual check

  const handleDrawingChange = (strokes) => {
    setDrawingStrokes(strokes);
    // TODO: Sync drawing with backend/Firebase for multiplayer
  };

  const handleTimerFinish = () => {
    setIsDrawing(false);
    // TODO: Handle timer expiration logic
    if (canvasRef.current) {
      canvasRef.current.exportDrawing();
    }
  };

  const handleTimerTick = (remainingTime) => {
    setTimeLeft(remainingTime);
  };

  const handleClearCanvas = () => {
    if (canvasRef.current) {
      canvasRef.current.clearCanvas();
    }
  };

  const handleSubmitDrawing = () => {
    if (canvasRef.current) {
      canvasRef.current.exportDrawing();
    }
    // TODO: Submit drawing and advance game
  };

  return (
    <GradientBackground variant="purple">
      <ScrollView 
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Draw Something</Text>
          {isDrawing && (
            <Timer
              initialTime={60}
              onFinish={handleTimerFinish}
              onTick={handleTimerTick}
              paused={!isDrawing}
            />
          )}
        </View>

        {/* Word to Draw */}
        {isMyTurn && isDrawing && (
          <View style={styles.wordContainer}>
            <Text style={styles.wordLabel}>צייר:</Text>
            <Text style={styles.wordText}>{gameState.currentWord}</Text>
          </View>
        )}

        {/* Drawing Canvas */}
        <View style={styles.canvasContainer}>
          <DrawCanvas
            ref={canvasRef}
            onDrawingChange={handleDrawingChange}
            initialStrokes={drawingStrokes}
            disabled={!isDrawing || !isMyTurn}
            onExportReady={(exportData) => {
              // TODO: Save exported image data
              console.log('Drawing exported:', exportData);
            }}
          />
        </View>

        {/* Canvas Controls */}
        {isMyTurn && isDrawing && (
          <View style={styles.controlsContainer}>
            <GradientButton
              title="נקה"
              onPress={handleClearCanvas}
              variant="red"
              style={styles.controlButton}
            />
            <GradientButton
              title="סיים ציור"
              onPress={handleSubmitDrawing}
              variant="green"
              style={styles.controlButton}
            />
          </View>
        )}

        {/* Guessing Interface */}
        {!isMyTurn && (
          <View style={styles.guessingContainer}>
            <Text style={styles.guessingTitle}>נחש מה המילה!</Text>
            <View style={styles.guessInputWrapper}>
              <TextInput
                style={styles.guessInput}
                placeholder="הכנס ניחוש..."
                placeholderTextColor="#999"
                autoCapitalize="none"
              />
              <GradientButton
                title="שלח"
                onPress={() => {
                  // TODO: Submit guess
                }}
                variant="green"
                style={styles.submitButton}
              />
            </View>
          </View>
        )}

        {/* Waiting for other players */}
        {!isMyTurn && (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingText}>
              ממתין ל{currentDrawer?.name} לצייר...
            </Text>
          </View>
        )}

        {/* Timer expired message */}
        {!isDrawing && isMyTurn && (
          <View style={styles.messageContainer}>
            <Text style={styles.messageText}>
              הזמן נגמר! הציור נשמר אוטומטית.
            </Text>
          </View>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  wordContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  wordLabel: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  wordText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  canvasContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 20,
  },
  controlButton: {
    minWidth: 120,
  },
  waitingContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    alignItems: 'center',
  },
  waitingText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  messageContainer: {
    backgroundColor: '#FF9800',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    alignItems: 'center',
  },
  messageText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  guessingContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
  },
  guessingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  guessInputWrapper: {
    gap: 12,
  },
  guessInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    textAlign: 'right',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButton: {
    width: '100%',
  },
});
