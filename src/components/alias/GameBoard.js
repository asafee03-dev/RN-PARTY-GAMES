import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { S } from '../../strings';
import { colors, radii, spacing, useGameTheme } from '../../theme';
import { AppText, Card, Icon, accessibleSurface, physicalLeft, readableOn } from '../../ui';

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

const SQUARE = 30;
const GAP = 4;
const GRID_W = 10 * SQUARE + 9 * GAP; // 336
const GRID_H = 6 * SQUARE + 5 * GAP; // 200
const FRAME_PAD = 8;
const FRAME_BORDER = 2;
const FRAME_W = GRID_W + 2 * (FRAME_PAD + FRAME_BORDER); // 356
const FRAME_H = GRID_H + 2 * (FRAME_PAD + FRAME_BORDER); // 220

export default function GameBoard({ teams, goldenSquares = [] }) {
  const theme = useGameTheme();
  const { width: windowWidth } = useWindowDimensions();
  const spiralSquares = createRectangularSpiral();
  const { lines, backgrounds } = generateSpiralPathLines(spiralSquares);

  // Shrink on narrow phones (content width = window - 2 * 16 screen padding)
  const scale = Math.min(1, (windowWidth - 32 - 2 * (spacing.md + 1.5)) / FRAME_W);

  const getTeamsOnSquare = (position) => {
    if (!teams || !Array.isArray(teams)) return [];
    // Ensure all teams have position property (default to 0 if missing)
    return teams
      .map((team, index) => ({ team, index }))
      .filter(({ team }) => {
        if (!team) return false;
        const teamPosition = team.position !== undefined ? team.position : 0;
        return teamPosition === position;
      });
  };

  return (
    <Card padding="md" style={styles.card}>
      <View style={styles.header}>
        <Icon name="pawn" size={22} color={theme.accentInk} />
        <AppText variant="subtitle" color={theme.accentInk} accessibilityRole="header">
          {S.alias.board.title}
        </AppText>
      </View>

      <View style={[styles.scaleBox, { width: FRAME_W * scale, height: FRAME_H * scale }]}>
        <View
          style={[
            styles.frame,
            physicalLeft(0),
            scale < 1 && {
              transform: [
                { translateX: -(FRAME_W - FRAME_W * scale) / 2 },
                { translateY: -(FRAME_H - FRAME_H * scale) / 2 },
                { scale },
              ],
            },
          ]}
        >
          <View style={styles.grid}>
            {/* Track (under the squares) */}
            <Svg style={[styles.pathSvg, physicalLeft(0)]} width={GRID_W} height={GRID_H}>
              {backgrounds.map((bg) => (
                <Path key={bg.id} d={bg.d} fill={theme.accent} opacity={0.14} />
              ))}
              {lines.map((line) => (
                <Line
                  key={line.id}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke={theme.accent}
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity={0.55}
                />
              ))}
            </Svg>

            {/* Squares */}
            {spiralSquares.map((square) => {
              const teamsHere = getTeamsOnSquare(square.position);
              const isStart = square.position === 0;
              const isFinish = square.position === TOTAL_SQUARES - 1;
              const isGoldenSquare = goldenSquares.includes(square.position);
              const label = isStart
                ? S.alias.board.start
                : isFinish
                  ? S.alias.board.finish
                  : isGoldenSquare
                    ? `${S.alias.board.square(square.position + 1)}, ${S.alias.board.goldenSquare}`
                    : S.alias.board.square(square.position + 1);

              return (
                <View
                  key={square.position}
                  accessible
                  accessibilityLabel={label}
                  style={[
                    styles.square,
                    physicalLeft(square.col * (SQUARE + GAP)),
                    { top: square.row * (SQUARE + GAP) },
                    isStart && styles.startSquare,
                    isFinish && styles.finishSquare,
                    isGoldenSquare && styles.goldenSquare,
                    teamsHere.length > 0 && styles.squareWithTeam,
                  ]}
                >
                  {isStart ? (
                    <Icon name="play" size={16} color={colors.white} />
                  ) : isFinish ? (
                    <Icon name="trophy" size={16} color={colors.ink} />
                  ) : isGoldenSquare ? (
                    <Icon name="golden" size={16} color={colors.goldDeep} />
                  ) : (
                    <AppText variant="caption" maxScale={1} style={styles.squareNumber}>
                      {square.position + 1}
                    </AppText>
                  )}

                  {/* Team pawns: color + the team's number */}
                  {teamsHere.length > 0 && (
                    <View style={styles.pawns}>
                      {teamsHere.map(({ team, index }) => {
                        const teamColor = accessibleSurface(team.color || '#CCCCCC');
                        return (
                          <View key={index} style={[styles.pawn, { backgroundColor: teamColor }]}>
                            <AppText variant="caption" maxScale={1} color={readableOn(teamColor)} style={styles.pawnText}>
                              {index + 1}
                            </AppText>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* Legend: pawn + name + position */}
      <View style={styles.legend}>
        {teams && Array.isArray(teams) && teams.map((team, idx) => {
          if (!team) return null;
          const teamPosition = team.position !== undefined ? team.position : 0;
          const teamColor = accessibleSurface(team.color || '#CCCCCC');
          const teamName = team.name || S.alias.board.teamFallback(idx + 1);

          return (
            <View key={idx} style={styles.legendItem} accessible accessibilityLabel={`${idx + 1}. ${teamName}, ${S.alias.board.position(teamPosition + 1)}`}>
              <View style={[styles.legendPawn, { backgroundColor: teamColor }]}>
                <AppText variant="caption" maxScale={1.2} color={readableOn(teamColor)} style={styles.pawnText}>
                  {idx + 1}
                </AppText>
              </View>
              <AppText variant="label" maxScale={1.3}>
                {teamName}
              </AppText>
              <AppText variant="caption" color={colors.inkSoft} maxScale={1.3}>
                {S.alias.board.position(teamPosition + 1)}
              </AppText>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
  },
  scaleBox: {
    alignSelf: 'center',
  },
  frame: {
    position: 'absolute',
    top: 0,
    width: FRAME_W,
    height: FRAME_H,
    padding: FRAME_PAD,
    borderRadius: radii.md,
    borderWidth: FRAME_BORDER,
    borderColor: colors.cardboardDeep,
    backgroundColor: colors.cardboard,
  },
  grid: {
    width: GRID_W,
    height: GRID_H,
    position: 'relative',
  },
  pathSvg: {
    position: 'absolute',
    top: 0,
    zIndex: 1, // Lines pass through circles, but circles render on top
  },
  square: {
    position: 'absolute',
    width: SQUARE,
    height: SQUARE,
    borderRadius: SQUARE / 2,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2, // Above the track lines
  },
  startSquare: {
    backgroundColor: colors.success,
    borderColor: colors.successDeep,
  },
  finishSquare: {
    backgroundColor: colors.gold,
    borderColor: colors.goldDeep,
  },
  goldenSquare: {
    backgroundColor: colors.goldTint,
    borderColor: colors.gold,
  },
  squareWithTeam: {
    borderWidth: 3,
    borderColor: colors.ink,
  },
  squareNumber: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.inkSoft,
  },
  pawns: {
    position: 'absolute',
    bottom: -9,
    flexDirection: 'row',
    gap: -5,
    zIndex: 3,
  },
  pawn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pawnText: {
    fontSize: 11,
    lineHeight: 14,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 40,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  legendPawn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
