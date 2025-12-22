import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

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

/**
 * Generate parallel line segments creating a track/path effect
 * Two parallel lines are drawn on each side, creating a path where circles appear between them
 * Also generates background paths between the lines
 */
const generateSpiralPathLines = (spiralSquares) => {
  const lines = [];
  const backgrounds = [];
  const CIRCLE_RADIUS = 15; // Half of 30px circle size
  const GAP = 4;
  const CELL_SIZE = 30 + GAP; // 34px total per cell
  const TRACK_WIDTH = 25; // Distance between the two parallel lines
  
  // First pass: calculate all segments with their directions
  const segments = [];
  for (let i = 0; i < spiralSquares.length - 1; i++) {
    const current = spiralSquares[i];
    const next = spiralSquares[i + 1];
    
    const x1 = current.col * CELL_SIZE + CIRCLE_RADIUS;
    const y1 = current.row * CELL_SIZE + CIRCLE_RADIUS;
    const x2 = next.col * CELL_SIZE + CIRCLE_RADIUS;
    const y2 = next.row * CELL_SIZE + CIRCLE_RADIUS;
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) continue;
    
    segments.push({
      x1, y1, x2, y2,
      nx: dx / length,
      ny: dy / length,
    });
  }
  
  // Helper function to calculate line intersection
  const lineIntersection = (x1, y1, x2, y2, x3, y3, x4, y4) => {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.001) return null; // Lines are parallel
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1)
    };
  };
  
  // Second pass: generate lines with corner handling
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prevSeg = i > 0 ? segments[i - 1] : null;
    const nextSeg = i < segments.length - 1 ? segments[i + 1] : null;
    
    // Calculate perpendicular vector
    const perpX = -seg.ny;
    const perpY = seg.nx;
    const offset = TRACK_WIDTH / 2;
    
    // Check if there's a corner before this segment (direction changed)
    const isCornerBefore = prevSeg && (
      Math.abs(prevSeg.nx - seg.nx) > 0.01 || 
      Math.abs(prevSeg.ny - seg.ny) > 0.01
    );
    
    // Check if there's a corner after this segment (direction will change)
    const isCornerAfter = nextSeg && (
      Math.abs(nextSeg.nx - seg.nx) > 0.01 || 
      Math.abs(nextSeg.ny - seg.ny) > 0.01
    );
    
    // Calculate start points
    let leftStartX, leftStartY, rightStartX, rightStartY;
    if (isCornerBefore) {
      // At corner: calculate intersection point of the two parallel lines
      const prevPerpX = -prevSeg.ny;
      const prevPerpY = prevSeg.nx;
      
      // Previous segment's parallel lines
      const prevLeftX1 = prevSeg.x1 + prevPerpX * offset;
      const prevLeftY1 = prevSeg.y1 + prevPerpY * offset;
      const prevLeftX2 = prevSeg.x2 + prevPerpX * offset;
      const prevLeftY2 = prevSeg.y2 + prevPerpY * offset;
      
      // Current segment's parallel lines
      const currLeftX1 = seg.x1 + perpX * offset;
      const currLeftY1 = seg.y1 + perpY * offset;
      const currLeftX2 = seg.x2 + perpX * offset;
      const currLeftY2 = seg.y2 + perpY * offset;
      
      // Calculate intersection
      const leftIntersection = lineIntersection(
        prevLeftX1, prevLeftY1, prevLeftX2, prevLeftY2,
        currLeftX1, currLeftY1, currLeftX2, currLeftY2
      );
      
      const prevRightX1 = prevSeg.x1 - prevPerpX * offset;
      const prevRightY1 = prevSeg.y1 - prevPerpY * offset;
      const prevRightX2 = prevSeg.x2 - prevPerpX * offset;
      const prevRightY2 = prevSeg.y2 - prevPerpY * offset;
      
      const currRightX1 = seg.x1 - perpX * offset;
      const currRightY1 = seg.y1 - perpY * offset;
      const currRightX2 = seg.x2 - perpX * offset;
      const currRightY2 = seg.y2 - perpY * offset;
      
      const rightIntersection = lineIntersection(
        prevRightX1, prevRightY1, prevRightX2, prevRightY2,
        currRightX1, currRightY1, currRightX2, currRightY2
      );
      
      if (leftIntersection && rightIntersection) {
        leftStartX = leftIntersection.x;
        leftStartY = leftIntersection.y;
        rightStartX = rightIntersection.x;
        rightStartY = rightIntersection.y;
      } else {
        // Fallback to circle center if intersection calculation fails
        leftStartX = seg.x1 + perpX * offset;
        leftStartY = seg.y1 + perpY * offset;
        rightStartX = seg.x1 - perpX * offset;
        rightStartY = seg.y1 - perpY * offset;
      }
    } else {
      // No corner: continue from previous segment
      leftStartX = seg.x1 + perpX * offset;
      leftStartY = seg.y1 + perpY * offset;
      rightStartX = seg.x1 - perpX * offset;
      rightStartY = seg.y1 - perpY * offset;
    }
    
    // Calculate end points
    let leftEndX, leftEndY, rightEndX, rightEndY;
    if (isCornerAfter) {
      // At corner: calculate intersection point of the two parallel lines
      const nextPerpX = -nextSeg.ny;
      const nextPerpY = nextSeg.nx;
      
      // Current segment's parallel lines
      const currLeftX1 = seg.x1 + perpX * offset;
      const currLeftY1 = seg.y1 + perpY * offset;
      const currLeftX2 = seg.x2 + perpX * offset;
      const currLeftY2 = seg.y2 + perpY * offset;
      
      // Next segment's parallel lines
      const nextLeftX1 = nextSeg.x1 + nextPerpX * offset;
      const nextLeftY1 = nextSeg.y1 + nextPerpY * offset;
      const nextLeftX2 = nextSeg.x2 + nextPerpX * offset;
      const nextLeftY2 = nextSeg.y2 + nextPerpY * offset;
      
      // Calculate intersection
      const leftIntersection = lineIntersection(
        currLeftX1, currLeftY1, currLeftX2, currLeftY2,
        nextLeftX1, nextLeftY1, nextLeftX2, nextLeftY2
      );
      
      const currRightX1 = seg.x1 - perpX * offset;
      const currRightY1 = seg.y1 - perpY * offset;
      const currRightX2 = seg.x2 - perpX * offset;
      const currRightY2 = seg.y2 - perpY * offset;
      
      const nextRightX1 = nextSeg.x1 - nextPerpX * offset;
      const nextRightY1 = nextSeg.y1 - nextPerpY * offset;
      const nextRightX2 = nextSeg.x2 - nextPerpX * offset;
      const nextRightY2 = nextSeg.y2 - nextPerpY * offset;
      
      const rightIntersection = lineIntersection(
        currRightX1, currRightY1, currRightX2, currRightY2,
        nextRightX1, nextRightY1, nextRightX2, nextRightY2
      );
      
      if (leftIntersection && rightIntersection) {
        leftEndX = leftIntersection.x;
        leftEndY = leftIntersection.y;
        rightEndX = rightIntersection.x;
        rightEndY = rightIntersection.y;
      } else {
        // Fallback to circle center if intersection calculation fails
        leftEndX = seg.x2 + perpX * offset;
        leftEndY = seg.y2 + perpY * offset;
        rightEndX = seg.x2 - perpX * offset;
        rightEndY = seg.y2 - perpY * offset;
      }
    } else {
      // No corner: continue to next segment
      leftEndX = seg.x2 + perpX * offset;
      leftEndY = seg.y2 + perpY * offset;
      rightEndX = seg.x2 - perpX * offset;
      rightEndY = seg.y2 - perpY * offset;
    }
    
    // Create two parallel lines
    lines.push({
      id: `line-left-${i}`,
      x1: leftStartX,
      y1: leftStartY,
      x2: leftEndX,
      y2: leftEndY,
    });
    
    lines.push({
      id: `line-right-${i}`,
      x1: rightStartX,
      y1: rightStartY,
      x2: rightEndX,
      y2: rightEndY,
    });
    
    // Create background path
    const pathData = `M ${leftStartX},${leftStartY} L ${leftEndX},${leftEndY} L ${rightEndX},${rightEndY} L ${rightStartX},${rightStartY} Z`;
    backgrounds.push({
      id: `bg-${i}`,
      d: pathData,
    });
  }
  
  return { lines, backgrounds };
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
          {/* Game squares (circles) */}
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
          
          {/* Spiral path connecting lines - rendered on top of circles */}
          <Svg
            style={styles.pathSvg}
            width={336}
            height={200}
          >
            {(() => {
              const { lines, backgrounds } = generateSpiralPathLines(spiralSquares);
              return (
                <>
                  {/* Background paths between the lines */}
                  {backgrounds.map((bg) => (
                    <Path
                      key={bg.id}
                      d={bg.d}
                      fill="#1E40AF"
                      opacity={0.3}
                    />
                  ))}
                  {/* Two parallel lines */}
                  {lines.map((line) => (
                    <Line
                      key={line.id}
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      stroke="#1E40AF"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  ))}
                </>
              );
            })()}
          </Svg>
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
  pathSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1, // Lines pass through circles, but circles render on top
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
    zIndex: 2, // Above the path lines
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
    bottom: -5,
    flexDirection: 'row',
    gap: 3,
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
    fontSize: 11,
    fontWeight: '600',
    color: '#1F2937',
  },
  legendPosition: {
    fontSize: 10,
    color: '#3B82F6',
    fontWeight: '600',
  },
});

