import React, { useEffect, useState } from 'react';
import { Dimensions, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isMobile = SCREEN_WIDTH < 768;
const GAUGE_WIDTH = isMobile ? 300 : 400;
const GAUGE_HEIGHT = isMobile ? 150 : 200;

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
  useEffect(() => {
    if (!isDraggingRef.current && needlePosition !== undefined && needlePosition !== null) {
      // Only update if the prop value is significantly different to avoid unnecessary updates
      const currentValue = localNeedle;
      const newValue = needlePosition;
      if (Math.abs(currentValue - newValue) > 0.1) {
        setLocalNeedle(newValue);
      }
    }
  }, [needlePosition]);

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
      const innerRadius = radius - 8;
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
          stroke="white"
          strokeWidth="2"
          opacity="0.6"
        />
      );
    }
    return ticks;
  };

  // Render sectors - extend to edge of gauge circle, but only show parts within 0-180 range
  const renderSectors = () => {
    if (!showTarget || !sectors || sectors.length === 0) return null;

    // Calculate outer radius to match the edge of the arc (arc has strokeWidth 30-40)
    const arcStrokeWidth = isMobile ? 30 : 40;
    const outerRadius = radius + (arcStrokeWidth / 2);

    return sectors.map((sector, i) => {
      // Clamp sector to visible range (0-180)
      // Only show the part of the sector that is within the gauge range
      const visibleStart = Math.max(0, sector.start);
      const visibleEnd = Math.min(180, sector.end);
      
      // Skip if sector is completely outside visible range
      if (visibleStart >= visibleEnd || visibleStart >= 180 || visibleEnd <= 0) {
        return null;
      }
      
      // Calculate outer edge points (at the edge of the arc) for visible portion
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
      
      // Create path that extends to the outer edge of the gauge arc
      // Only show the visible portion (0-180)
      const path = `M ${centerX} ${centerY} L ${startOuterPt.x} ${startOuterPt.y} A ${outerRadius} ${outerRadius} 0 0 1 ${endOuterPt.x} ${endOuterPt.y} Z`;
      
      // 1 point sectors = bright green, 2 points sector = dark green
      const color = sector.points === 2 
        ? "rgba(22,163,74,0.8)" // Dark green for 2 points
        : "rgba(74,222,128,0.8)"; // Bright green for 1 point
      const stroke = sector.points === 2 
        ? "rgba(22,163,74,1)" // Dark green stroke
        : "rgba(74,222,128,1)"; // Bright green stroke
      
      return (
        <Path key={i} d={path} fill={color} stroke={stroke} strokeWidth="2" />
      );
    }).filter(Boolean); // Remove null entries
  };

  // Render sector numbers as overlay
  const renderSectorNumbers = () => {
    if (!showTarget || !sectors || sectors.length === 0) return null;

    return sectors.map((sector, i) => {
      const midAngle = (sector.start + sector.end) / 2;
      const midRad = (midAngle + 180) * Math.PI / 180;
      const labelX = centerX + (radius * 0.65) * Math.cos(midRad);
      const labelY = centerY + (radius * 0.65) * Math.sin(midRad);
      
      return (
        <Text
          key={`text-${i}`}
          style={[
            styles.sectorNumber,
            {
              left: labelX - 12,
              top: labelY - 16,
            }
          ]}
        >
          {sector.points}
        </Text>
      );
    });
  };

  // Render needle
  const renderNeedle = (angle, color, isMain, strokeWidth) => {
    const needleLength = radius - 40;
    const rad = (angle + 180) * Math.PI / 180;
    const tipX = centerX + needleLength * Math.cos(rad);
    const tipY = centerY + needleLength * Math.sin(rad);
    
    return (
      <Line
        x1={centerX}
        y1={centerY}
        x2={tipX}
        y2={tipY}
        stroke={color}
        strokeWidth={strokeWidth || (isMobile ? 3 : 4)}
        strokeLinecap="round"
      />
    );
  };

  const getPlayerColor = (playerName) => {
    if (!players || players.length === 0) return "#EF4444";
    const player = players.find(p => p.name === playerName);
    return player?.color || "#EF4444";
  };

  return (
    <View style={styles.container} collapsable={false}>
      <View 
        style={styles.svgContainer}
        {...panResponder.panHandlers}
        onStartShouldSetResponder={() => canMove}
        onMoveShouldSetResponder={() => canMove}
        onResponderTerminationRequest={() => false}
      >
        <View style={styles.svgWrapper}>
          <Svg width={GAUGE_WIDTH} height={GAUGE_HEIGHT} viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT}`}>
          <Defs>
            <LinearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#0A1A3A" stopOpacity="0.3" />
              <Stop offset="50%" stopColor="#1E3A5F" stopOpacity="0.5" />
              <Stop offset="100%" stopColor="#0A1A3A" stopOpacity="0.3" />
            </LinearGradient>
          </Defs>

          {/* Arc */}
          <Path
            d={arcPath()}
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth={isMobile ? 30 : 40}
            strokeLinecap="round"
          />

          {/* Ticks */}
          {renderTicks()}

          {/* Sectors */}
          {renderSectors()}

          {/* All players' needles */}
          {showAllNeedles && allNeedles && Object.entries(allNeedles).map(([name, angle]) => {
            const isCurrentPlayer = name === currentPlayerName;
            const playerColor = getPlayerColor(name);
            const strokeWidth = isCurrentPlayer ? (isMobile ? 4 : 5) : (isMobile ? 3 : 4);
            return (
              <G key={name} opacity={isCurrentPlayer ? 1 : 0.7}>
                {renderNeedle(angle, playerColor, isCurrentPlayer, strokeWidth)}
              </G>
            );
          })}

          {/* Current player's needle (when not showing all) */}
          {!showAllNeedles && renderNeedle(localNeedle, getPlayerColor(currentPlayerName), true)}

          {/* Center pivot */}
          <Circle
            cx={centerX}
            cy={centerY}
            r={isMobile ? 7 : 9}
            fill="#1F2937"
            stroke="white"
            strokeWidth="3"
          />
          </Svg>
          {renderSectorNumbers()}
        </View>
      </View>

      {/* Labels */}
      <View style={styles.labelsContainer}>
        <View style={styles.labelLeft}>
          <Text style={styles.labelText}>{leftLabel}</Text>
        </View>
        <View style={styles.labelRight}>
          <Text style={styles.labelText}>{rightLabel}</Text>
        </View>
      </View>

      {canMove && (
        <Text style={styles.hintText}>
          📌 גרור את המחוגן למיקום הרצוי
        </Text>
      )}

      {/* Players legend when showing all needles */}
      {showAllNeedles && players && players.length > 0 && (
        <View style={styles.legendContainer}>
          {players.map((player) => {
            const hasGuessed = allNeedles && allNeedles[player.name] !== undefined;
            if (!hasGuessed) return null;
            return (
              <View
                key={player.name}
                style={[
                  styles.legendItem,
                  { borderColor: player.color, backgroundColor: `${player.color}15` }
                ]}
              >
                <View style={[styles.legendDot, { backgroundColor: player.color }]} />
                <Text style={styles.legendText}>{player.name}</Text>
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
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
  },
  svgContainer: {
    width: GAUGE_WIDTH,
    height: GAUGE_HEIGHT,
    position: 'relative',
    // Prevent scroll when touching gauge on mobile
    touchAction: 'none',
  },
  svgWrapper: {
    width: GAUGE_WIDTH,
    height: GAUGE_HEIGHT,
    position: 'relative',
  },
  labelsContainer: {
    flexDirection: 'row',
    width: GAUGE_WIDTH,
    marginTop: 16,
    height: 60,
    position: 'relative',
  },
  labelLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '40%',
    alignItems: 'center',
  },
  labelRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: '40%',
    alignItems: 'center',
  },
  labelText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: isMobile ? 12 : 14,
    textAlign: 'center',
  },
  hintText: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: isMobile ? 12 : 14,
    color: '#E5E7EB',
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 2,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#E5E7EB',
  },
  sectorNumber: {
    position: 'absolute',
    fontSize: isMobile ? 18 : 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    width: 24,
    height: 24,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});

