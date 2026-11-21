import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

/**
 * Drawing canvas with device-independent coordinates.
 *
 * Every stroke is stored on a fixed GRID x GRID square (0..1000, i.e. 0..1
 * with three decimals) and drawn through an SVG viewBox, so each device scales
 * the whole drawing - stroke thickness included - to its own canvas size. An
 * iPad drawing is shown complete on a phone and the other way round.
 *
 * Stroke format (written to Firestore by the Draw screen):
 *   { v: 2, path: 'M 120 340 Q ...' (grid units), color, width (grid units), points: [] }
 * Strokes without v: 2 (the old pixel format) are ignored, never crash.
 *
 * props: strokes, onStrokeComplete(stroke), canDraw, color, brushSize (px on a
 * ~360px phone canvas, converted to grid units), toolType, size (px, square)
 */
export const GRID = 1000;
export const STROKE_VERSION = 2;
const BRUSH_TO_GRID = GRID / 360; // keeps the old look of 3/6/9 px brushes on a phone

const round1 = (n) => Math.round(n * 10) / 10;

export const isCurrentStroke = (s) => !!s && s.v === STROKE_VERSION && typeof s.path === 'string';

// Quadratic smoothing through the midpoints (grid units)
const pointsToPath = (points) => {
  if (points.length === 0) return '';
  const p0 = points[0];
  if (points.length === 1) return `M ${p0.x} ${p0.y} L ${p0.x + 0.1} ${p0.y}`; // a dot
  if (points.length === 2) return `M ${p0.x} ${p0.y} L ${points[1].x} ${points[1].y}`;
  let d = `M ${p0.x} ${p0.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const c = points[i];
    const n = points[i + 1];
    d += ` Q ${c.x} ${c.y} ${round1((c.x + n.x) / 2)} ${round1((c.y + n.y) / 2)}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
};

export default function DrawCanvas({
  strokes = [],
  onStrokeComplete,
  canDraw = false,
  color = '#000000',
  brushSize = 3,
  toolType = 'pencil',
  size = 300,
}) {
  const [currentPath, setCurrentPath] = useState(null);
  const pointsRef = useRef([]);
  const drawingRef = useRef(false);
  // The PanResponder is created once, so it reads the latest props from a ref
  const latest = useRef({});
  latest.current = { canDraw, color, brushSize, toolType, size, onStrokeComplete };

  // Turn ended / tool disabled mid-stroke: drop the unfinished stroke
  useEffect(() => {
    if (!canDraw) {
      drawingRef.current = false;
      pointsRef.current = [];
      setCurrentPath(null);
    }
  }, [canDraw]);

  const strokeStyle = () => {
    const { toolType: tool, color: c, brushSize: b } = latest.current;
    const eraser = tool === 'eraser';
    return { color: eraser ? '#FFFFFF' : c, width: round1((eraser ? b * 2 : b) * BRUSH_TO_GRID) };
  };

  // Touch position (px inside the canvas) -> grid units, clamped to the sheet
  const toGrid = (evt) => {
    const s = latest.current.size || 1;
    const { locationX, locationY } = evt.nativeEvent;
    const clamp = (v) => Math.max(0, Math.min(GRID, Math.round((v / s) * GRID)));
    return { x: clamp(locationX), y: clamp(locationY) };
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!latest.current.canDraw,
        onMoveShouldSetPanResponder: () => !!latest.current.canDraw,
        onPanResponderTerminationRequest: () => false, // keep the gesture while drawing
        onPanResponderGrant: (evt) => {
          if (!latest.current.canDraw) return;
          drawingRef.current = true;
          pointsRef.current = [toGrid(evt)];
          setCurrentPath({ ...strokeStyle(), path: pointsToPath(pointsRef.current) });
        },
        onPanResponderMove: (evt) => {
          if (!drawingRef.current || !latest.current.canDraw) return;
          const p = toGrid(evt);
          const prev = pointsRef.current[pointsRef.current.length - 1];
          if (prev && Math.abs(prev.x - p.x) < 2 && Math.abs(prev.y - p.y) < 2) return; // skip jitter
          pointsRef.current = [...pointsRef.current, p];
          setCurrentPath({ ...strokeStyle(), path: pointsToPath(pointsRef.current) });
        },
        onPanResponderRelease: () => {
          if (!drawingRef.current) return;
          drawingRef.current = false;
          const points = pointsRef.current;
          pointsRef.current = [];
          setCurrentPath(null);
          if (points.length === 0 || !latest.current.canDraw) return;
          const { color: c, width } = strokeStyle();
          latest.current.onStrokeComplete?.({ v: STROKE_VERSION, path: pointsToPath(points), color: c, width, points: [] });
        },
        onPanResponderTerminate: () => {
          drawingRef.current = false;
          pointsRef.current = [];
          setCurrentPath(null);
        },
      }),
    []
  );

  const visible = (strokes || []).filter(isCurrentStroke);

  return (
    <View
      style={[styles.sheet, { width: size, height: size }, canDraw && styles.drawing]}
      {...(canDraw ? panResponder.panHandlers : {})}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`} pointerEvents="none">
        <G>
          {visible.map((s, i) => (
            <Path key={i} d={s.path} stroke={s.color} strokeWidth={s.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {currentPath ? (
            <Path d={currentPath.path} stroke={currentPath.color} strokeWidth={currentPath.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  // Web: gestures on the canvas never scroll or zoom the page
  drawing: {
    touchAction: 'none',
    userSelect: 'none',
  },
});
