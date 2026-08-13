# NSurvey PRO — Documentation Directory

Welcome to the **NSurvey PRO** documentation hub. This directory contains architectural specifications, implementation plans, and future feature roadmaps for the application.

---

## 📚 Documentation Index

1. [**Future Roadmap & Improvement Ideas**](file:///d:/Store/Nacham%20Works/Surve/docs/FUTURE_ROADMAP_AND_IMPROVEMENTS.md)
   - Detailed feature proposals for 3D WebGL terrain orbit viewer, cadastral boundary overlap & encroachment conflict detector, GNSS RTK baseline QC, GIS satellite imagery layers, road corridor templates, and native desktop packaging.

2. [**Modern Rebuild Implementation Plan**](file:///d:/Store/Nacham%20Works/Surve/docs/MODERN_REBUILD_IMPLEMENTATION_PLAN.md)
   - The foundational architecture design and progressive module breakdown transitioning from legacy SurvPack 3.0 to the modern TypeScript/React CAD platform.

3. [**Legacy SurvPack 3.0 Architecture**](file:///d:/Store/Nacham%20Works/Surve/docs/LEGACY_ARCHITECTURE.md)
   - Comprehensive reverse-engineering notes, file formats (`.DAT`, `.PNT`, `.SUR`, `.DXF`, `.SCR`), coordinate transformations, and algorithms from the original legacy Visual Basic / FORTRAN survey codebase.

---

## 🛠️ Implemented Geomatics Modules in NSurvey PRO

| Module | Location | Description |
| :--- | :--- | :--- |
| **Vector CAD Canvas** | `src/components/cad/` | 2D vector CAD viewport, beacon rendering, selection, measurements |
| **Cadastral Title Deed Plan (TDP)** | `src/components/tdp/` | Official C of O & Layout TDP print studio with PDF generation |
| **Traverse Reduction & Balancing** | `src/components/traverse/` | Bowditch & Transit loop adjustments with DMS field book |
| **Spirit Leveling Studio** | `src/components/leveling/` | HPC & Rise/Fall reduction methods with arithmetic verification |
| **Tacheometry & 3D TIN DTM** | `src/components/tacheometry/` | Total Station/Stadia field book, Delaunay TIN mesh, vector contouring |
| **Setout / Setting-Out Staking** | `src/components/setout/` | Polar staking angles, sightlines, cut/fill height calculation |
| **Minna ↔ WGS84 Datum Transform** | `src/components/transform/` | 3-Param Helmert transformation, Google Earth KML export |
| **Horizontal Alignment & Earthworks**| `src/components/alignment/` | IP method circular curves, stationing, cross-sections, cut/fill volumes |
| **Area Sub-Division Engine** | `src/components/subdivision/`| Parallel boundary & pivot point land splitting with exact math |
| **AutoCAD DXF Studio** | `src/components/dxf/` | Full bidirectional DXF parser and generator |
| **Vertical Alignment Studio** | `src/components/alignment/` | PVI method parabolic sag/crest curves, longitudinal elevation profile |
| **Resection & COGO Intersections** | `src/components/resection/` | Tienstra 3-point angular & trilateration distance resection, COGO solvers |
| **Universal Field CSV Importer** | `src/components/importer/` | Smart delimiter/header detection, custom column mapping & validation |
