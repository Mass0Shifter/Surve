import jsPDF from 'jspdf';
import { CoordinatePoint, Parcel, ProjectMetadata } from '../types';
import { computeParcel, computeExtents } from '../cogo';
import { getDatumBeltName } from '../datums';
import { determineCadastralSheets } from '../cadastral/sheetIndex';

export interface TdpRenderOptions {
  pageSize: 'a4' | 'a3' | 'legal';
  orientation: 'portrait' | 'landscape';
  scaleRatio?: number; // e.g. 500, 1000, 2000 (if undefined, auto-fits)
  selectedParcelId?: string;
  showCoordinateTable: boolean;
  showSealBox: boolean;
  showGridCrosses: boolean;
  showAdjoiningLabels: boolean;
}

/**
 * Generates an official, print-ready Vector PDF Title Deed Plan (TDP)
 * conforming to Nigerian SURCON, FCDA, and State Surveyor General standards.
 */
export function generateTitleDeedPlanPDF(
  project: ProjectMetadata,
  points: CoordinatePoint[],
  parcels: Parcel[],
  options: TdpRenderOptions
): jsPDF {
  const doc = new jsPDF({
    orientation: options.orientation,
    unit: 'mm',
    format: options.pageSize
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const margin = 12; // 12mm page margin
  const outerX = margin;
  const outerY = margin;
  const outerW = pageWidth - margin * 2;
  const outerH = pageHeight - margin * 2;

  // 1. Draw Double Neatline Outer Borders
  doc.setLineWidth(0.8);
  doc.setDrawColor(15, 23, 42);
  doc.rect(outerX, outerY, outerW, outerH);

  doc.setLineWidth(0.3);
  doc.rect(outerX + 1.5, outerY + 1.5, outerW - 3, outerH - 3);

  // 2. Header & Title Block (Top)
  const headerY = outerY + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('TITLE DEED PLAN', pageWidth / 2, headerY + 4, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  const selectedParcel = parcels.find(p => p.id === options.selectedParcelId) || parcels[0] || null;
  const planSub = selectedParcel
    ? `PLAN SHOWING ${selectedParcel.plotNumber} ${selectedParcel.ownerName ? `(ALLOTTEE: ${selectedParcel.ownerName.toUpperCase()})` : ''}`
    : `SURVEY PLAN OF ${project.title.toUpperCase()}`;

  doc.text(planSub, pageWidth / 2, headerY + 9, { align: 'center' });

  const locText = `SITUATED AT: ${project.location.toUpperCase()} | DATUM: MINNA (${getDatumBeltName(project.gridBelt).toUpperCase()})`;
  doc.text(locText, pageWidth / 2, headerY + 13.5, { align: 'center' });

  // Divider Line
  doc.setLineWidth(0.3);
  doc.setDrawColor(203, 213, 225);
  doc.line(outerX + 3, headerY + 16, outerX + outerW - 3, headerY + 16);

  // 3. Cadastral Sheet Index Determination
  const centPoint = points[0] || { easting: 294312, northing: 992100 };
  const sheetIndices = determineCadastralSheets(centPoint.easting, centPoint.northing);
  const primarySheet = sheetIndices.find(s => s.scale === (project.scale || 1000)) || sheetIndices[0];

  // Draw Sheet Info in Top Right
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(`SHEET NO: ${primarySheet.sheetNumber}`, outerX + outerW - 6, headerY + 4, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`SCALE 1:${project.scale || 1000}`, outerX + outerW - 6, headerY + 8, { align: 'right' });
  doc.text(`JOB NO: ${project.code}`, outerX + outerW - 6, headerY + 12, { align: 'right' });

  // 4. Drawing Area Dimensions & Vector Coordinate Mapping
  const bottomPanelHeight = options.showCoordinateTable || options.showSealBox ? 55 : 30;
  const drawAreaX = outerX + 6;
  const drawAreaY = headerY + 20;
  const drawAreaW = outerW - 12;
  const drawAreaH = outerH - (drawAreaY - outerY) - bottomPanelHeight;

  // Extents of surveyed points
  const extents = computeExtents(points);
  const paddingMeters = Math.max(extents.width, extents.height) * 0.25;

  const minE = extents.minX - paddingMeters;
  const maxE = extents.maxX + paddingMeters;
  const minN = extents.minY - paddingMeters;
  const maxN = extents.maxY + paddingMeters;

  const worldW = maxE - minE;
  const worldH = maxN - minN;

  const scaleFactorX = drawAreaW / worldW;
  const scaleFactorY = drawAreaH / worldH;
  const mapScale = Math.min(scaleFactorX, scaleFactorY);

  const mapOffsetX = drawAreaX + (drawAreaW - worldW * mapScale) / 2;
  const mapOffsetY = drawAreaY + (drawAreaH - worldH * mapScale) / 2;

  const toMapX = (easting: number) => mapOffsetX + (easting - minE) * mapScale;
  const toMapY = (northing: number) => mapOffsetY + (maxN - northing) * mapScale;

  // 5. Draw Coordinate Grid Crosses
  if (options.showGridCrosses) {
    const gridStep = project.scale && project.scale <= 1000 ? 50 : 100;
    const gStartE = Math.floor(minE / gridStep) * gridStep;
    const gEndE = Math.ceil(maxE / gridStep) * gridStep;
    const gStartN = Math.floor(minN / gridStep) * gridStep;
    const gEndN = Math.ceil(maxN / gridStep) * gridStep;

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.15);
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);

    for (let e = gStartE; e <= gEndE; e += gridStep) {
      for (let n = gStartN; n <= gEndN; n += gridStep) {
        const mx = toMapX(e);
        const my = toMapY(n);

        if (mx >= drawAreaX && mx <= drawAreaX + drawAreaW && my >= drawAreaY && my <= drawAreaY + drawAreaH) {
          doc.line(mx - 2, my, mx + 2, my);
          doc.line(mx, my - 2, mx, my + 2);
          if (e % (gridStep * 2) === 0 && n % (gridStep * 2) === 0) {
            doc.text(`${e}E`, mx + 2, my - 1);
            doc.text(`${n}N`, mx + 2, my + 3);
          }
        }
      }
    }
  }

  // 6. Draw Cadastral Parcels
  for (const parcel of parcels) {
    const comp = computeParcel(parcel, points);
    if (!comp || comp.vertices.length < 3) continue;

    const isHighlight = parcel.id === (options.selectedParcelId || parcels[0]?.id);

    // Boundary Polyline
    doc.setDrawColor(isHighlight ? 16 : 71, isHighlight ? 185 : 85, isHighlight ? 129 : 105);
    doc.setLineWidth(isHighlight ? 0.6 : 0.4);

    const mapVerts = comp.vertices.map(v => ({ x: toMapX(v.easting), y: toMapY(v.northing) }));

    for (let i = 0; i < mapVerts.length; i++) {
      const p1 = mapVerts[i];
      const p2 = mapVerts[(i + 1) % mapVerts.length];
      doc.line(p1.x, p1.y, p2.x, p2.y);
    }

    // Centroid Label
    const centX = mapVerts.reduce((s, v) => s + v.x, 0) / mapVerts.length;
    const centY = mapVerts.reduce((s, v) => s + v.y, 0) / mapVerts.length;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(parcel.plotNumber, centX, centY - 2, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(16, 185, 129);
    doc.text(`AREA: ${comp.areaSquareMeters.toFixed(2)} Sq.m`, centX, centY + 2, { align: 'center' });
    doc.text(`(${comp.areaHectares.toFixed(4)} Ha)`, centX, centY + 5.5, { align: 'center' });

    // Leg Bearings & Distances
    doc.setFontSize(6.5);
    doc.setTextColor(51, 65, 85);

    for (const leg of comp.legs) {
      const p1 = { x: toMapX(leg.fromPoint.easting), y: toMapY(leg.fromPoint.northing) };
      const p2 = { x: toMapX(leg.toPoint.easting), y: toMapY(leg.toPoint.northing) };

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      // Small offset for text
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const offX = -Math.sin(angle) * 3;
      const offY = Math.cos(angle) * 3;

      const legText = `${leg.bearing.formatted} (${leg.distance.toFixed(2)}m)`;
      doc.text(legText, midX + offX, midY + offY, { align: 'center' });
    }
  }

  // 7. Draw Concrete Beacon Symbols
  for (const pt of points) {
    const sx = toMapX(pt.easting);
    const sy = toMapY(pt.northing);

    if (pt.isControl) {
      // Control Triangle
      doc.setDrawColor(245, 158, 11);
      doc.setLineWidth(0.4);
      doc.triangle(sx, sy - 2, sx + 2, sy + 1.5, sx - 2, sy + 1.5);
    } else {
      // Beacon Pillar Circle with Cross
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.3);
      doc.circle(sx, sy, 1.2);
      doc.line(sx - 1.2, sy, sx + 1.2, sy);
      doc.line(sx, sy - 1.2, sx, sy + 1.2);
    }

    // Beacon ID Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text(pt.id, sx + 2.5, sy - 1.5);
  }

  // 8. Vector North Arrow (Top-Right inside drawing area)
  const naX = drawAreaX + drawAreaW - 14;
  const naY = drawAreaY + 14;

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.line(naX, naY + 10, naX, naY - 10);
  doc.triangle(naX, naY - 10, naX - 2.5, naY - 4, naX, naY - 6, 'FD');
  doc.triangle(naX, naY - 10, naX + 2.5, naY - 4, naX, naY - 6, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('N', naX, naY - 12, { align: 'center' });
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.text('GRID NORTH', naX, naY + 13, { align: 'center' });

  // 9. Metric Bar Scale (Bottom-Left inside drawing area)
  const sbX = drawAreaX + 6;
  const sbY = drawAreaY + drawAreaH - 8;
  const scaleBarMeters = project.scale && project.scale <= 500 ? 20 : 50;
  const scaleBarMm = scaleBarMeters * mapScale;

  if (scaleBarMm > 15 && scaleBarMm < drawAreaW * 0.4) {
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.rect(sbX, sbY, scaleBarMm, 1.8, 'S');
    doc.rect(sbX, sbY, scaleBarMm / 2, 1.8, 'F');

    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text('0', sbX, sbY - 1.5);
    doc.text(`${scaleBarMeters / 2}m`, sbX + scaleBarMm / 2, sbY - 1.5, { align: 'center' });
    doc.text(`${scaleBarMeters} METRES`, sbX + scaleBarMm, sbY - 1.5, { align: 'right' });
    doc.text(`SCALE 1:${project.scale || 1000}`, sbX + scaleBarMm / 2, sbY + 4.5, { align: 'center' });
  }

  // 10. Bottom Footer: Coordinate Schedule Table & Surveyor Seal Box
  const footerY = outerY + outerH - bottomPanelHeight;
  doc.setLineWidth(0.3);
  doc.setDrawColor(203, 213, 225);
  doc.line(outerX + 3, footerY, outerX + outerW - 3, footerY);

  if (options.showCoordinateTable) {
    const tableW = outerW * 0.55;
    const tableX = outerX + 4;
    const tableY = footerY + 3;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('COORDINATE SCHEDULE (MINNA DATUM)', tableX, tableY + 2);

    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.rect(tableX, tableY + 3.5, tableW, 4, 'F');
    doc.setFontSize(6);
    doc.setTextColor(71, 85, 105);
    doc.text('BEACON ID', tableX + 2, tableY + 6.2);
    doc.text('EASTING (m)', tableX + 22, tableY + 6.2);
    doc.text('NORTHING (m)', tableX + 44, tableY + 6.2);
    doc.text('ELEV (m)', tableX + 66, tableY + 6.2);
    doc.text('ORIGIN', tableX + 80, tableY + 6.2);

    // Table Rows
    const displayPoints = points.slice(0, 8);
    let rowY = tableY + 10.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(15, 23, 42);

    for (const pt of displayPoints) {
      doc.text(pt.id, tableX + 2, rowY);
      doc.text(pt.easting.toFixed(3), tableX + 22, rowY);
      doc.text(pt.northing.toFixed(3), tableX + 44, rowY);
      doc.text(pt.elevation !== undefined ? pt.elevation.toFixed(2) : '-', tableX + 66, rowY);
      doc.text(pt.isControl ? 'CONTROL' : 'CONCRETE PILLAR', tableX + 80, rowY);
      rowY += 3.8;
    }
  }

  if (options.showSealBox) {
    const sealX = outerX + outerW * 0.58;
    const sealY = footerY + 3;
    const sealW = outerW * 0.40;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text("SURVEYOR'S CERTIFICATE", sealX, sealY + 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(71, 85, 105);
    const certText = `I hereby certify that this plan was surveyed by me on the ground in accordance with Survey Regulations.`;
    doc.text(certText, sealX, sealY + 5.5, { maxWidth: sealW - 4 });

    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`SURVEYOR: ${project.surveyorName.toUpperCase()}`, sealX, sealY + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(`FIRM: ${project.surveyFirm.toUpperCase()}`, sealX, sealY + 15);
    doc.text(`DATE: ${project.date}`, sealX, sealY + 18);

    // Seal Box
    doc.setDrawColor(203, 213, 225);
    doc.rect(sealX + sealW - 24, sealY + 8, 22, 20);
    doc.setFontSize(5.5);
    doc.setTextColor(148, 163, 184);
    doc.text('SURCON\nOFFICIAL SEAL', sealX + sealW - 13, sealY + 17, { align: 'center' });
  }

  return doc;
}
