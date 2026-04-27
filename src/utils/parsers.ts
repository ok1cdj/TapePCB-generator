/**
 * Simplified Gerber (RS-274X) and Excellon parser for visualization.
 */

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GerberPath {
  points: { x: number; y: number }[];
  type: 'line' | 'move';
  apertureSize: number;
}

export interface DrillHole {
  x: number;
  y: number;
  size: number;
}

export interface ParsedPCB {
  traces: GerberPath[];
  holes: DrillHole[];
  bbox: BoundingBox;
}

export function parseGerber(content: string): { traces: GerberPath[]; bbox: BoundingBox } {
  const lines = content.split('\n');
  const traces: GerberPath[] = [];
  const apertures: Record<string, number> = {};
  
  let currentX = 0;
  let currentY = 0;
  let currentAperture = 0;
  let unitScale = 1; // Default to mm
  
  // Gerber coordinate format: assume 3.4 for now if not found
  // Usually %FSLAX34Y34*%
  let coordScale = 0.0001; 

  const bbox: BoundingBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  const updateBBox = (x: number, y: number) => {
    if (x < bbox.minX) bbox.minX = x;
    if (x > bbox.maxX) bbox.maxX = x;
    if (y < bbox.minY) bbox.minY = y;
    if (y > bbox.maxY) bbox.maxY = y;
  };

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Units
    if (line.includes('%MOMM')) unitScale = 1;
    if (line.includes('%MOIN')) unitScale = 25.4;

    // Aperture Definition: %ADD10C,0.127*%
    if (line.startsWith('%AD')) {
      const match = line.match(/D(\d+)([CR]),([\d.]+)/);
      if (match) {
        apertures[match[1]] = parseFloat(match[3]);
      }
    }

    // Aperture Selection: D10*
    if (line.match(/^D(\d+)\*$/)) {
      const match = line.match(/^D(\d+)\*$/);
      if (match) currentAperture = apertures[match[1]] || 0;
    }

    // Move/Draw: X...Y...D...*
    const coordMatch = line.match(/X([-]?\d+)?Y([-]?\d+)?(D0[123])?/);
    if (coordMatch) {
      const xStr = coordMatch[1];
      const yStr = coordMatch[2];
      const dCode = coordMatch[3];

      const newX = xStr !== undefined ? parseInt(xStr) * coordScale * unitScale : currentX;
      const newY = yStr !== undefined ? parseInt(yStr) * coordScale * unitScale : currentY;

      if (dCode === 'D01') {
        // Draw line from current to new
        traces.push({
          points: [{ x: currentX, y: currentY }, { x: newX, y: newY }],
          type: 'line',
          apertureSize: currentAperture
        });
        updateBBox(newX, newY);
      } else if (dCode === 'D02' || !dCode) {
        // Move
        updateBBox(newX, newY);
      } else if (dCode === 'D03') {
        // Flash (could treat as a short line or point)
        updateBBox(newX, newY);
      }

      currentX = newX;
      currentY = newY;
    }
  }

  return { traces, bbox };
}

export function parseDrill(content: string): DrillHole[] {
  const lines = content.split('\n');
  const holes: DrillHole[] = [];
  const tools: Record<string, number> = {};
  
  let currentTool = 0;
  let unitScale = 1;
  let coordScale = 0.001; // Excellon usually has different default or explicit scale

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.includes('METRIC')) unitScale = 1;
    if (line.includes('INCH')) unitScale = 25.4;

    // Tool definition: T01C0.5
    if (line.match(/^T(\d+)C([\d.]+)/)) {
      const match = line.match(/^T(\d+)C([\d.]+)/);
      if (match) tools[match[1]] = parseFloat(match[2]);
    }

    // Tool select: T01
    if (line.match(/^T(\d+)$/)) {
      const match = line.match(/^T(\d+)$/);
      if (match) currentTool = tools[match[1]] || 0;
    }

    // Coordinates: X1.23Y4.56 or X123Y456
    const coordMatch = line.match(/X([-]?[\d.]+)?Y([-]?[\d.]+)?/);
    if (coordMatch) {
      const xStr = coordMatch[1];
      const yStr = coordMatch[2];
      if (xStr && yStr) {
        const x = parseFloat(xStr) * (xStr.includes('.') ? 1 : coordScale) * unitScale;
        const y = parseFloat(yStr) * (yStr.includes('.') ? 1 : coordScale) * unitScale;
        holes.push({ x, y, size: currentTool });
      }
    }
  }

  return holes;
}
