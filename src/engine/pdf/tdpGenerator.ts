import jsPDF from 'jspdf';
import { CoordinatePoint, Parcel, ProjectMetadata } from '../types';
import { computeParcel, computeExtents } from '../cogo';
import { getDatumBeltName } from '../datums';
import { determineCadastralSheets } from '../cadastral/sheetIndex';

export interface TdpRenderOptions {
  pageSize: 'a4' | 'a3' | 'legal';
  orientation: 'portrait' | 'landscape';
  planType: 'single_plot' | 'layout';
  scaleRatio?: number; // e.g. 500, 1000, 2000 (if undefined, auto-fits)
  selectedParcelId?: string;
  showCoordinateTable: boolean;
  showSealBox: boolean;
  showGridCrosses: boolean;
  showAdjoiningLabels: boolean;
  surveyorSealUrl?: string;
  surveyorSignatureUrl?: string;
  firmSealUrl?: string;
  surconNumber?: string;
  surveyorTitle?: string;
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

  // 1. Determine Selected Parcel and Relevant Datasets
  const selectedParcel = parcels.find(p => p.id === options.selectedParcelId) || parcels[0] || null;
  const isSinglePlot = options.planType === 'single_plot' && selectedParcel !== null;

  // Relevant parcels & points to render
  const targetParcels = isSinglePlot ? [selectedParcel] : parcels;

  let targetPoints: CoordinatePoint[] = [];
  if (isSinglePlot && selectedParcel) {
    const pointMap = new Map(points.map(p => [p.id, p]));
    targetPoints = selectedParcel.pointIds.map(pid => pointMap.get(pid)).filter(Boolean) as CoordinatePoint[];
  } else {
    targetPoints = points;
  }

  // 2. Draw Double Neatline Outer Borders
  doc.setLineWidth(0.8);
  doc.setDrawColor(15, 23, 42);
  doc.rect(outerX, outerY, outerW, outerH);

  doc.setLineWidth(0.3);
  doc.rect(outerX + 1.5, outerY + 1.5, outerW - 3, outerH - 3);

  // 3. Header & Title Block (Top)
  const headerY = outerY + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('TITLE DEED PLAN', pageWidth / 2, headerY + 4, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  const planSub = isSinglePlot && selectedParcel
    ? `PLAN SHOWING ${selectedParcel.plotNumber} ${selectedParcel.ownerName ? `(ALLOTTEE: ${selectedParcel.ownerName.toUpperCase()})` : ''}`
    : `SURVEY PLAN OF ${project.title.toUpperCase()}`;

  doc.text(planSub, pageWidth / 2, headerY + 9, { align: 'center' });

  const locText = `SITUATED AT: ${project.location.toUpperCase()} | DATUM: MINNA (${getDatumBeltName(project.gridBelt).toUpperCase()})`;
  doc.text(locText, pageWidth / 2, headerY + 13.5, { align: 'center' });

  // Divider Line
  doc.setLineWidth(0.3);
  doc.setDrawColor(203, 213, 225);
  doc.line(outerX + 3, headerY + 16, outerX + outerW - 3, headerY + 16);

  // 4. Cadastral Sheet Index Determination
  const centPoint = targetPoints[0] || points[0] || { easting: 294312, northing: 992100 };
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

  // 5. Drawing Area Dimensions & Coordinate Mapping
  const bottomPanelHeight = options.showCoordinateTable || options.showSealBox ? 55 : 30;
  const drawAreaX = outerX + 6;
  const drawAreaY = headerY + 20;
  const drawAreaW = outerW - 12;
  const drawAreaH = outerH - (drawAreaY - outerY) - bottomPanelHeight;

  // Extents calculated based on target points (focused purely on parcel in single plot mode)
  const extents = computeExtents(targetPoints.length > 0 ? targetPoints : points);
  const centE = extents.centerX;
  const centN = extents.centerY;

  const autoScale = Math.min((drawAreaW - 20) / Math.max(10, extents.width), (drawAreaH - 20) / Math.max(10, extents.height));
  const effectiveScale = (options.scaleRatio && options.scaleRatio > 0) ? options.scaleRatio : (project.scale || 1000);
  const mapScale = (options.scaleRatio && options.scaleRatio > 0) ? (1000 / options.scaleRatio) : autoScale;

  const centX = drawAreaX + drawAreaW / 2;
  const centY = drawAreaY + drawAreaH / 2;

  const toMapX = (easting: number) => centX + (easting - centE) * mapScale;
  const toMapY = (northing: number) => centY - (northing - centN) * mapScale;

  // 6. Draw Coordinate Grid Crosses
  if (options.showGridCrosses) {
    const gridStep = effectiveScale <= 250 ? 10 : effectiveScale <= 500 ? 25 : effectiveScale <= 1000 ? 50 : 100;
    const minE = centE - (drawAreaW / (2 * mapScale));
    const maxE = centE + (drawAreaW / (2 * mapScale));
    const minN = centN - (drawAreaH / (2 * mapScale));
    const maxN = centN + (drawAreaH / (2 * mapScale));

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

  // 7. Draw Parcels
  for (const parcel of targetParcels) {
    const comp = computeParcel(parcel, points);
    if (!comp || comp.vertices.length < 3) continue;

    // Boundary Polyline
    doc.setDrawColor(16, 185, 129); // Emerald
    doc.setLineWidth(0.6);

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
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(parcel.plotNumber, centX, centY - 2, { align: 'center' });

    if (parcel.ownerName) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(parcel.ownerName, centX, centY + 2, { align: 'center' });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(16, 185, 129);
    doc.text(`AREA: ${comp.areaSquareMeters.toFixed(2)} Sq.m (${comp.areaHectares.toFixed(4)} Ha)`, centX, centY + 6.5, { align: 'center' });

    // Leg Bearings & Distances
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);

    for (const leg of comp.legs) {
      const p1 = { x: toMapX(leg.fromPoint.easting), y: toMapY(leg.fromPoint.northing) };
      const p2 = { x: toMapX(leg.toPoint.easting), y: toMapY(leg.toPoint.northing) };

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const offX = -Math.sin(angle) * 3.5;
      const offY = Math.cos(angle) * 3.5;

      const legText = `${leg.bearing.formatted} (${leg.distance.toFixed(2)}m)`;
      doc.text(legText, midX + offX, midY + offY, { align: 'center' });
    }
  }

  // 8. Draw Concrete Beacon Symbols (only relevant points)
  for (const pt of targetPoints) {
    const sx = toMapX(pt.easting);
    const sy = toMapY(pt.northing);

    if (pt.isControl) {
      doc.setDrawColor(245, 158, 11);
      doc.setLineWidth(0.4);
      doc.triangle(sx, sy - 2.5, sx + 2.5, sy + 1.8, sx - 2.5, sy + 1.8);
    } else {
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.3);
      doc.circle(sx, sy, 1.5);
      doc.line(sx - 1.5, sy, sx + 1.5, sy);
      doc.line(sx, sy - 1.5, sx, sy + 1.5);
    }

    // Beacon ID Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(pt.id, sx + 3, sy - 1.5);
  }

  // 9. Vector North Arrow
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

  // 10. Metric Bar Scale
  const sbX = drawAreaX + 6;
  const sbY = drawAreaY + drawAreaH - 8;
  const scaleBarMeters = isSinglePlot ? 20 : (project.scale && project.scale <= 500 ? 20 : 50);
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

  // 11. Bottom Footer: Coordinate Schedule Table & Surveyor Seal Box
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
    doc.text('EASTING (m)', tableX + 25, tableY + 6.2);
    doc.text('NORTHING (m)', tableX + 50, tableY + 6.2);
    doc.text('ORIGIN', tableX + 75, tableY + 6.2);

    // Table Rows (only beacons for this plot in single plot mode!)
    const schedulePoints = isSinglePlot ? targetPoints : points.slice(0, 8);
    let rowY = tableY + 10.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(15, 23, 42);

    for (const pt of schedulePoints) {
      doc.text(pt.id, tableX + 2, rowY);
      doc.text(pt.easting.toFixed(3), tableX + 25, rowY);
      doc.text(pt.northing.toFixed(3), tableX + 50, rowY);
      doc.text(pt.isControl ? 'CONTROL PILLAR' : 'CONCRETE PILLAR', tableX + 75, rowY);
      rowY += 4.0;
    }
  }

  if (options.showSealBox) {
    const sealX = outerX + outerW * 0.55;
    const sealY = footerY + 2;
    const sealW = outerW * 0.43;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text("SURVEYOR'S CERTIFICATION", sealX, sealY + 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(71, 85, 105);
    const certText = `I hereby certify that this plan was surveyed by me or under my direct supervision on the ground in accordance with Survey Regulations.`;
    doc.text(certText, sealX, sealY + 5.5, { maxWidth: sealW - 22 });

    const survTitle = options.surveyorTitle ? `${options.surveyorTitle} ` : '';
    const survName = `${survTitle}${project.surveyorName}`.toUpperCase();
    const surconNum = options.surconNumber || project.surveyorNumber || 'SURCON REG.';

    // Embed Signature Image if uploaded
    if (options.surveyorSignatureUrl) {
      try {
        doc.addImage(options.surveyorSignatureUrl, 'PNG', sealX, sealY + 8.5, 24, 7);
      } catch (e) {
        console.warn('Failed to embed signature image in PDF', e);
      }
    }

    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(survName, sealX, sealY + 16.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.2);
    doc.setTextColor(51, 65, 85);
    doc.text(surconNum, sealX, sealY + 19);
    doc.text(`FIRM: ${project.surveyFirm.toUpperCase()}`, sealX, sealY + 21.5);
    doc.text(`DATE: ${project.date}`, sealX, sealY + 24);

    // Embed Official Seal Stamp Image (Surveyor Seal or Firm Seal)
    const sealStampUrl = options.surveyorSealUrl || options.firmSealUrl;
    if (sealStampUrl) {
      try {
        doc.addImage(sealStampUrl, 'PNG', sealX + sealW - 21, sealY + 4, 20, 20);
      } catch (e) {
        console.warn('Failed to embed seal stamp image in PDF', e);
        doc.setDrawColor(203, 213, 225);
        doc.rect(sealX + sealW - 21, sealY + 4, 20, 20);
        doc.setFontSize(5);
        doc.setTextColor(148, 163, 184);
        doc.text('SURCON\nSEAL', sealX + sealW - 11, sealY + 13, { align: 'center' });
      }
    } else {
      doc.setDrawColor(203, 213, 225);
      doc.rect(sealX + sealW - 21, sealY + 4, 20, 20);
      doc.setFontSize(5);
      doc.setTextColor(148, 163, 184);
      doc.text('SURCON\nOFFICIAL SEAL', sealX + sealW - 11, sealY + 13, { align: 'center' });
    }
  }

  return doc;
}
