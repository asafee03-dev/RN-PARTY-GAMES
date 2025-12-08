import React, { useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, PanResponder } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';

const { width } = Dimensions.get('window');
const GAUGE_SIZE = Math.min(width * 0.9, 350);
const CENTER_X = GAUGE_SIZE / 2;
const CENTER_Y = GAUGE_SIZE / 2;
const RADIUS = GAUGE_SIZE * 0.4;
const ARC_WIDTH = 20;

export default function SemiCircleGauge({ 
  sectors = [], 
  pointerAngle = 90,
  onAngleChange,
  leftLabel = 'מקום לסיטול גדול',
  rightLabel = 'מקום טובול ידול גדול',
  disabled = false
}) {
  // Calculate angle from touch coordinates
  const getAngleFromTouch = (x, y) => {
    const dx = x - CENTER_X;
    const dy = CENTER_Y - y; // Flip Y axis
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    // Convert from -180 to 180 range to 0 to 180 range
    if (angle < 0) angle += 360;
    if (angle > 180) angle = 180 - (angle - 180);
    
    return Math.max(0, Math.min(180, angle));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (evt) => {
        if (disabled) return;
        const { locationX, locationY } = evt.nativeEvent;
        const angle = getAngleFromTouch(locationX, locationY);
        onAngleChange?.(angle);
      },
      onPanResponderMove: (evt) => {
        if (disabled) return;
        const { locationX, locationY } = evt.nativeEvent;
        const angle = getAngleFromTouch(locationX, locationY);
        onAngleChange?.(angle);
      },
      onPanResponderRelease: () => {
        // Optional: Add haptic feedback here
      },
    })
  ).current;

  // Calculate arc path for semi-circle (0 to 180 degrees)
  const getArcPath = (startAngle, endAngle, radius) => {
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = CENTER_X + radius * Math.cos(Math.PI - startRad);
    const y1 = CENTER_Y - radius * Math.sin(Math.PI - startRad);
    const x2 = CENTER_X + radius * Math.cos(Math.PI - endRad);
    const y2 = CENTER_Y - radius * Math.sin(Math.PI - endRad);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 0 ${x2} ${y2}`;
  };

  // Get sector path
  const getSectorPath = (sector, radius) => {
    const startRad = (sector.start * Math.PI) / 180;
    const endRad = (sector.end * Math.PI) / 180;
    const x1 = CENTER_X + radius * Math.cos(Math.PI - startRad);
    const y1 = CENTER_Y - radius * Math.sin(Math.PI - startRad);
    const x2 = CENTER_X + radius * Math.cos(Math.PI - endRad);
    const y2 = CENTER_Y - radius * Math.sin(Math.PI - endRad);
    const largeArc = sector.end - sector.start > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 0 ${x2} ${y2}`;
  };

  // Calculate pointer position
  const pointerRad = (pointerAngle * Math.PI) / 180;
  const pointerX = CENTER_X + (RADIUS - 30) * Math.cos(Math.PI - pointerRad);
  const pointerY = CENTER_Y - (RADIUS - 30) * Math.sin(Math.PI - pointerRad);

  // Generate tick marks
  const ticks = [];
  for (let i = 0; i <= 180; i += 15) {
    const tickRad = (i * Math.PI) / 180;
    const tickX1 = CENTER_X + (RADIUS - 10) * Math.cos(Math.PI - tickRad);
    const tickY1 = CENTER_Y - (RADIUS - 10) * Math.sin(Math.PI - tickRad);
    const tickX2 = CENTER_X + (RADIUS + 5) * Math.cos(Math.PI - tickRad);
    const tickY2 = CENTER_Y - (RADIUS + 5) * Math.sin(Math.PI - tickRad);
    ticks.push({ x1: tickX1, y1: tickY1, x2: tickX2, y2: tickY2 });
  }

  return (
    <View 
      style={styles.container}
      {...panResponder.panHandlers}
    >
      <Svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
        {/* Outer yellow arc */}
        <Path
          d={getArcPath(0, 180, RADIUS)}
          stroke="#FFD700"
          strokeWidth={ARC_WIDTH}
          fill="none"
          strokeLinecap="round"
        />

        {/* Sector segments */}
        {sectors.map((sector) => {
          const isCenter = sector.points === 2;
          const sectorColor = isCenter ? '#FFD700' : '#4CAF50';
          
          return (
            <Path
              key={sector.id}
              d={getSectorPath(sector, RADIUS - ARC_WIDTH / 2)}
              stroke={sectorColor}
              strokeWidth={ARC_WIDTH - 4}
              fill="none"
              strokeLinecap="round"
            />
          );
        })}

        {/* Tick marks */}
        {ticks.map((tick, index) => (
          <Line
            key={index}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="#2C3E50"
            strokeWidth={2}
          />
        ))}

        {/* Sector number circles */}
        {sectors.map((sector, index) => {
          const isCenter = sector.points === 2;
          const centerAngle = (sector.start + sector.end) / 2;
          const centerRad = (centerAngle * Math.PI) / 180;
          const textX = CENTER_X + (RADIUS - 50) * Math.cos(Math.PI - centerRad);
          const textY = CENTER_Y - (RADIUS - 50) * Math.sin(Math.PI - centerRad);
          const circleColor = isCenter ? '#FFD700' : '#4CAF50';
          
          return (
            <Circle
              key={sector.id}
              cx={textX}
              cy={textY}
              r={25}
              fill={circleColor}
            />
          );
        })}

        {/* Pointer */}
        <Circle
          cx={pointerX}
          cy={pointerY}
          r={8}
          fill="#2C3E50"
        />
      </Svg>

      {/* Sector numbers overlay (using regular Text) */}
      {sectors.map((sector, index) => {
        const isCenter = sector.points === 2;
        const centerAngle = (sector.start + sector.end) / 2;
        const centerRad = (centerAngle * Math.PI) / 180;
        const textX = CENTER_X + (RADIUS - 50) * Math.cos(Math.PI - centerRad);
        const textY = CENTER_Y - (RADIUS - 50) * Math.sin(Math.PI - centerRad);
        
        return (
          <Text
            key={`text-${sector.id}`}
            style={[
              styles.sectorNumberText,
              {
                left: textX - 12,
                top: textY - 16,
              }
            ]}
          >
            {sector.points}
          </Text>
        );
      })}

      {/* Labels below sectors */}
      <View style={styles.labelsContainer}>
        <Text style={styles.sectorLabel}>{leftLabel}</Text>
        <Text style={styles.sectorLabel}>{rightLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: GAUGE_SIZE,
    height: GAUGE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  labelsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: GAUGE_SIZE * 0.85,
    marginTop: GAUGE_SIZE * 0.15,
    paddingHorizontal: 10,
  },
  sectorLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
    flex: 1,
    opacity: 0.9,
  },
  sectorNumberText: {
    position: 'absolute',
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    width: 24,
    height: 32,
    textAlign: 'center',
  },
});
