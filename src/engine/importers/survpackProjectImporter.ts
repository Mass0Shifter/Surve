/**
 * SurvPack 3.0 Legacy Full-Project Importer & Migration Engine
 * Parses legacy SurvPack 3.0 directory trees (Pdetails.TXT, REGISTER.TXT, COORDS/, PLOTS/, PLOTPB/)
 * and migrates them into complete NSurvey PRO project bundles.
 */

import { CoordinatePoint, Parcel, ProjectMetadata, NigerianGridBelt } from '../types';

export interface MigratedSurvPackProject {
  code: string;
  metadata: ProjectMetadata;
  points: CoordinatePoint[];
  parcels: Parcel[];
  rawFilesCount: number;
  warnings: string[];
}

export interface SurvPackParseResult {
  projects: MigratedSurvPackProject[];
  totalFilesParsed: number;
  unmatchedFiles: string[];
}

/**
 * Automatically infers Nigerian Minna UTM Belt from coordinate magnitudes
 */
function inferNigerianGridBelt(easting: number): NigerianGridBelt {
  // Typical Easting ranges for Minna UTM Belts in Nigeria:
  // West Belt (Central Meridian 4.5°E): False Easting ~ 200,000 - 450,000m
  // Mid Belt (Central Meridian 8.5°E): False Easting ~ 500,000 - 800,000m or local origin
  // East Belt (Central Meridian 12.5°E): False Easting ~ 850,000 - 1,100,000m
  if (easting < 400000) return NigerianGridBelt.WEST_BELT;
  if (easting > 800000) return NigerianGridBelt.EAST_BELT;
  return NigerianGridBelt.MID_BELT;
}

/**
 * Parses raw text content from uploaded SurvPack 3.0 files
 */
export async function parseSurvPackFiles(files: File[]): Promise<SurvPackParseResult> {
  const fileContents = new Map<string, string>();

  for (const file of files) {
    try {
      const text = await file.text();
      const relativePath = (file as any).webkitRelativePath || file.name;
      const normalizedPath = relativePath.replace(/\\/g, '/').toUpperCase();
      fileContents.set(normalizedPath, text);
    } catch (e) {
      console.warn(`Could not read text for file: ${file.name}`, e);
    }
  }

  // Intermediate registry data
  const metaMap = new Map<string, Partial<ProjectMetadata>>();
  const coordsMap = new Map<string, CoordinatePoint[]>();
  const plotsMap = new Map<string, string[]>(); // ProjectCode -> Plot Names
  const plotPbMap = new Map<string, Map<string, string[]>>(); // ProjectCode -> (PlotName -> BeaconIDs)
  const matchedProjectCodes = new Set<string>();
  const unmatchedFiles: string[] = [];

  // 1. Parse Pdetails.TXT (e.g. Code, JobTitle, Location, Client, Surveyor, Address, Phone, Date)
  for (const [path, content] of fileContents.entries()) {
    const filename = path.split('/').pop() || '';

    if (filename.includes('PDETAILS.TXT') || filename.includes('PDETAIL.TXT')) {
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          const code = parts[0].toUpperCase();
          matchedProjectCodes.add(code);
          metaMap.set(code, {
            code,
            title: parts[1] || `SurvPack Project ${code}`,
            location: parts[2] || 'Federal Republic of Nigeria',
            clientName: parts[3] || 'Cadastral Client',
            surveyFirm: parts[4] || 'Surv. Consultant & Associates',
            surveyorName: parts[4] || 'Registered Surveyor',
            surveyorNumber: 'SURCON Reg.',
            address: parts[5] || 'Nigeria',
            phone: parts[6] || '',
            date: parts[7] || new Date().toISOString().split('T')[0],
            scale: 1000
          });
        }
      }
    }

    // 2. Parse REGISTER.TXT or JOBREG.DAT
    if (filename.includes('REGISTER.TXT') || filename.includes('JOBREG.DAT')) {
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const codeMatch = line.match(/Project\s*Code\s*=\s*([^\s]+)/i);
        const townMatch = line.match(/Town\s*Name\s*=\s*(.*?)(?=\s*Consultant|\s*Date|$)/i);
        const consultMatch = line.match(/Consultant\s*=\s*(.*?)(?=\s*Date|$)/i);
        const dateMatch = line.match(/Date\s*=\s*(.*?)$/i);

        if (codeMatch && codeMatch[1]) {
          const code = codeMatch[1].trim().toUpperCase();
          matchedProjectCodes.add(code);
          const existing = metaMap.get(code) || {};
          metaMap.set(code, {
            ...existing,
            code,
            title: existing.title || `Cadastral Job ${code}`,
            location: townMatch ? townMatch[1].trim() : (existing.location || 'Federal Republic of Nigeria'),
            surveyFirm: consultMatch ? consultMatch[1].trim() : (existing.surveyFirm || 'Surv. Consultant & Associates'),
            surveyorName: consultMatch ? consultMatch[1].trim() : (existing.surveyorName || 'Registered Surveyor'),
            date: dateMatch ? dateMatch[1].trim() : (existing.date || new Date().toISOString().split('T')[0])
          });
        }
      }
    }
  }

  // 3. Parse COORDS/*.TXT files
  for (const [path, content] of fileContents.entries()) {
    const filename = path.split('/').pop() || '';
    if (path.includes('COORDS/') || (filename.endsWith('.TXT') && !path.includes('PLOTS') && !path.includes('PLOTPB') && !filename.includes('REGISTER') && !filename.includes('PDETAILS') && !filename.includes('PCODES'))) {
      const cleanCode = filename.replace(/\.TXT$/i, '').split(/[\s\-_+]/)[0].trim().toUpperCase();
      if (!cleanCode) continue;
      const points: CoordinatePoint[] = [];
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      for (const line of lines) {
        const parts = line.split(/[,\t]+/).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 3) {
          const id = parts[0];
          const val1 = parseFloat(parts[1]);
          const val2 = parseFloat(parts[2]);

          if (!isNaN(val1) && !isNaN(val2)) {
            let northing = val1;
            let easting = val2;

            if (val2 > val1 && val2 > 500000 && val1 < 500000) {
              northing = val2;
              easting = val1;
            }

            const elevation = parts[3] && !isNaN(parseFloat(parts[3])) ? parseFloat(parts[3]) : undefined;
            const code = parts[4] || (parts[3] && isNaN(parseFloat(parts[3])) ? parts[3] : 'PB');

            points.push({
              id,
              easting: Number(easting.toFixed(3)),
              northing: Number(northing.toFixed(3)),
              elevation: elevation !== undefined ? Number(elevation.toFixed(3)) : undefined,
              code: code || 'PB',
              description: `Imported from SurvPack 3.0 (${cleanCode})`
            });
          }
        }
      }

      if (points.length > 0) {
        matchedProjectCodes.add(cleanCode);
        const existingPts = coordsMap.get(cleanCode) || [];
        const existingIds = new Set(existingPts.map(p => p.id.toUpperCase()));
        for (const pt of points) {
          if (!existingIds.has(pt.id.toUpperCase())) {
            existingPts.push(pt);
            existingIds.add(pt.id.toUpperCase());
          }
        }
        coordsMap.set(cleanCode, existingPts);
      }
    }
  }

  // 4. Parse PLOTS/*.TXT files (Plot Names)
  for (const [path, content] of fileContents.entries()) {
    const filename = path.split('/').pop() || '';
    if (path.includes('PLOTS/') || (path.includes('PLOT') && !path.includes('PLOTPB'))) {
      const cleanCode = filename.replace(/\.TXT$/i, '').split(/[\s\-_+]/)[0].trim().toUpperCase();
      if (!cleanCode) continue;
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const plotNames = lines.filter(l => l.length > 0);
      if (plotNames.length > 0) {
        matchedProjectCodes.add(cleanCode);
        const existingPlots = plotsMap.get(cleanCode) || [];
        plotsMap.set(cleanCode, Array.from(new Set([...existingPlots, ...plotNames])));
      }
    }
  }

  // 5. Parse PLOTPB/*.TXT files (PlotName, BeaconID)
  for (const [path, content] of fileContents.entries()) {
    const filename = path.split('/').pop() || '';
    if (path.includes('PLOTPB/') || filename.includes('PLOTPB')) {
      const cleanCode = filename.replace(/\.TXT$/i, '').split(/[\s\-_+]/)[0].trim().toUpperCase();
      if (!cleanCode) continue;
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const projectPlots = plotPbMap.get(cleanCode) || new Map<string, string[]>();

      for (const line of lines) {
        const parts = line.split(/[,\t]+/).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          const plotName = parts[0];
          const beaconId = parts[1];
          const bList = projectPlots.get(plotName) || [];
          bList.push(beaconId);
          projectPlots.set(plotName, bList);
        }
      }

      if (projectPlots.size > 0) {
        matchedProjectCodes.add(cleanCode);
        plotPbMap.set(cleanCode, projectPlots);
      }
    }
  }

  // Reconstruct complete NSurvey PRO Projects
  const migratedProjects: MigratedSurvPackProject[] = [];

  for (const code of matchedProjectCodes) {
    if (!code || code.trim() === '') continue;
    const points = coordsMap.get(code) || [];
    const ptLookup = new Map<string, CoordinatePoint>(points.map(p => [p.id.toUpperCase(), p]));
    const plotMapping = plotPbMap.get(code) || new Map<string, string[]>();
    const parcels: Parcel[] = [];
    const warnings: string[] = [];

    // Reconstruct parcels from PLOTPB or group points into a master perimeter
    if (plotMapping.size > 0) {
      let parcelIndex = 1;
      for (const [plotName, beaconIds] of plotMapping.entries()) {
        const validPointIds: string[] = [];

        for (const bid of beaconIds) {
          const found = ptLookup.get(bid.toUpperCase());
          if (found) {
            validPointIds.push(found.id);
          } else {
            warnings.push(`Plot "${plotName}": Beacon "${bid}" not found in coordinate table.`);
          }
        }

        if (validPointIds.length >= 3) {
          parcels.push({
            id: `PRC-${code}-${parcelIndex++}`,
            plotNumber: plotName,
            pointIds: validPointIds,
            color: '#10b981'
          });
        }
      }
    } else if (points.length >= 3) {
      const defaultPts = points.slice(0, Math.min(50, points.length));
      parcels.push({
        id: `PRC-${code}-1`,
        plotNumber: `Plot ${code}`,
        pointIds: defaultPts.map(p => p.id),
        color: '#10b981'
      });
    }

    const avgEasting = points.length > 0 ? points[0].easting : 250000;
    const gridBelt = inferNigerianGridBelt(avgEasting);

    const rawMeta = metaMap.get(code) || {};
    const metadata: ProjectMetadata = {
      title: rawMeta.title || `SurvPack Project ${code}`,
      code: code,
      clientName: rawMeta.clientName || 'Private Cadastral Client',
      surveyFirm: rawMeta.surveyFirm || 'Surv. Consultant & Associates',
      surveyorName: rawMeta.surveyorName || 'Registered Surveyor',
      surveyorNumber: rawMeta.surveyorNumber || 'SURCON Reg.',
      location: rawMeta.location || 'Federal Republic of Nigeria',
      address: rawMeta.address || 'Nigeria',
      phone: rawMeta.phone || '',
      date: rawMeta.date || new Date().toISOString().split('T')[0],
      gridBelt: gridBelt,
      scale: 1000
    };

    if (points.length === 0 && parcels.length === 0) continue;

    migratedProjects.push({
      code,
      metadata,
      points,
      parcels,
      rawFilesCount: (coordsMap.has(code) ? 1 : 0) + (plotMapping.size > 0 ? 1 : 0) + (metaMap.has(code) ? 1 : 0),
      warnings
    });
  }

  // Sort projects: projects with most coordinates and parcels first
  migratedProjects.sort((a, b) => (b.points.length + b.parcels.length * 5) - (a.points.length + a.parcels.length * 5));

  return {
    projects: migratedProjects,
    totalFilesParsed: fileContents.size,
    unmatchedFiles
  };
}
