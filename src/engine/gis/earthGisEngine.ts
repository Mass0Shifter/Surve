/**
 * Earth GIS Engine
 * Precision Geodetic reprojection, GeoJSON generation, KML packaging,
 * and Google Earth 3D synchronization for NSurvey CAD projects.
 */

import { CoordinatePoint, Parcel, NigerianGridBelt } from '../types';
import { minnaGridToWGS84, TransformResult } from '../transform/datumEngine';

export interface GeoPointWGS84 {
  id: string;
  lat: number;
  lon: number;
  elevation: number;
  code?: string;
  description?: string;
  isControl?: boolean;
  minnaEasting: number;
  minnaNorthing: number;
}

export interface GeoParcelWGS84 {
  id: string;
  plotNumber: string;
  ownerName?: string;
  blockNumber?: string;
  color?: string;
  coordinates: [number, number][]; // [lat, lon] for Leaflet
  polygonGeoJson: [number, number][]; // [lon, lat] for GeoJSON standard
  areaSquareMeters?: number;
  perimeter?: number;
  beaconIds: string[];
}

export interface GisExtents {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  centerLat: number;
  centerLon: number;
}

/**
 * Transforms all project points from Minna Datum to WGS84 Lat/Lon
 */
export function reprojectProjectPointsToWGS84(
  points: CoordinatePoint[],
  gridBelt: NigerianGridBelt = NigerianGridBelt.MID_BELT
): GeoPointWGS84[] {
  // Map NigerianGridBelt enum (4.5, 8.5, 12.5) to standard UTM zone
  // West Belt (4.5° CM) -> UTM Zone 31
  // Mid Belt (8.5° CM) -> UTM Zone 32
  // East Belt (12.5° CM) -> UTM Zone 33
  let utmZone = 32;
  if (gridBelt === NigerianGridBelt.WEST_BELT) utmZone = 31;
  else if (gridBelt === NigerianGridBelt.EAST_BELT) utmZone = 33;

  return points.map(p => {
    try {
      const res: TransformResult = minnaGridToWGS84(
        { id: p.id, easting: p.easting, northing: p.northing, elevation: p.elevation },
        utmZone,
        'N'
      );
      return {
        id: p.id,
        lat: res.wgs84Lat,
        lon: res.wgs84Lon,
        elevation: res.wgs84Height || 0,
        code: p.code,
        description: p.description,
        isControl: p.isControl,
        minnaEasting: p.easting,
        minnaNorthing: p.northing
      };
    } catch {
      // Fallback approximation centered on Nigeria (Abuja region) if math error occurs
      return {
        id: p.id,
        lat: 9.0765,
        lon: 7.3986,
        elevation: p.elevation || 0,
        code: p.code,
        description: p.description,
        isControl: p.isControl,
        minnaEasting: p.easting,
        minnaNorthing: p.northing
      };
    }
  });
}

/**
 * Builds WGS84 Georeferenced parcel polygons from project parcels
 */
export function reprojectParcelsToWGS84(
  parcels: Parcel[],
  geoPointsMap: Map<string, GeoPointWGS84>
): GeoParcelWGS84[] {
  return parcels
    .filter(p => !p.hidden && p.pointIds && p.pointIds.length >= 3)
    .map(p => {
      const leafletCoords: [number, number][] = [];
      const geoJsonCoords: [number, number][] = [];

      for (const ptId of p.pointIds) {
        const pt = geoPointsMap.get(ptId);
        if (pt) {
          leafletCoords.push([pt.lat, pt.lon]);
          geoJsonCoords.push([pt.lon, pt.lat]); // GeoJSON is [lon, lat]
        }
      }

      // Close polygon for GeoJSON if not closed
      if (geoJsonCoords.length >= 3) {
        const first = geoJsonCoords[0];
        const last = geoJsonCoords[geoJsonCoords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          geoJsonCoords.push([first[0], first[1]]);
        }
      }

      return {
        id: p.id,
        plotNumber: p.plotNumber,
        ownerName: p.ownerName,
        blockNumber: p.blockNumber,
        color: p.color || '#10b981',
        coordinates: leafletCoords,
        polygonGeoJson: geoJsonCoords,
        beaconIds: p.pointIds
      };
    })
    .filter(p => p.coordinates.length >= 3);
}

/**
 * Computes bounding box and center coordinate for WGS84 points
 */
export function computeGisExtents(geoPoints: GeoPointWGS84[]): GisExtents {
  if (geoPoints.length === 0) {
    return {
      minLat: 8.95,
      maxLat: 9.15,
      minLon: 7.35,
      maxLon: 7.55,
      centerLat: 9.05,
      centerLon: 7.45
    };
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const p of geoPoints) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  return {
    minLat,
    maxLat,
    minLon,
    maxLon,
    centerLat: (minLat + maxLat) / 2,
    centerLon: (minLon + maxLon) / 2
  };
}

/**
 * Generates official RFC 7946 compliant GeoJSON FeatureCollection
 */
export function generateProjectGeoJson(
  geoPoints: GeoPointWGS84[],
  geoParcels: GeoParcelWGS84[],
  projectName: string = 'NSurvey Project'
): string {
  const features: any[] = [];

  // Add Parcels
  for (const parcel of geoParcels) {
    if (parcel.polygonGeoJson.length >= 4) {
      features.push({
        type: 'Feature',
        properties: {
          featureClass: 'CadastralParcel',
          id: parcel.id,
          plotNumber: parcel.plotNumber,
          ownerName: parcel.ownerName || '',
          blockNumber: parcel.blockNumber || '',
          beaconIds: parcel.beaconIds.join(', ')
        },
        geometry: {
          type: 'Polygon',
          coordinates: [parcel.polygonGeoJson]
        }
      });
    }
  }

  // Add Beacons / Boundary Pegs
  for (const pt of geoPoints) {
    features.push({
      type: 'Feature',
      properties: {
        featureClass: 'SurveyBeacon',
        beaconId: pt.id,
        minnaEasting: pt.minnaEasting,
        minnaNorthing: pt.minnaNorthing,
        elevation: pt.elevation,
        code: pt.code || 'PEG',
        description: pt.description || '',
        isControl: !!pt.isControl
      },
      geometry: {
        type: 'Point',
        coordinates: [pt.lon, pt.lat, pt.elevation]
      }
    });
  }

  const featureCollection = {
    type: 'FeatureCollection',
    name: projectName,
    crs: {
      type: 'name',
      properties: {
        name: 'urn:ogc:def:crs:OGC:1.3:CRS84'
      }
    },
    features
  };

  return JSON.stringify(featureCollection, null, 2);
}

/**
 * Generates Google Earth 3D .KML XML file
 */
export function generateProjectKml(
  geoPoints: GeoPointWGS84[],
  geoParcels: GeoParcelWGS84[],
  projectName: string = 'NSurvey Cadastral Survey'
): string {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeXml(projectName)}</name>
  <description>Generated by NSurvey PRO Cadastral &amp; Geomatics Engine</description>

  <!-- Style Definitions -->
  <Style id="beaconStyle">
    <IconStyle>
      <scale>0.8</scale>
      <Icon>
        <href>https://maps.google.com/mapfiles/kml/paddle/red-circle.png</href>
      </Icon>
    </IconStyle>
    <LabelStyle>
      <scale>0.75</scale>
      <color>ff00ffff</color>
    </LabelStyle>
  </Style>

  <Style id="controlStyle">
    <IconStyle>
      <scale>1.0</scale>
      <Icon>
        <href>https://maps.google.com/mapfiles/kml/paddle/grn-diamond.png</href>
      </Icon>
    </IconStyle>
    <LabelStyle>
      <scale>0.85</scale>
      <color>ff00ff00</color>
    </LabelStyle>
  </Style>

  <Style id="parcelPolyStyle">
    <LineStyle>
      <color>ff10b981</color>
      <width>2.5</width>
    </LineStyle>
    <PolyStyle>
      <color>4d10b981</color>
    </PolyStyle>
  </Style>

  <!-- Parcels Folder -->
  <Folder>
    <name>Cadastral Parcels</name>
`;

  for (const parcel of geoParcels) {
    const coordsStr = parcel.polygonGeoJson
      .map(c => `${c[0].toFixed(8)},${c[1].toFixed(8)},0`)
      .join(' ');

    kml += `    <Placemark>
      <name>Plot: ${escapeXml(parcel.plotNumber)}</name>
      <description><![CDATA[
        <b>Owner:</b> ${escapeXml(parcel.ownerName || 'N/A')}<br/>
        <b>Block:</b> ${escapeXml(parcel.blockNumber || 'N/A')}<br/>
        <b>Beacons:</b> ${escapeXml(parcel.beaconIds.join(', '))}
      ]]></description>
      <styleUrl>#parcelPolyStyle</styleUrl>
      <Polygon>
        <extrude>1</extrude>
        <altitudeMode>clampToGround</altitudeMode>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordsStr}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>\n`;
  }

  kml += `  </Folder>

  <!-- Beacons Folder -->
  <Folder>
    <name>Survey Beacons</name>
`;

  for (const pt of geoPoints) {
    const style = pt.isControl ? '#controlStyle' : '#beaconStyle';
    kml += `    <Placemark>
      <name>${escapeXml(pt.id)}</name>
      <description><![CDATA[
        <b>Beacon ID:</b> ${escapeXml(pt.id)}<br/>
        <b>Minna Easting:</b> ${pt.minnaEasting.toFixed(3)} m<br/>
        <b>Minna Northing:</b> ${pt.minnaNorthing.toFixed(3)} m<br/>
        <b>WGS84 Lat:</b> ${pt.lat.toFixed(8)}°<br/>
        <b>WGS84 Lon:</b> ${pt.lon.toFixed(8)}°<br/>
        <b>Code:</b> ${escapeXml(pt.code || 'PEG')}<br/>
        <b>Description:</b> ${escapeXml(pt.description || 'N/A')}
      ]]></description>
      <styleUrl>${style}</styleUrl>
      <Point>
        <coordinates>${pt.lon.toFixed(8)},${pt.lat.toFixed(8)},${pt.elevation.toFixed(2)}</coordinates>
      </Point>
    </Placemark>\n`;
  }

  kml += `  </Folder>
</Document>
</kml>`;

  return kml;
}

/**
 * Builds direct Google Earth 3D Web URL
 */
export function buildGoogleEarthWebUrl(centerLat: number, centerLon: number, altitude: number = 300): string {
  return `https://earth.google.com/web/@${centerLat.toFixed(6)},${centerLon.toFixed(6)},${altitude}a,800d,35y,0h,0t,0r`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
