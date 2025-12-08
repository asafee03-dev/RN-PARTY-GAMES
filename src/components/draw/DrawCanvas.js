import React, { useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { 
  Canvas, 
  Path, 
  useTouchHandler, 
  useValue,
  Skia,
  Group,
} from '@shopify/react-native-skia';

const { width, height } = Dimensions.get('window');
const CANVAS_WIDTH = width - 40;
const CANVAS_HEIGHT = height * 0.6;

/**
 * Draw Canvas component using @shopify/react-native-skia
 * Supports smooth finger drawing and stroke storage
 * 
 * @param {function} onDrawingChange - Callback when drawing changes (receives stroke data)
 * @param {Array} initialStrokes - Initial strokes to render (for multiplayer sync)
 * @param {boolean} disabled - Whether drawing is disabled
 * @param {function} onExportReady - Callback when export is ready (receives image data URI)
 */
const DrawCanvas = forwardRef(({ 
  onDrawingChange,
  initialStrokes = [],
  disabled = false,
  onExportReady
}, ref) => {
  const [paths, setPaths] = useState(initialStrokes.map(stroke => ({
    path: Skia.Path.MakeFromSVGString(stroke.path) || Skia.Path.Make(),
    color: stroke.color || '#000000',
    width: stroke.width || 3,
  })));

  const currentPath = useValue(Skia.Path.Make());
  const currentColor = useValue('#000000');
  const currentWidth = useValue(3);
  const isDrawing = useValue(false);

  const touchHandler = useTouchHandler({
    onStart: (touchInfo) => {
      if (disabled) return;
      isDrawing.current = true;
      const path = Skia.Path.Make();
      path.moveTo(touchInfo.x, touchInfo.y);
      currentPath.current = path;
      currentColor.current = '#000000';
      currentWidth.current = 3;
    },
    onActive: (touchInfo) => {
      if (disabled || !isDrawing.current) return;
      currentPath.current.lineTo(touchInfo.x, touchInfo.y);
    },
    onEnd: () => {
      if (disabled || !isDrawing.current) return;
      
      // Convert path to SVG string for storage
      const pathString = currentPath.current.toSVGString();
      const newPath = {
        path: currentPath.current,
        color: currentColor.current,
        width: currentWidth.current,
        pathString,
      };
      
      // Update paths state
      const updatedPaths = [...paths, newPath];
      setPaths(updatedPaths);
      
      // Notify parent of change
      if (onDrawingChange) {
        const strokeData = updatedPaths.map(p => ({
          path: p.pathString,
          color: p.color,
          width: p.width,
        }));
        onDrawingChange(strokeData);
      }
      
      // Reset current path
      currentPath.current = Skia.Path.Make();
      isDrawing.current = false;
    },
  });

  // Export drawing as image (PNG data URI)
  const exportDrawing = useCallback(async () => {
    try {
      // This would typically use Skia's image export capabilities
      // For now, return the stroke data which can be reconstructed
      if (onExportReady) {
        const exportData = paths.map(p => ({
          path: p.pathString,
          color: p.color,
          width: p.width,
        }));
        onExportReady(exportData);
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
      currentPath.current = Skia.Path.Make();
      onDrawingChange?.([]);
    },
  }));

  // Update paths when initialStrokes changes (for multiplayer sync)
  React.useEffect(() => {
    if (initialStrokes.length > 0 && initialStrokes.length !== paths.length) {
      const newPaths = initialStrokes.map(stroke => {
        const path = Skia.Path.MakeFromSVGString(stroke.path);
        return {
          path: path || Skia.Path.Make(),
          color: stroke.color || '#000000',
          width: stroke.width || 3,
          pathString: stroke.path,
        };
      });
      setPaths(newPaths);
    }
  }, [initialStrokes]);

  return (
    <View style={styles.container}>
      <Canvas 
        style={styles.canvas}
        onTouch={touchHandler}
      >
        <Group>
          {/* Render all completed paths */}
          {paths.map((pathData, index) => (
            <Path
              key={index}
              path={pathData.path}
              color={pathData.color}
              style="stroke"
              strokeWidth={pathData.width}
              strokeCap="round"
              strokeJoin="round"
            />
          ))}
          
          {/* Render current drawing path */}
          {isDrawing.current && (
            <Path
              path={currentPath.current}
              color={currentColor.current}
              style="stroke"
              strokeWidth={currentWidth.current}
              strokeCap="round"
              strokeJoin="round"
            />
          )}
        </Group>
      </Canvas>
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
  canvas: {
    flex: 1,
  },
});

