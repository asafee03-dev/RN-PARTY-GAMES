import React, { useEffect, useState } from 'react';
import { Dimensions, PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { S } from '../../strings';
import { colors, radii, spacing, typography, useGameTheme } from '../../theme';
import { AppText, Icon, physicalRow } from '../../ui';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isMobile = SCREEN_WIDTH < 768;
const GAUGE_WIDTH = isMobile ? 300 : 400;
const GAUGE_HEIGHT = isMobile ? 150 : 200;
const ARC_STROKE = isMobile ? 30 : 40;
// Scoring sectors: deep green (2 points, white number) / light green (1 point, ink number)
const SECTOR_TOP = '#2E7A43';
const SECTOR_SIDE = '#9FD1AC';

// Pure mathematical center
const centerX = GAUGE_WIDTH / 2;
const centerY = GAUGE_HEIGHT;
const radius = (GAUGE_WIDTH / 2) - 20;

// Angle to point conversion (ONLY formula used everywhere)
// 0° = left, 90° = top, 180° = right
const angleToPoint = (angle) => {
  const rad = (angle + 180) * Math.PI / 180;
  return {
    x: centerX + radius * Math.cos(rad),
    y: centerY + radius * Math.sin(rad)
  };
};

export default function FrequencyGauge({
  leftLabel,
  rightLabel,
  targetPosition,
  showTarget,
  needlePosition,
  onNeedleMove,
  canMove,
  showAllNeedles,
  allNeedles,
  sectors,
  players,
  currentPlayerName
}) {
  const theme = useGameTheme();
  const [localNeedle, setLocalNeedle] = useState(needlePosition || 90);
  const isDraggingRef = React.useRef(false);
  const canMoveRef = React.useRef(canMove);
  const onNeedleMoveRef = React.useRef(onNeedleMove);

  // Update refs when props change
  useEffect(() => {
    canMoveRef.current = canMove;
    onNeedleMoveRef.current = onNeedleMove;
  }, [canMove, onNeedleMove]);

  // Initialize local needle from prop, but only if not dragging and prop is valid
  // IMPORTANT: Don't reset if canMove is false (player has submitted) - preserve submitted position
  useEffect(() => {
    if (!isDraggingRef.current && needlePosition !== undefined && needlePosition !== null) {
      // If player can't move (has submitted), preserve their submitted position
      // Only update from prop if the difference is significant AND player can still move
      if (!canMove) {
        // Player has submitted - don't reset their needle position
        // Only update if prop has a valid submitted position that's different
        if (Math.abs(localNeedle - needlePosition) > 0.1 && needlePosition !== 90) {
          // Only update if the prop value is a real submitted position (not default 90)
          setLocalNeedle(needlePosition);
        }
      } else {
        // Player can still move - allow normal updates
        const currentValue = localNeedle;
        const newValue = needlePosition;
        if (Math.abs(currentValue - newValue) > 0.1) {
          setLocalNeedle(newValue);
        }
      }
    }
  }, [needlePosition, canMove]);

  // Store current needle position globally for submission
  useEffect(() => {
    if (canMove && typeof global !== 'undefined') {
      global.currentNeedlePosition = localNeedle;
    }
  }, [localNeedle, canMove]);

  // Calculate angle from touch coordinates
  const getAngleFromTouch = React.useCallback((x, y) => {
    const dx = x - centerX;
    const dy = centerY - y; // Flip Y axis
    
    let atan2Angle = Math.atan2(dy, dx) * (180 / Math.PI);
    let angle;
    if (atan2Angle >= 0) {
      angle = 180 - atan2Angle;
    } else {
      angle = 180 + atan2Angle;
    }
    angle = Math.max(0, Math.min(180, angle));
    return angle;
  }, []);

  // Create PanResponder that always uses current canMove value from ref
  // Prevents scroll when touching/dragging gauge on mobile
  const panResponder = React.useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => canMoveRef.current,
      onMoveShouldSetPanResponder: () => canMoveRef.current,
      onPanResponderGrant: (evt) => {
        if (!canMoveRef.current) return;
        isDraggingRef.current = true;
        // Prevent parent scroll
        evt.stopPropagation();
        const { locationX, locationY } = evt.nativeEvent;
        const angle = getAngleFromTouch(locationX, locationY);
        setLocalNeedle(angle);
        // Update global position immediately
        if (typeof global !== 'undefined') {
          global.currentNeedlePosition = angle;
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        if (!canMoveRef.current) return;
        // Prevent parent scroll
        evt.stopPropagation();
        const { locationX, locationY } = evt.nativeEvent;
        const angle = getAngleFromTouch(locationX, locationY);
        setLocalNeedle(angle);
        // Update global position in real-time
        if (typeof global !== 'undefined') {
          global.currentNeedlePosition = angle;
        }
      },
      onPanResponderRelease: (evt) => {
        isDraggingRef.current = false;
        // Get final angle from release position or use current localNeedle
        let finalAngle = localNeedle;
        if (evt && evt.nativeEvent) {
          const { locationX, locationY } = evt.nativeEvent;
          finalAngle = getAngleFromTouch(locationX, locationY);
          setLocalNeedle(finalAngle);
          if (typeof global !== 'undefined') {
            global.currentNeedlePosition = finalAngle;
          }
        }
        // Just update position, don't auto-submit
        if (onNeedleMoveRef.current && canMoveRef.current) {
          onNeedleMoveRef.current(finalAngle);
        }
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
      },
      // Prevent scrolling when interacting with gauge
      onShouldBlockNativeResponder: () => true,
    }),
    [getAngleFromTouch]
  );

  // Render arc path
  const arcPath = () => {
    const start = angleToPoint(0);
    const end = angleToPoint(180);
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
  };

  // Render ticks
  const renderTicks = () => {
    const ticks = [];
    for (let angle = 10; angle <= 170; angle += 10) {
      const outer = angleToPoint(angle);
      const rad = (angle + 180) * Math.PI / 180;
      const innerRadius = radius - (angle % 30 === 0 ? 12 : 8);
      const inner = {
        x: centerX + innerRadius * Math.cos(rad),
        y: centerY + innerRadius * Math.sin(rad)
      };
      ticks.push(
        <Line
          key={angle}
          x1={inner.x}
          y1={inner.y}
          x2={outer.x}
          y2={outer.y}
          stroke={theme.accent}
          strokeWidth={angle % 30 === 0 ? 3 : 2}
          strokeLinecap="round"
          opacity={0.55}
        />
      );
    }
    return ticks;
  };

  // Render sectors - extend to edge of gauge circle, but only show parts within 0-180 range
  const renderSectors = () => {
    if (!showTarget || !sectors || sectors.length === 0) return null;

    // Calculate outer radius to match the edge of the arc
    const outerRadius = radius + (ARC_STROKE / 2);

    return sectors.map((sector, i) => {
      // Only show the part of the sector that is within the gauge range (0-180)
      const visibleStart = Math.max(0, sector.start);
      const visibleEnd = Math.min(180, sector.end);
      if (visibleStart >= visibleEnd || visibleStart >= 180 || visibleEnd <= 0) {
        return null;
      }

      const startOuterRad = (visibleStart + 180) * Math.PI / 180;
      const endOuterRad = (visibleEnd + 180) * Math.PI / 180;
      const startOuterPt = {
        x: centerX + outerRadius * Math.cos(startOuterRad),
        y: centerY + outerRadius * Math.sin(startOuterRad)
      };
      const endOuterPt = {
        x: centerX + outerRadius * Math.cos(endOuterRad),
        y: centerY + outerRadius * Math.sin(endOuterRad)
      };
      const path = `M ${centerX} ${centerY} L ${startOuterPt.x} ${startOuterPt.y} A ${outerRadius} ${outerRadius} 0 0 1 ${endOuterPt.x} ${endOuterPt.y} Z`;

      // 2-point sector: deep green; 1-point sectors: light green. The number on
      // each sector carries the meaning too, not just the color.
      const isTop = sector.points === 2;
      return (
        <Path
          key={i}
          d={path}
          fill={isTop ? SECTOR_TOP : SECTOR_SIDE}
          stroke={colors.card}
          strokeWidth="2"
          opacity={0.92}
        />
      );
    }).filter(Boolean);
  };

  // Sector numbers drawn inside the SVG: physical coordinates on every
  // platform, so they always sit on their sector (the dial never flips in RTL)
  const renderSectorNumbers = () => {
    if (!showTarget || !sectors || sectors.length === 0) return null;

    return sectors.map((sector, i) => {
      const midAngle = (Math.max(0, sector.start) + Math.min(180, sector.end)) / 2;
      const midRad = (midAngle + 180) * Math.PI / 180;
      // In the outer band of the dial, where a 10-degree sector is widest, so
      // the three numbers never overlap
      const labelX = centerX + radius * Math.cos(midRad);
      const labelY = centerY + radius * Math.sin(midRad);
      const isTop = sector.points === 2;
      const label = isMobile ? typography.dial : typography.label;

      return (
        <SvgText
          key={`text-${i}`}
          x={labelX}
          y={labelY + label.fontSize * 0.36}
          fontSize={label.fontSize}
          fontFamily={typography.dial.fontFamily}
          textAnchor="middle"
          fill={isTop ? colors.white : colors.ink}
          stroke={isTop ? SECTOR_TOP : SECTOR_SIDE}
          strokeWidth={2}
          paintOrder="stroke"
        >
          {sector.points}
        </SvgText>
      );
    });
  };

  // Render needle
  const renderNeedle = (angle, color, isMain, strokeWidth) => {
    const needleLength = radius - 34;
    const rad = (angle + 180) * Math.PI / 180;
    const tipX = centerX + needleLength * Math.cos(rad);
    const tipY = centerY + needleLength * Math.sin(rad);

    return (
      <G>
        <Line
          x1={centerX}
          y1={centerY}
          x2={tipX}
          y2={tipY}
          stroke={color}
          strokeWidth={strokeWidth || (isMobile ? 4 : 5)}
          strokeLinecap="round"
        />
        {isMain ? <Circle cx={tipX} cy={tipY} r={isMobile ? 6 : 7} fill={color} stroke={colors.card} strokeWidth="2" /> : null}
      </G>
    );
  };

  const getPlayerColor = (playerName) => {
    if (!players || players.length === 0) return theme.signal || colors.danger;
    const player = players.find(p => p.name === playerName);
    return player?.color || theme.signal || colors.danger;
  };

  return (
    <View style={styles.container} collapsable={false}>
      <View
        style={styles.svgContainer}
        {...panResponder.panHandlers}
        onStartShouldSetResponder={() => canMove}
        onMoveShouldSetResponder={() => canMove}
        onResponderTerminationRequest={() => false}
        onTouchStart={(e) => {
          if (canMove) {
            e.stopPropagation();
          }
        }}
        onTouchMove={(e) => {
          if (canMove) {
            e.stopPropagation();
          }
        }}
      >
        <View style={styles.svgWrapper}>
          <Svg width={GAUGE_WIDTH} height={GAUGE_HEIGHT + 4} viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT + 4}`}>
            {/* Dial body: cardboard rim + tinted face */}
            <Path d={arcPath()} fill="none" stroke={theme.accentDeep} strokeWidth={ARC_STROKE + 8} strokeLinecap="round" opacity={0.18} />
            <Path d={arcPath()} fill="none" stroke={theme.tint} strokeWidth={ARC_STROKE} strokeLinecap="round" />

            {/* Ticks */}
            {renderTicks()}

            {/* Sectors */}
            {renderSectors()}
            {renderSectorNumbers()}

            {/* All players' needles */}
            {showAllNeedles && allNeedles && Object.entries(allNeedles).map(([name, angle]) => {
              const isCurrentPlayer = name === currentPlayerName;
              const playerColor = getPlayerColor(name);
              const strokeWidth = isCurrentPlayer ? (isMobile ? 5 : 6) : (isMobile ? 3 : 4);
              return (
                <G key={name} opacity={isCurrentPlayer ? 1 : 0.8}>
                  {renderNeedle(angle, playerColor, isCurrentPlayer, strokeWidth)}
                </G>
              );
            })}

            {/* Current player's needle (when not showing all) */}
            {!showAllNeedles && renderNeedle(localNeedle, getPlayerColor(currentPlayerName), true)}

            {/* Center pivot - a chunky knob */}
            <Circle cx={centerX} cy={centerY} r={isMobile ? 11 : 13} fill={theme.accent} stroke={colors.card} strokeWidth="3" />
            <Circle cx={centerX} cy={centerY} r={isMobile ? 4 : 5} fill={theme.signal || colors.gold} />
          </Svg>
        </View>
      </View>

      {/* Topic labels, pinned to the physical ends of the dial (0° left, 180° right) */}
      <View style={[styles.labelsContainer, { flexDirection: physicalRow() }]}>
        <View style={[styles.labelChip, { borderColor: theme.accent }]}>
          <AppText variant="bodyStrong" color={theme.accentInk} align="center" maxScale={1.3}>
            {leftLabel}
          </AppText>
        </View>
        <View style={[styles.labelChip, { borderColor: theme.accent }]}>
          <AppText variant="bodyStrong" color={theme.accentInk} align="center" maxScale={1.3}>
            {rightLabel}
          </AppText>
        </View>
      </View>

      {canMove && (
        <View style={styles.hintRow}>
          <Icon name="gesture" size={20} color={colors.inkSoft} />
          <AppText variant="caption" color={colors.inkSoft}>
            {S.frequency.gauge.dragHint}
          </AppText>
        </View>
      )}

      {/* Players legend when showing all needles: color dot + name */}
      {showAllNeedles && players && players.length > 0 && (
        <View style={styles.legendContainer}>
          {players.map((player) => {
            const hasGuessed = allNeedles && allNeedles[player.name] !== undefined;
            if (!hasGuessed) return null;
            return (
              <View key={player.name} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: player.color || theme.signal }]} />
                <AppText variant="label" maxScale={1.3}>
                  {player.name}
                </AppText>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  svgContainer: {
    width: GAUGE_WIDTH,
    height: GAUGE_HEIGHT + 4,
    position: 'relative',
    // Prevent scroll when touching gauge on mobile
    touchAction: 'none',
  },
  svgWrapper: {
    width: GAUGE_WIDTH,
    height: GAUGE_HEIGHT + 4,
    position: 'relative',
  },
  labelsContainer: {
    width: GAUGE_WIDTH,
    marginTop: spacing.md,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  labelChip: {
    flex: 1,
    maxWidth: '48%',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 2,
    backgroundColor: colors.card,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  legendDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});
