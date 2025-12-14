import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

const TOTAL_SQUARES = 60;

/**
 * Create rectangular spiral layout (10x6 grid)
 * Starting from outside, going inward
 */
const createRectangularSpiral = () => {
  const squares = [];
  let currentIndex = 0;
  
  const width = 10;
  const height = 6;
  const grid = Array(height).fill(null).map(() => Array(width).fill(-1));
  
  let top = 0, bottom = height - 1;
  let left = 0, right = width - 1;
  
  while (currentIndex < TOTAL_SQUARES && top <= bottom && left <= right) {
    // Top row - right to left
    for (let col = right; col >= left && currentIndex < TOTAL_SQUARES; col--) {
      grid[top][col] = currentIndex;
      squares.push({ position: currentIndex, row: top, col: col });
      currentIndex++;
    }
    top++;
    
    // Left column - top to bottom
    for (let row = top; row <= bottom && currentIndex < TOTAL_SQUARES; row++) {
      grid[row][left] = currentIndex;
      squares.push({ position: currentIndex, row: row, col: left });
      currentIndex++;
    }
    left++;
    
    // Bottom row - left to right
    for (let col = left; col <= right && currentIndex < TOTAL_SQUARES; col++) {
      grid[bottom][col] = currentIndex;
      squares.push({ position: currentIndex, row: bottom, col: col });
      currentIndex++;
    }
    bottom--;
    
    // Right column - bottom to top
    for (let row = bottom; row >= top && currentIndex < TOTAL_SQUARES; row--) {
      grid[row][right] = currentIndex;
      squares.push({ position: currentIndex, row: row, col: right });
      currentIndex++;
    }
    right--;
  }
  
  return squares;
};

export default function GameBoard({ teams, goldenSquares = [] }) {
  const spiralSquares = createRectangularSpiral();

  const getTeamsOnSquare = (position) => {
    if (!teams || !Array.isArray(teams)) return [];
    // Ensure all teams have position property (default to 0 if missing)
    return teams.filter(team => {
      if (!team) return false;
      const teamPosition = team.position !== undefined ? team.position : 0;
      return teamPosition === position;
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🏆 לוח המשחק</Text>
      </View>
      
      {/* Grid 10x6 */}
      <View style={styles.gridContainer}>
        <View style={styles.grid}>
          {spiralSquares.map((square) => {
            const teamsHere = getTeamsOnSquare(square.position);
            const isStart = square.position === 0;
            const isFinish = square.position === TOTAL_SQUARES - 1;
            const isGoldenSquare = goldenSquares.includes(square.position);
            
            // Calculate absolute position based on row and col
            const left = square.col * (30 + 4); // square width + gap
            const top = square.row * (30 + 4); // square height + gap
            
            return (
              <View
                key={square.position}
                style={[
                  styles.square,
                  {
                    position: 'absolute',
                    left: left,
                    top: top,
                  },
                  isStart && styles.startSquare,
                  isFinish && styles.finishSquare,
                  isGoldenSquare && styles.goldenSquare,
                  teamsHere.length > 0 && styles.squareWithTeam
                ]}
              >
                {isStart ? (
                  <Text style={styles.squareEmoji}>🏁</Text>
                ) : isFinish ? (
                  <Text style={styles.squareEmoji}>🏆</Text>
                ) : isGoldenSquare ? (
                  <Text style={styles.goldenEmoji}>⭐</Text>
                ) : (
                  <Text style={styles.squareNumber}>{square.position + 1}</Text>
                )}
                
                {/* Team indicators */}
                {teamsHere.length > 0 && (
                  <View style={styles.teamIndicators}>
                    {teamsHere.map((team, idx) => {
                      const teamColor = team.color || '#CCCCCC';
                      // Offset multiple pawns on the same square
                      const offsetX = teamsHere.length > 1 ? (idx - (teamsHere.length - 1) / 2) * 3 : 0;
                      return (
                        <View
                          key={idx}
                          style={[
                            styles.teamDot, 
                            { 
                              backgroundColor: teamColor,
                              marginLeft: offsetX
                            }
                          ]}
                        />
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {teams && Array.isArray(teams) && teams.map((team, idx) => {
          if (!team) return null;
          // Ensure position is defined (default to 0)
          const teamPosition = team.position !== undefined ? team.position : 0;
          const teamColor = team.color || '#CCCCCC';
          const teamName = team.name || `קבוצה ${idx + 1}`;
          
          return (
            <View key={idx} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: teamColor }]} />
              <Text style={styles.legendText}>{teamName}</Text>
              <Text style={styles.legendPosition}>{teamPosition + 1}/60</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  gridContainer: {
    backgroundColor: '#E0F2FE',
    borderRadius: 12,
    padding: 12,
    borderWidth: 3,
    borderColor: '#3B82F6',
    width: 360, // Fixed width: 10 columns * 30px + 9 gaps * 4px + padding 24px
    height: 224, // Fixed height: 6 rows * 30px + 5 gaps * 4px + padding 24px
    alignSelf: 'center',
  },
  grid: {
    width: 336, // 10 columns * 30px + 9 gaps * 4px = 300 + 36
    height: 200, // 6 rows * 30px + 5 gaps * 4px = 180 + 20
    position: 'relative',
  },
  square: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  startSquare: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
  },
  finishSquare: {
    backgroundColor: '#F59E0B',
    borderColor: '#D97706',
  },
  goldenSquare: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  squareWithTeam: {
    borderWidth: 4,
    borderColor: '#8B5CF6',
  },
  squareNumber: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1E40AF',
  },
  squareEmoji: {
    fontSize: 16,
  },
  goldenEmoji: {
    fontSize: 12,
  },
  teamIndicators: {
    position: 'absolute',
    bottom: -4,
    flexDirection: 'row',
    gap: 2,
  },
  teamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  legend: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  legendText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  legendPosition: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '600',
  },
});

