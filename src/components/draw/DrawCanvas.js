import React, { useCallback, useState, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { View, StyleSheet, Dimensions, PanResponder } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';

const { width, height } = Dimensions.get('window');
// Make canvas square and centered - use smaller dimension minus padding
const CANVAS_SIZE = Math.min(width - 40, height * 0.6, 500); // Max 500px, responsive
const CANVAS_WIDTH = CANVAS_SIZE;
const CANVAS_HEIGHT = CANVAS_SIZE;

/**
 * Draw Canvas component using react-native-svg
 * Supports Vite API: strokes, onStrokeComplete, canDraw, color, brushSize, toolType
 * Also supports legacy API: initialStrokes, onDrawingChange, disabled
 */
const DrawCanvas = forwardRef(({ 
  // Vite API
  strokes = [],
  onStrokeComplete,
  canDraw = false,
  color = '#000000',
  brushSize = 3,
  toolType = 'pencil',
  // Legacy API
  onDrawingChange,
  initialStrokes = [],
  disabled = false,
  onExportReady
}, ref) => {
  // Use Vite API if strokes prop is provided, otherwise use legacy
  const useViteAPI = strokes !== undefined && strokes.length >= 0;
  const isDisabled = useViteAPI ? !canDraw : disabled;
  
  const [paths, setPaths] = useState(() => {
    if (useViteAPI) {
      return strokes.map(stroke => ({
        pathString: stroke.path || '',
        color: stroke.color || color,
        width: stroke.width || brushSize,
        points: stroke.points || [],
      }));
    } else {
      return initialStrokes.map(stroke => ({
        pathString: stroke.path || '',
        color: stroke.color || '#000000',
        width: stroke.width || 3,
        points: stroke.points || [],
      }));
    }
  });

  const [currentPath, setCurrentPath] = useState(null);
  const [currentPoints, setCurrentPoints] = useState([]);
  const isDrawingRef = useRef(false);
  const svgRef = useRef(null);
  const disabledRef = useRef(isDisabled);
  const currentColorRef = useRef(color);
  const currentBrushSizeRef = useRef(brushSize);
  const currentToolTypeRef = useRef(toolType);
  
  // Update refs when props change
  useEffect(() => {
    disabledRef.current = isDisabled;
    currentColorRef.current = color;
    currentBrushSizeRef.current = brushSize;
    currentToolTypeRef.current = toolType;
  }, [isDisabled, color, brushSize, toolType]);

  // Update paths when strokes prop changes (Vite API)
  useEffect(() => {
    if (useViteAPI && strokes) {
      const newPaths = strokes.map(stroke => ({
        pathString: stroke.path || '',
        color: stroke.color || color,
        width: stroke.width || brushSize,
        points: stroke.points || [],
      }));
      setPaths(newPaths);
    }
  }, [useViteAPI, strokes, color, brushSize]);

  // Update paths when initialStrokes changes (Legacy API)
  useEffect(() => {
    if (!useViteAPI && initialStrokes) {
      if (initialStrokes.length > 0) {
        const newPaths = initialStrokes.map(stroke => ({
          pathString: stroke.path || '',
          color: stroke.color || '#000000',
          width: stroke.width || 3,
          points: stroke.points || [],
        }));
        setPaths(newPaths);
      } else if (initialStrokes.length === 0 && paths.length > 0) {
        setPaths([]);
      }
    }
  }, [useViteAPI, initialStrokes]);

  // Convert points array to SVG path string
  const pointsToPath = useCallback((points) => {
    if (points.length === 0) return '';
    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y}`;
    }
    
    let pathString = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      pathString += ` L ${points[i].x} ${points[i].y}`;
    }
    return pathString;
  }, []);

  // Create smooth path using quadratic curves
  const pointsToSmoothPath = useCallback((points) => {
    if (points.length === 0) return '';
    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y}`;
    }
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }

    let pathString = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      
      if (i === 1) {
        pathString += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
      } else {
        pathString += ` T ${midX} ${midY}`;
      }
    }
    
    const lastPoint = points[points.length - 1];
    pathString += ` T ${lastPoint.x} ${lastPoint.y}`;
    
    return pathString;
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderGrant: (evt) => {
        if (disabledRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        const point = { x: locationX, y: locationY };
        isDrawingRef.current = true;
        setCurrentPoints([point]);
        
        const strokeColor = currentToolTypeRef.current === 'eraser' ? '#FFFFFF' : currentColorRef.current;
        const strokeWidth = currentToolTypeRef.current === 'eraser' ? currentBrushSizeRef.current * 2 : currentBrushSizeRef.current;
        
        setCurrentPath({
          pathString: `M ${point.x} ${point.y}`,
          color: strokeColor,
          width: strokeWidth,
        });
      },
      onPanResponderMove: (evt) => {
        if (disabledRef.current || !isDrawingRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        const point = { x: locationX, y: locationY };
        
        setCurrentPoints(prev => {
          const newPoints = [...prev, point];
          // Don't limit points - allow full line drawing
          
          const strokeColor = currentToolTypeRef.current === 'eraser' ? '#FFFFFF' : currentColorRef.current;
          const strokeWidth = currentToolTypeRef.current === 'eraser' ? currentBrushSizeRef.current * 2 : currentBrushSizeRef.current;
          
          const pathString = pointsToSmoothPath(newPoints);
          setCurrentPath({
            pathString,
            color: strokeColor,
            width: strokeWidth,
          });
          
          return newPoints;
        });
      },
      onPanResponderRelease: () => {
        if (disabledRef.current || !isDrawingRef.current) return;
        
        setCurrentPoints(prevPoints => {
          if (prevPoints.length === 0) {
            isDrawingRef.current = false;
            setCurrentPath(null);
            return [];
          }
          
          const strokeColor = currentToolTypeRef.current === 'eraser' ? '#FFFFFF' : currentColorRef.current;
          const strokeWidth = currentToolTypeRef.current === 'eraser' ? currentBrushSizeRef.current * 2 : currentBrushSizeRef.current;
          
          const finalPathString = pointsToSmoothPath(prevPoints);
          const newPath = {
            pathString: finalPathString,
            color: strokeColor,
            width: strokeWidth,
            // Save as path string only to save space, not points
            points: [],
          };
          
          // Update paths state
          setPaths(prev => {
            const updatedPaths = [...prev, newPath];
            
            // Vite API: call onStrokeComplete with single stroke
            if (useViteAPI && onStrokeComplete) {
              onStrokeComplete({
                path: finalPathString,
                color: strokeColor,
                width: strokeWidth,
                // Save as path string only to save space
                points: [],
              });
            }
            
            // Legacy API: call onDrawingChange with all strokes
            if (!useViteAPI && onDrawingChange) {
              const strokeData = updatedPaths.map(p => ({
                path: p.pathString,
                color: p.color,
                width: p.width,
                // Save as path string only to save space
                points: [],
              }));
              onDrawingChange(strokeData);
            }
            
            return updatedPaths;
          });
          
          setCurrentPath(null);
          isDrawingRef.current = false;
          return [];
        });
      },
      onPanResponderTerminate: () => {
        setCurrentPath(null);
        setCurrentPoints([]);
        isDrawingRef.current = false;
      },
    })
  ).current;

  // Export drawing as SVG string
  const exportDrawing = useCallback(async () => {
    try {
      const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  ${paths.map((pathData, index) => 
    `<path 
      key="${index}"
      d="${pathData.pathString}" 
      stroke="${pathData.color}" 
      stroke-width="${pathData.width}" 
      fill="none" 
      stroke-linecap="round" 
      stroke-linejoin="round"
    />`
  ).join('\n  ')}
</svg>`;

      if (onExportReady) {
        onExportReady({
          svg: svgString,
          strokes: paths.map(p => ({
            path: p.pathString,
            color: p.color,
            width: p.width,
            points: p.points,
          })),
        });
      }
    } catch (error) {
      console.error('Error exporting drawing:', error);
    }
  }, [paths, onExportReady]);

  // Expose export function via ref
  useImperativeHandle(ref, () => ({
    exportDrawing,
    clearCanvas: () => {
      setPaths([]);
      setCurrentPath(null);
      setCurrentPoints([]);
      isDrawingRef.current = false;
      if (!useViteAPI && onDrawingChange) {
        onDrawingChange([]);
      }
    },
  }));

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Svg
        ref={svgRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={styles.svg}
      >
        <G>
          {/* Render all completed paths */}
          {paths.map((pathData, index) => (
            <Path
              key={`path-${index}`}
              d={pathData.pathString}
              stroke={pathData.color}
              strokeWidth={pathData.width}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          
          {/* Render current drawing path */}
          {currentPath && (
            <Path
              d={currentPath.pathString}
              stroke={currentPath.color}
              strokeWidth={currentPath.width}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </G>
      </Svg>
    </View>
  );
});

DrawCanvas.displayName = 'DrawCanvas';

export default DrawCanvas;

const styles = StyleSheet.create({
  container: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  svg: {
    flex: 1,
  },
});
