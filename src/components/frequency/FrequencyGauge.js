import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, PanResponder } from 'react-native';
import Svg, { Path, Circle, Line, G, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';

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
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setLocalNeedle(needlePosition || 90);
  }, [needlePosition]);

  // Store current needle position globally for submission
  useEffect(() => {
    if (canMove && typeof global !== 'undefined') {
      global.currentNeedlePosition = localNeedle;
    }
  }, [localNeedle, canMove]);

  // Calculate angle from touch coordinates
  const getAngleFromTouch = (x, y) => {
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
  };

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => canMove,
      onMoveShouldSetPanResponder: () => canMove,
      onPanResponderGrant: (evt) => {
        if (!canMove) return;
        setIsDragging(true);
        const { locationX, locationY } = evt.nativeEvent;
        const angle = getAngleFromTouch(locationX, locationY);
        setLocalNeedle(angle);
      },
      onPanResponderMove: (evt) => {
        if (!canMove || !isDragging) return;
        const { locationX, locationY } = evt.nativeEvent;
        const angle = getAngleFromTouch(locationX, locationY);
        setLocalNeedle(angle);
      },
      onPanResponderRelease: () => {
        setIsDragging(false);
        if (onNeedleMove) {
          onNeedleMove(localNeedle);
        }
      },
    })
  ).current;

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

  // Render sectors
  const renderSectors = () => {
    if (!showTarget || !sectors || sectors.length === 0) return null;

    return sectors.map((sector, i) => {
      const startPt = angleToPoint(sector.start);
      const endPt = angleToPoint(sector.end);
      
      const path = `M ${centerX} ${centerY} L ${startPt.x} ${startPt.y} A ${radius} ${radius} 0 0 1 ${endPt.x} ${endPt.y} Z`;
      
      const color = sector.points === 2 ? "rgba(34,197,94,0.7)" : "rgba(251,191,36,0.7)";
      const stroke = sector.points === 2 ? "rgba(34,197,94,0.9)" : "rgba(251,191,36,0.9)";
      
      return (
        <Path key={i} d={path} fill={color} stroke={stroke} strokeWidth="2" />
      );
    });
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
    <View style={styles.container}>
      <View 
        style={styles.svgContainer}
        {...(canMove ? panResponder.panHandlers : {})}
      >
        <View style={styles.svgWrapper}>
          <Svg width={GAUGE_WIDTH} height={GAUGE_HEIGHT} viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT}`}>
          <Defs>
            <LinearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.3" />
              <Stop offset="50%" stopColor="#A78BFA" stopOpacity="0.5" />
              <Stop offset="100%" stopColor="#C084FC" stopOpacity="0.3" />
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
  },
  svgContainer: {
    width: GAUGE_WIDTH,
    height: GAUGE_HEIGHT,
    position: 'relative',
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
    color: '#7C3AED',
    fontWeight: 'bold',
    fontSize: isMobile ? 12 : 14,
    textAlign: 'center',
  },
  hintText: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: isMobile ? 12 : 14,
    color: '#6B7280',
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
    color: '#374151',
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

