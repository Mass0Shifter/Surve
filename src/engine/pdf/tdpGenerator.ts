import jsPDF from 'jspdf';
import { CoordinatePoint, Parcel, ProjectMetadata } from '../types';
import { computeParcel, computeExtents } from '../cogo';
import { getDatumBeltName } from '../datums';
import { determineCadastralSheets } from '../cadastral/sheetIndex';

export interface TdpRenderOptions {
  pageSize: 'a4' | 'a3' | 'legal';
  orientation: 'portrait' | 'landscape';
  planType: 'single_plot' | 'selected_plots' | 'layout';
  scaleRatio?: number; // e.g. 500, 1000, 2000 (if undefined, auto-fits)
  selectedParcelId?: string;
  selectedParcelIds?: string[];
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

  // Relevant parcels to render
  let targetParcels: Parcel[] = [];
  if (isSinglePlot && selectedParcel) {
    targetParcels = [selectedParcel];
  } else if (options.planType === 'selected_plots' && options.selectedParcelIds && options.selectedParcelIds.length > 0) {
    const idSet = new Set(options.selectedParcelIds);
    targetParcels = parcels.filter(p => idSet.has(p.id));
    if (targetParcels.length === 0 && selectedParcel) targetParcels = [selectedParcel];
  } else {
    targetParcels = parcels;
  }

  let targetPoints: CoordinatePoint[] = [];
  if (options.planType !== 'layout' && targetParcels.length > 0) {
    const pointMap = new Map(points.map(p => [p.id, p]));
    const ptIdSet = new Set<string>();
    targetParcels.forEach(p => p.pointIds.forEach(id => ptIdSet.add(id)));
    targetPoints = Array.from(ptIdSet).map(pid => pointMap.get(pid)).filter(Boolean) as CoordinatePoint[];
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

  const maxTitleW = outerW - 60;
  const planSub = isSinglePlot && selectedParcel
    ? `PLAN SHOWING ${selectedParcel.plotNumber} ${selectedParcel.ownerName ? `(ALLOTTEE: ${selectedParcel.ownerName.toUpperCase()})` : ''}`
    : `SURVEY PLAN OF ${project.title.toUpperCase()}`;

  doc.setFontSize(8.5);
  doc.text(planSub, pageWidth / 2, headerY + 9, { align: 'center', maxWidth: maxTitleW });

  doc.setFontSize(7.5);
  const locText = `SITUATED AT: ${project.location.toUpperCase()} | DATUM: MINNA (${getDatumBeltName(project.gridBelt).toUpperCase()})`;
  doc.text(locText, pageWidth / 2, headerY + 13.5, { align: 'center', maxWidth: maxTitleW });

  // Divider Line
  doc.setLineWidth(0.3);
  doc.setDrawColor(203, 213, 225);
  doc.line(outerX + 3, headerY + 16, outerX + outerW - 3, headerY + 16);

  // 4. Drawing Area Dimensions & Scale Ratio Determination
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
  const autoFitRatio = Math.round(1000 / (autoScale > 0 ? autoScale : 1));
  const effectiveScale = (options.scaleRatio && options.scaleRatio > 0) ? options.scaleRatio : autoFitRatio;
  const mapScale = (1000 / effectiveScale);

  const centX = drawAreaX + drawAreaW / 2;
  const centY = drawAreaY + drawAreaH / 2;

  const toMapX = (easting: number) => centX + (easting - centE) * mapScale;
  const toMapY = (northing: number) => centY - (northing - centN) * mapScale;

  // 5. Cadastral Sheet Index Determination
  const centPoint = targetPoints[0] || points[0] || { easting: 294312, northing: 992100 };
  const sheetIndices = determineCadastralSheets(centPoint.easting, centPoint.northing);
  const primarySheet = sheetIndices.find(s => s.scale === effectiveScale) || sheetIndices[0];

  // Draw Sheet Info in Top Right
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(`SHEET NO: ${primarySheet.sheetNumber}`, outerX + outerW - 6, headerY + 4, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`SCALE 1:${effectiveScale}`, outerX + outerW - 6, headerY + 8, { align: 'right' });
  doc.text(`JOB NO: ${project.code}`, outerX + outerW - 6, headerY + 12, { align: 'right' });

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
        }
      }
    }
  }

  // 7. Draw Parcels (Shaded Polygons, Boundaries, Centroid & Line Dimensions)
  const renderedEdges = new Set<string>();

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
    const pCentX = mapVerts.reduce((s, v) => s + v.x, 0) / mapVerts.length;
    const pCentY = mapVerts.reduce((s, v) => s + v.y, 0) / mapVerts.length;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isSinglePlot ? 10 : 8);
    doc.setTextColor(15, 23, 42);
    doc.text(parcel.plotNumber, pCentX, pCentY - (isSinglePlot ? 3 : 1.2), { align: 'center' });

    if (parcel.ownerName && isSinglePlot) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(parcel.ownerName, pCentX, pCentY + 1.5, { align: 'center' });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isSinglePlot ? 7.5 : 6);
    doc.setTextColor(16, 185, 129);
    doc.text(`${comp.areaSquareMeters.toFixed(2)} m² (${comp.areaHectares.toFixed(4)} Ha)`, pCentX, pCentY + (isSinglePlot ? 6 : 2.2), { align: 'center' });

    // Leg Bearings & Distances (Deduplicated per Unique Boundary Edge)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(30, 41, 59);

    for (const leg of comp.legs) {
      const edgeKey = [leg.fromPoint.id, leg.toPoint.id].sort().join('__');
      if (renderedEdges.has(edgeKey)) continue;
      renderedEdges.add(edgeKey);

      const p1 = { x: toMapX(leg.fromPoint.easting), y: toMapY(leg.fromPoint.northing) };
      const p2 = { x: toMapX(leg.toPoint.easting), y: toMapY(leg.toPoint.northing) };

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 0.5) continue;

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      let angleRad = Math.atan2(dy, dx);
      if (angleRad > Math.PI / 2) angleRad -= Math.PI;
      if (angleRad <= -Math.PI / 2) angleRad += Math.PI;

      // Unit tangent vector in direction of reading
      const ux = Math.cos(angleRad);
      const uy = Math.sin(angleRad);

      // Perpendicular normal vector
      let nx = -uy;
      let ny = ux;

      // Ensure normal points outward from polygon centroid
      const toCentX = midX - pCentX;
      const toCentY = midY - pCentY;
      if (nx * toCentX + ny * toCentY < 0) {
        nx = -nx;
        ny = -ny;
      }

      const legText = `${leg.bearing.formatted} (${leg.distance.toFixed(2)}m)`;
      const textWidth = doc.getTextWidth(legText);
      // Cap-height compensation (1.4mm font height + 0.9mm line clearance)
      const offDist = 2.3;

      // Analytically compute start point along line tangent and outward normal
      const startX = midX - ux * (textWidth / 2) + nx * offDist;
      const startY = midY - uy * (textWidth / 2) + ny * offDist;
      const angleDeg = angleRad * (180 / Math.PI);

      doc.text(legText, startX, startY, { angle: -angleDeg });
    }
  }

  // Helper to compute outward exterior normal offset for beacon labels
  const computeBeaconLabelPos = (pt: CoordinatePoint, sx: number, sy: number) => {
    for (const parcel of targetParcels) {
      const idx = parcel.pointIds.indexOf(pt.id);
      if (idx !== -1 && parcel.pointIds.length >= 3) {
        const comp = computeParcel(parcel, points);
        if (comp && comp.vertices.length >= 3) {
          const vCentX = comp.vertices.reduce((s, v) => s + toMapX(v.easting), 0) / comp.vertices.length;
          const vCentY = comp.vertices.reduce((s, v) => s + toMapY(v.northing), 0) / comp.vertices.length;

          const n = parcel.pointIds.length;
          const prevId = parcel.pointIds[(idx - 1 + n) % n];
          const nextId = parcel.pointIds[(idx + 1) % n];
          const prevPt = points.find(p => p.id === prevId);
          const nextPt = points.find(p => p.id === nextId);

          if (prevPt && nextPt) {
            const px = toMapX(prevPt.easting);
            const py = toMapY(prevPt.northing);
            const nx = toMapX(nextPt.easting);
            const ny = toMapY(nextPt.northing);

            const v1x = sx - px;
            const v1y = sy - py;
            const v2x = nx - sx;
            const v2y = ny - sy;
            const l1 = Math.hypot(v1x, v1y) || 1;
            const l2 = Math.hypot(v2x, v2y) || 1;

            const u1x = v1x / l1;
            const u1y = v1y / l1;
            const u2x = v2x / l2;
            const u2y = v2y / l2;

            let bx = -(u1y + u2y);
            let by = (u1x + u2x);
            let bl = Math.hypot(bx, by);

            if (bl < 0.01) {
              bx = sx - vCentX;
              by = sy - vCentY;
              bl = Math.hypot(bx, by) || 1;
            }

            bx /= bl;
            by /= bl;

            const toCentX = sx - vCentX;
            const toCentY = sy - vCentY;
            if (bx * toCentX + by * toCentY < 0) {
              bx = -bx;
              by = -by;
            }

            const dist = 3.2;
            return {
              x: sx + bx * dist + (bx < -0.3 ? -1.0 : bx > 0.3 ? 1.0 : 0),
              y: sy + by * dist + (by < -0.2 ? -1.0 : by > 0.2 ? 2.5 : 0.8),
              align: bx < -0.3 ? 'right' : bx > 0.3 ? 'left' : 'center'
            };
          }
        }
      }
    }
    return { x: sx + 2.5, y: sy - 1.2, align: 'left' };
  };

  // 8. Draw Concrete Beacon Symbols (only relevant points)
  for (const pt of targetPoints) {
    const sx = toMapX(pt.easting);
    const sy = toMapY(pt.northing);

    if (pt.isControl) {
      doc.setDrawColor(245, 158, 11);
      doc.setLineWidth(0.4);
      doc.triangle(sx, sy - 2.2, sx + 2.2, sy + 1.6, sx - 2.2, sy + 1.6);
    } else {
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.3);
      doc.circle(sx, sy, 1.4);
      doc.line(sx - 1.4, sy, sx + 1.4, sy);
      doc.line(sx, sy - 1.4, sx, sy + 1.4);
    }

    // Beacon ID Label (Placed on Exterior Angle Bisector)
    const lbl = computeBeaconLabelPos(pt, sx, sy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.0);
    doc.setTextColor(15, 23, 42);
    doc.text(pt.id, lbl.x, lbl.y, { align: lbl.align as any });
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

  // 10. Metric Bar Scale (Dynamically Scaled for Generous Spacing)
  const sbX = drawAreaX + 6;
  const sbY = drawAreaY + drawAreaH - 8;

  const targetBarMm = 35;
  const rawMeters = targetBarMm / mapScale;
  const niceIntervals = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const scaleBarMeters = niceIntervals.find(n => n >= rawMeters * 0.75) || 50;
  const scaleBarMm = Math.min(drawAreaW * 0.35, scaleBarMeters * mapScale);

  if (scaleBarMm > 15) {
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.rect(sbX, sbY, scaleBarMm, 1.8, 'S');
    doc.rect(sbX, sbY, scaleBarMm / 2, 1.8, 'F');

    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text('0', sbX, sbY - 1.5);
    doc.text(`${scaleBarMeters / 2}m`, sbX + scaleBarMm / 2, sbY - 1.5, { align: 'center' });
    doc.text(`${scaleBarMeters} METRES`, sbX + scaleBarMm, sbY - 1.5, { align: 'right' });
    doc.text(`SCALE 1:${effectiveScale}`, sbX + scaleBarMm / 2, sbY + 4.5, { align: 'center' });
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
    const sealBoxW = 22;
    const sealBoxH = 18;
    const sealImgX = sealX + sealW - sealBoxW - 1;
    const sealImgY = sealY + 4;

    if (sealStampUrl) {
      try {
        doc.addImage(sealStampUrl, 'PNG', sealImgX, sealImgY, sealBoxW, sealBoxH, undefined, 'FAST');
      } catch (e) {
        console.warn('Failed to embed seal stamp image in PDF', e);
        doc.setDrawColor(203, 213, 225);
        doc.rect(sealImgX, sealImgY, sealBoxW, sealBoxH);
        doc.setFontSize(5);
        doc.setTextColor(148, 163, 184);
        doc.text('SURCON\nSEAL', sealImgX + sealBoxW / 2, sealImgY + sealBoxH / 2, { align: 'center' });
      }
    } else {
      doc.setDrawColor(203, 213, 225);
      doc.rect(sealImgX, sealImgY, sealBoxW, sealBoxH);
      doc.setFontSize(5);
      doc.setTextColor(148, 163, 184);
      doc.text('SURCON\nOFFICIAL SEAL', sealImgX + sealBoxW / 2, sealImgY + sealBoxH / 2, { align: 'center' });
    }
  }

  return doc;
}
