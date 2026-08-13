# NSurvey PRO — Future Roadmap & Improvement Ideas

This document outlines a structured, high-value technical roadmap of potential features, architectural enhancements, rendering optimizations, and domain-specific extensions for **NSurvey PRO** (Next-Generation Cadastral & Geomatics Desktop Suite).

---

## 1. 3D Graphics, Terrain Mesh & CAD Engine Enhancements

### 1.1 Interactive 3D WebGL / Three.js Terrain Orbit Viewport
- **Overview:** Add a dedicated 3D Orbit Viewport mode alongside the 2D CAD canvas.
- **Capabilities:**
  - Full 3D rotation, pitch, tilt, and isometric camera orbit controls.
  - Shaded relief rendering of the 3D Triangulated Irregular Network (TIN) surface with elevation color ramps (Hypsometric tinting).
  - 3D contour wireframe drape and 3D beacon pins.
  - Interactive slicing plane tool for inspecting terrain elevation cuts.
- **Survey Value:** Allows surveyors and civil contractors to visually inspect excavation cuts, slope gradients, and natural ground profiles in realistic 3D.

### 1.2 High-Performance CAD Engine for Big Data (100k+ Points)
- **Overview:** Optimize coordinate and parcel rendering for massive topographical surveys.
- **Capabilities:**
  - WebGL / Canvas2D Quadtree spatial indexing for instant viewport culling (only render visible beacons).
  - Dynamic beacon clustering at zoomed-out scales.
  - Web Worker offloaded TIN surface triangulation for non-blocking calculations.

### 1.3 Advanced Object Snapping & Construction Tooling
- **Overview:** Enhance the CAD mouse interaction engine with professional AutoCAD-level OSNAP capabilities.
- **Capabilities:**
  - Perpendicular snap, Tangent snap, Circle Center snap, and Midpoint snap.
  - Dynamic Polar Tracking & Coordinate Extension guidelines (e.g. extending lines at $45^\circ$, $90^\circ$, $180^\circ$).
  - Offset Line / Parallel Polyline Generator (for road curbs, setbacks, easement boundaries).

---

## 2. Cadastral, Boundary & Legal Topology QA/QC

### 2.1 Cadastral Encroachment & Boundary Overlap Conflict Detector
- **Overview:** An automated topological verification engine for cadastral subdivisions and master plans.
- **Capabilities:**
  - Polygon-polygon intersection clipping to identify physical overlaps between adjacent plots.
  - Sliver polygon detection and micro-gap identification.
  - Generates an official **Boundary Dispute & Encroachment Schedule** stating overlap areas ($m^2$) and encroaching beacon coordinates.
- **Survey Value:** Essential for State Land Registries, Surveyor-General offices, and private cadastral surveyors to prevent boundary disputes before title issuance.

### 2.2 Automated Multi-Lot Cadastral Subdivider
- **Overview:** Automated grid partitioning of large agricultural or residential layouts.
- **Capabilities:**
  - Partition a master perimeter polygon into $N$ equal rectangular or custom-sized residential plots (e.g., $450\text{ m}^2$, $600\text{ m}^2$, $1000\text{ m}^2$) including access road reservation corridors ($12\text{m}$, $15\text{m}$, $18\text{m}$ standard road widths).
  - Automatic sequential beacon numbering (`PB101`, `PB102`...) and automated lot numbering (`Plot 1`, `Plot 2`...).

### 2.3 Automated Multi-Plot TDP Batch Generator
- **Overview:** Batch generation of official Title Deed Plans for estates with 50–500 plots.
- **Capabilities:**
  - 1-click batch PDF export of individual TDP sheets for all parcels in the project.
  - Automatic page numbering, QR code stamp linking to survey registry metadata, and ZIP file export.

---

## 3. Geomatics, GNSS & Network Least Squares

### 3.1 3D Multi-Station Network Least Squares Adjustment
- **Overview:** Rigorous variation of coordinates least squares adjustment for complex traverse loops and triangulation/trilateration networks.
- **Capabilities:**
  - Solves simultaneous observation equations for $N$ unknown stations.
  - Computes global variance factor $\hat{\sigma}_0^2$ (Chi-Square test for observational blunder detection).
  - Standard error ellipses ($a$, $b$, $\theta$) at $95\%$ and $99\%$ confidence levels for every network station.

### 3.2 GNSS RTK Baseline & Quality Control Studio
- **Overview:** Post-processing quality check for raw GNSS RTK vector observations.
- **Capabilities:**
  - Import vector baselines ($\Delta X, \Delta Y, \Delta Z$) and covariance matrices ($Q_{XX}, Q_{YY}, Q_{ZZ}, Q_{XY}\dots$).
  - Quality filtering based on PDOP, HDOP, GDOP, satellite count, and Fix/Float status.
  - Cycle slip and multipath detection.

### 3.3 International Geomagnetic Reference Field (IGRF) Calculator
- **Overview:** Real-time computation of Magnetic Declination and Annual Magnetic Drift for any location in Nigeria and globally.
- **Capabilities:**
  - Calculates true north vs magnetic north deviation based on survey epoch/date.
  - Automatically draws the dual True North / Magnetic North arrow on Title Deed Plans with annual change notation.

---

## 4. GIS, Drone Photogrammetry & Web Mapping Layers

### 4.1 Hybrid Satellite & Web Map Tile Layer (WMTS / OSM / Google Satellite)
- **Overview:** Overlay CAD vector survey drawings over live georeferenced satellite imagery.
- **Capabilities:**
  - Integrates OpenStreetMap (OSM) and High-Resolution Satellite map tiles automatically reprojected from WGS84 to Nigerian Minna Datum.
  - Opacity slider to compare CAD beacon boundaries against visible physical features (roads, buildings, rivers, fences) on satellite imagery.

### 4.2 GeoTIFF Drone Orthomosaic Raster Drape
- **Overview:** Direct import of orthophotos produced by DJI, Wingtra, or eBee survey drones.
- **Capabilities:**
  - Parses GeoTIFF spatial metadata (worldfile, projection tags).
  - Renders georeferenced aerial orthomosaics directly underneath CAD vector drawings.

### 4.3 GIS Formats Import & Export (ESRI Shapefile & GeoJSON)
- **Overview:** Full interoperability with ArcGIS, QGIS, and national spatial data infrastructures.
- **Capabilities:**
  - Export/import `.shp`, `.dbf`, `.shx`, and `.geojson` containing polygon attribute tables (Owner, C of O number, Land Use, Zoning).

---

## 5. Civil Engineering & Earthworks Infrastructure

### 5.1 Isopach Surface-to-Surface Differential Heatmap
- **Overview:** High-precision volume comparison between Pre-Construction Ground Surface vs Post-Excavation As-Built Surface.
- **Capabilities:**
  - Isopach grid surface calculation ($\Delta Z = Z_{\text{asbuilt}} - Z_{\text{original}}$).
  - Color-coded Cut/Fill depth heatmap (e.g. Red for excavation depth $>2\text{m}$, Blue for fill $>1\text{m}$, Green for grade).
  - Automated generation of interim earthworks claim certificates for contractors.

### 5.2 Road Corridor 3D Template Extrusion & Cross-Section Designer
- **Overview:** Full parametric cross-section templates (carriageway width, crossfall slope %, side ditches, cut/fill batter slopes).
- **Capabilities:**
  - Extrudes road horizontal & vertical alignment with standard cross-section templates.
  - Generates cross-section sheets showing design formation level vs existing ground level.

### 5.3 Stormwater Drainage & Gravity Sewer Longitudinal Profile
- **Overview:** Design and reduction of gravity pipe networks.
- **Capabilities:**
  - Manhole stationing, pipe diameter, invert levels ($IL$), soffit levels, cover levels ($CL$), and flow gradient calculation ($1:S$).
  - Longitudinal profile drawing with pipe drop connections and hydraulic grade lines.

---

## 6. Desktop Packaging, Cloud Sync & Offline-First

### 6.1 Native Desktop Packaging (Tauri / Electron)
- **Overview:** Package NSurvey PRO into a lightweight, standalone native desktop executable (`.exe` for Windows, `.dmg` for macOS, `.AppImage` for Linux).
- **Capabilities:**
  - Direct local file system access (open/save native `.nsurv` project files anywhere on disk).
  - Automatic updates and hardware acceleration with zero external dependencies.
  - 100% offline functionality for remote field camps with no internet connection.

### 6.2 SQLite / IndexedDB Local Project Database
- **Overview:** Enterprise-grade local data persistence.
- **Capabilities:**
  - Support projects with millions of survey observations and multiple years of survey history.
  - Project revision history with visual branching and point restoration.

### 6.3 Field Data Sync with Mobile GNSS Companion App
- **Overview:** Mobile companion app for Android/iOS total station and RTK data collectors.
- **Capabilities:**
  - Real-time Bluetooth / WiFi transfer of staked coordinates and logged field points between mobile field controller and NSurvey PRO desktop workstation.

---

## Summary Matrix of Modules

| Domain | Feature Area | Key Benefit | Complexity |
| :--- | :--- | :--- | :--- |
| **3D CAD** | 3D WebGL Orbit Viewport | Visual 3D terrain & elevation relief inspection | Medium |
| **Cadastral** | Encroachment & Overlap QC | Automated boundary dispute detection | Low |
| **Cadastral** | Automated Multi-Plot Subdivider | Rapid master estate layout partitioning | Medium |
| **GNSS / Geodesy** | 3D Network Least Squares | Rigorous multi-loop traverse balancing with error ellipses | High |
| **GIS / Remote Sensing** | Satellite Tile & GeoTIFF Drape | Vector survey overlay on live satellite & drone imagery | Medium |
| **Civil Infrastructure** | Isopach Differential Cut/Fill | Commercial earthworks contractor volume certification | Medium |
| **Platform** | Tauri Native Desktop Package | Standalone offline Windows `.exe` application | Medium |
