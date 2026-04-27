import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GerberPath, DrillHole, BoundingBox } from './parsers';

export interface ExportData {
  gerberTraces: GerberPath[];
  profileTraces?: GerberPath[];
  drillHoles: DrillHole[];
  bbox: BoundingBox;
  thickness: number;
  traceExtrusion: number;
  expansion: number;
  holeScale: number;
  holeThreshold: number;
  svgTracesInnerHtml?: string;
}

function distToSegmentSquared(p: THREE.Vector2, v: THREE.Vector2, w: THREE.Vector2) {
  const l2 = v.distanceToSquared(w);
  if (l2 === 0) return p.distanceToSquared(v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return p.distanceToSquared(new THREE.Vector2(v.x + t * (w.x - v.x), v.y + t * (w.y - v.y)));
}

function distToSegment(p: THREE.Vector2, v: THREE.Vector2, w: THREE.Vector2) {
  return Math.sqrt(distToSegmentSquared(p, v, w));
}

export async function generateSTL(data: ExportData) {
  const { bbox, thickness, drillHoles, holeScale, holeThreshold } = data;

  const scene = new THREE.Scene();

  // 1. Vypočítáme rozměry z bounding boxu a střed
  const centerX = (bbox.minX + bbox.maxX) / 2;
  const centerY = (bbox.minY + bbox.maxY) / 2;
  const width = Math.max(1, bbox.maxX - bbox.minX);
  const height = Math.max(1, bbox.maxY - bbox.minY);

  // Zde budeme držet všechny geometrie (deska + spoje) pro závěrečné spojení
  const finalGeometries: THREE.BufferGeometry[] = [];

  // 2. Vytvoříme 2D tvar obrysu desky (obdélník) pomocí THREE.Shape
  const boardShape = new THREE.Shape();
  
  // Vykreslíme základní obdélníkový profil (proti směru hodinových ručiček - CCW)
  const halfW = width / 2;
  const halfH = height / 2;
  boardShape.moveTo(-halfW, halfH); // Top Left
  boardShape.lineTo(-halfW, -halfH); // Bottom Left
  boardShape.lineTo(halfW, -halfH);  // Bottom Right
  boardShape.lineTo(halfW, halfH);   // Top Right
  boardShape.lineTo(-halfW, halfH);  // Uzavření tvaru

  // 3. Přidáme otvory přímo do křivky tvaru přes "holes" pro samotnou desku
  for (const hole of drillHoles) {
    const isTarget = hole.size < holeThreshold;
    const finalRadius = (isTarget ? hole.size * holeScale : hole.size) / 2;
    
    // Přepočet souřadnic (Y otočené kvůli rozdílu mezi SVG a 3D)
    const cx = hole.x - centerX;
    const cy = -(hole.y - centerY);

    const holePath = new THREE.Path();
    // Nakreslení kružnice díry (po směru hodinových ručiček - CW, obráceně k obrysu)
    holePath.absarc(cx, cy, finalRadius, 0, Math.PI * 2, true);
    boardShape.holes.push(holePath);
  }

  // 4. Extruze 2D tvaru s dírami do 3D (Deska od Z=0 do Z=thickness)
  const extrudeSettings = {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 32 // Počet segmentů pro hladké kružnice (kvalita)
  };

  const boardGeometry = new THREE.ExtrudeGeometry(boardShape, extrudeSettings);
  finalGeometries.push(boardGeometry);

  // 5. Vygenerujeme 3D objekty pro měděné spoje z SVG stringu přes stejný přístup jako desku
  if (data.svgTracesInnerHtml && data.traceExtrusion > 0) {
    const traceExtrudeSettings = {
      depth: data.traceExtrusion,
      bevelEnabled: false,
      curveSegments: 16
    };

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<svg>${data.svgTracesInnerHtml}</svg>`, 'image/svg+xml');
    const lines = doc.querySelectorAll('line');
    
    lines.forEach(line => {
      const x1 = parseFloat(line.getAttribute('x1') || '0');
      const y1 = parseFloat(line.getAttribute('y1') || '0');
      const x2 = parseFloat(line.getAttribute('x2') || '0');
      const y2 = parseFloat(line.getAttribute('y2') || '0');
      const strokeWidth = parseFloat(line.getAttribute('stroke-width') || '1');
      
      // Ignore practically zero-width lines (e.g. 0.01 polygons)
      if (strokeWidth <= 0.011) return;
      
      const P1 = new THREE.Vector2(x1 - centerX, -(y1 - centerY));
      const P2 = new THREE.Vector2(x2 - centerX, -(y2 - centerY));
      
      const dist = P1.distanceTo(P2);
      if (dist === 0) return;
      
      const radius = strokeWidth / 2;
      const angle = Math.atan2(P2.y - P1.y, P2.x - P1.x);
      
      // Vytvoříme 2D tvar "pilulky" z P1 do P2 přímo v absolutních souřadnicích
      const shape = new THREE.Shape();
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      
      shape.absarc(P2.x, P2.y, radius, angle - Math.PI / 2, angle + Math.PI / 2, false);
      shape.lineTo(P1.x + nx * radius, P1.y + ny * radius);
      shape.absarc(P1.x, P1.y, radius, angle + Math.PI / 2, angle - Math.PI / 2, false);
      shape.lineTo(P2.x - nx * radius, P2.y - ny * radius);
      
      // Aplikujeme otvory pro tento spoj, pokud přes něj procházejí
      for (const hole of drillHoles) {
        const isTarget = hole.size < holeThreshold;
        const finalRadius = (isTarget ? hole.size * holeScale : hole.size) / 2;
        
        const cx = hole.x - centerX;
        const cy = -(hole.y - centerY);
        const holeCenter = new THREE.Vector2(cx, cy);
        
        const distToTrace = distToSegment(holeCenter, P1, P2);
        
        // Zvětšíme toleranci o +0.01 pro jistotu, že i dotek bude vyříznut
        if (distToTrace < finalRadius + radius + 0.01) {
          const holePath = new THREE.Path();
          // Nakreslení kružnice díry (po směru hodinových ručiček - CW)
          holePath.absarc(cx, cy, finalRadius, 0, Math.PI * 2, true);
          shape.holes.push(holePath);
        }
      }
      
      const geometry = new THREE.ExtrudeGeometry(shape, traceExtrudeSettings);
      
      // Posuneme spoje do výšky desky, protože tvoří další vrstvu (Z = thickness)
      geometry.translate(0, 0, thickness);
      
      finalGeometries.push(geometry);
    });
  }

  // 6. Spojíme všechny geometrie (deska + spoje) do jednoho velkého mesh objektu
  const monolithicGeometry = BufferGeometryUtils.mergeGeometries(finalGeometries, false);
  
  if (monolithicGeometry) {
    const mainMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const mainMesh = new THREE.Mesh(monolithicGeometry, mainMaterial);
    scene.add(mainMesh);
  }

  // 7. Export do STL
  const exporter = new STLExporter();
  const stlString = exporter.parse(scene);
  
  // 8. Trigger download
  const blob = new Blob([stlString], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pcb_monolithic.stl`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
