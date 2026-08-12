import { CoordinatePoint, Parcel } from '../types';
import { computeParcel } from '../cogo';

/**
 * Exports coordinates list to standard CSV format.
 */
export function exportCoordinatesToCSV(points: CoordinatePoint[]): string {
  const rows: string[] = ['Point ID,Easting (m),Northing (m),Elevation (m),Code,Description,Type'];

  for (const p of points) {
    const typeStr = p.isControl ? 'Control Point' : 'Boundary Beacon';
    rows.push(`"${p.id}",${p.easting.toFixed(4)},${p.northing.toFixed(4)},${(p.elevation || 0).toFixed(4)},"${p.code || ''}","${p.description || ''}","${typeStr}"`);
  }

  return rows.join('\r\n');
}

/**
 * Exports cadastral parcel computation boundary schedules to CSV.
 */
export function exportParcelScheduleToCSV(parcels: Parcel[], points: CoordinatePoint[]): string {
  const rows: string[] = [
    'Plot Number,Block,Owner,From Beacon,To Beacon,Bearing (DMS),Distance (m),Delta Easting (m),Delta Northing (m),Parcel Area (sq.m),Parcel Area (Ha)'
  ];

  for (const parcel of parcels) {
    const comp = computeParcel(parcel, points);
    if (!comp) continue;

    for (const leg of comp.legs) {
      rows.push(
        `"${parcel.plotNumber}","${parcel.blockNumber || ''}","${parcel.ownerName || ''}","${leg.fromPoint.id}","${leg.toPoint.id}","${leg.bearing.formatted}",${leg.distance.toFixed(3)},${leg.deltaEasting.toFixed(3)},${leg.deltaNorthing.toFixed(3)},${comp.areaSquareMeters.toFixed(2)},${comp.areaHectares.toFixed(4)}`
      );
    }
  }

  return rows.join('\r\n');
}

/**
 * Triggers a browser download of generated text/csv/dxf/scr data.
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
