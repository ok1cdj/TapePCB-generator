# TapePCB

TapePCB is a fast and simple browser-based tool to convert your 2D PCB design files (Gerber and Drill) into fully 3D printable STL models. 

## Features
- **Gerber parsing:** Open top/bottom copper traces and edge profiles.
- **Drill parsing:** Import Excellon `.drl` files.
- **Parametric Extrusion:** Customize board thickness, trace height, and hole diameters.
- **Monolithic STL Export:** Uses CSG (Constructive Solid Geometry) to drill clean holes through all layers (board and traces) ensuring a monolithic structure to prevent slicer artifacts.
- **Browser-only:** Your PCB files never leave your browser context. Evaluated locally.

## Development

The project is built with React, Vite, and Three.js.

### Install Dependencies
```bash
npm install
```

### Run Locally
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

## Stack
- React 18
- Tailwind CSS
- Three.js (for rendering and STL export)
- `three-bvh-csg` (for Boolean drill subtractions)
- `lucide-react` (for icons)
- `motion` (for animations)
