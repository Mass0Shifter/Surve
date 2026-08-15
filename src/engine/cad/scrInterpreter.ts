/**
 * AutoCAD Script (.SCR) Runner & Virtual Machine
 * 
 * Tokenizes, parses, and executes standard AutoCAD Script (.SCR) files,
 * including SurvPack 3.0 scripts and modern AutoCAD command streams.
 */

import { CadEntity, CadPointEntity, CadLineEntity, CadPolylineEntity, CadCircleEntity, CadTextEntity } from './cadCoreEngine';

export interface ScrExecutionLog {
  lineNumber: number;
  rawText: string;
  command: string;
  status: 'SUCCESS' | 'WARNING' | 'SKIPPED';
  message: string;
}

export interface ScrExecutionResult {
  entities: CadEntity[];
  layersCreated: string[];
  logs: ScrExecutionLog[];
  totalCommandsExecuted: number;
}

/**
 * Parses coordinate tokens in formats: "123.45,678.90", "123.45, 678.90", or ["123.45", "678.90"]
 */
function parseCoordinatePair(token1: string, token2?: string): { x: number; y: number } | null {
  if (token1.includes(',')) {
    const parts = token1.split(',');
    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    if (!isNaN(x) && !isNaN(y)) return { x, y };
  } else if (token2 !== undefined) {
    const x = parseFloat(token1);
    const y = parseFloat(token2);
    if (!isNaN(x) && !isNaN(y)) return { x, y };
  }
  return null;
}

export class AutoCADScriptInterpreter {
  private entities: CadEntity[] = [];
  private currentLayer: string = '0';
  private currentColor: string = '#38bdf8';
  private layersCreatedSet = new Set<string>(['0']);
  private logs: ScrExecutionLog[] = [];

  // AutoCAD 256 Color Index map sample
  private acadColorMap: Record<string, string> = {
    '1': '#ef4444', // Red
    '2': '#eab308', // Yellow
    '3': '#10b981', // Green
    '4': '#06b6d4', // Cyan
    '5': '#3b82f6', // Blue
    '6': '#d946ef', // Magenta
    '7': '#f8fafc', // White
    '8': '#64748b', // Dark Gray
    '9': '#94a3b8'  // Light Gray
  };

  public execute(scriptText: string): ScrExecutionResult {
    this.entities = [];
    this.logs = [];
    this.currentLayer = '0';
    this.currentColor = '#38bdf8';
    this.layersCreatedSet.clear();
    this.layersCreatedSet.add('0');

    const rawLines = scriptText.split(/\r?\n/);

    for (let i = 0; i < rawLines.length; i++) {
      const lineNum = i + 1;
      const rawLine = rawLines[i].trim();

      // Comments & Empty Lines
      if (!rawLine || rawLine.startsWith(';')) {
        this.logs.push({
          lineNumber: lineNum,
          rawText: rawLine,
          command: 'COMMENT',
          status: 'SKIPPED',
          message: 'Comment or empty line'
        });
        continue;
      }

      const tokens = rawLine.split(/\s+/);
      const mainCmd = tokens[0].toUpperCase();

      try {
        switch (mainCmd) {
          case 'LAYER':
            this.handleLayerCommand(tokens.slice(1), lineNum, rawLine);
            break;

          case 'POINT':
            this.handlePointCommand(tokens.slice(1), lineNum, rawLine);
            break;

          case 'LINE':
            this.handleLineCommand(tokens.slice(1), lineNum, rawLine);
            break;

          case 'PLINE':
            this.handlePlineCommand(tokens.slice(1), lineNum, rawLine);
            break;

          case 'CIRCLE':
            this.handleCircleCommand(tokens.slice(1), lineNum, rawLine);
            break;

          case 'TEXT':
          case '-TEXT':
            this.handleTextCommand(tokens.slice(1), lineNum, rawLine);
            break;

          case 'COLOR':
            if (tokens[1]) {
              this.currentColor = this.acadColorMap[tokens[1]] || '#38bdf8';
              this.logs.push({
                lineNumber: lineNum,
                rawText: rawLine,
                command: 'COLOR',
                status: 'SUCCESS',
                message: `Set active color to ${this.currentColor}`
              });
            }
            break;

          case 'UNITS':
          case 'LIMITS':
          case 'STYLE':
          case 'SETVAR':
          case 'ZOOM':
            this.logs.push({
              lineNumber: lineNum,
              rawText: rawLine,
              command: mainCmd,
              status: 'SUCCESS',
              message: `AutoCAD environment parameter applied (${mainCmd})`
            });
            break;

          default:
            this.logs.push({
              lineNumber: lineNum,
              rawText: rawLine,
              command: mainCmd,
              status: 'SKIPPED',
              message: `Command '${mainCmd}' recognized as AutoCAD native command`
            });
            break;
        }
      } catch (err: any) {
        this.logs.push({
          lineNumber: lineNum,
          rawText: rawLine,
          command: mainCmd,
          status: 'WARNING',
          message: `Parse warning: ${err.message}`
        });
      }
    }

    return {
      entities: this.entities,
      layersCreated: Array.from(this.layersCreatedSet),
      logs: this.logs,
      totalCommandsExecuted: this.logs.filter(l => l.status === 'SUCCESS').length
    };
  }

  private handleLayerCommand(tokens: string[], lineNum: number, rawLine: string) {
    // Format: LAYER M <layerName> C <colorIndex> <layerName>
    let layerName = 'SURVEY_LAYER';
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i].toUpperCase();
      if ((t === 'M' || t === 'S' || t === 'N') && tokens[i + 1]) {
        layerName = tokens[i + 1];
        this.currentLayer = layerName;
        this.layersCreatedSet.add(layerName);
      }
      if (t === 'C' && tokens[i + 1]) {
        const cIdx = tokens[i + 1];
        this.currentColor = this.acadColorMap[cIdx] || '#38bdf8';
      }
    }

    this.logs.push({
      lineNumber: lineNum,
      rawText: rawLine,
      command: 'LAYER',
      status: 'SUCCESS',
      message: `Switched active CAD layer to '${this.currentLayer}' (${this.currentColor})`
    });
  }

  private handlePointCommand(tokens: string[], lineNum: number, rawLine: string) {
    // Format: POINT <easting>,<northing>
    const coord = parseCoordinatePair(tokens[0], tokens[1]);
    if (!coord) throw new Error('Invalid POINT coordinate syntax');

    const pointEntity: CadPointEntity = {
      id: `scr_pt_${Date.now()}_${this.entities.length}`,
      type: 'POINT',
      layer: this.currentLayer,
      color: this.currentColor,
      x: coord.x,
      y: coord.y,
      z: 0
    };

    this.entities.push(pointEntity);
    this.logs.push({
      lineNumber: lineNum,
      rawText: rawLine,
      command: 'POINT',
      status: 'SUCCESS',
      message: `Created Point at (${coord.x.toFixed(3)}, ${coord.y.toFixed(3)})`
    });
  }

  private handleLineCommand(tokens: string[], lineNum: number, rawLine: string) {
    // Format: LINE <x1>,<y1> <x2>,<y2>
    const coords: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].includes(',')) {
        const c = parseCoordinatePair(tokens[i]);
        if (c) coords.push(c);
      } else if (i + 1 < tokens.length && !isNaN(parseFloat(tokens[i])) && !isNaN(parseFloat(tokens[i + 1]))) {
        const c = parseCoordinatePair(tokens[i], tokens[i + 1]);
        if (c) {
          coords.push(c);
          i++;
        }
      }
    }

    if (coords.length >= 2) {
      const lineEntity: CadLineEntity = {
        id: `scr_line_${Date.now()}_${this.entities.length}`,
        type: 'LINE',
        layer: this.currentLayer,
        color: this.currentColor,
        x1: coords[0].x,
        y1: coords[0].y,
        x2: coords[1].x,
        y2: coords[1].y
      };
      this.entities.push(lineEntity);
      this.logs.push({
        lineNumber: lineNum,
        rawText: rawLine,
        command: 'LINE',
        status: 'SUCCESS',
        message: `Created Line segment between (${coords[0].x}, ${coords[0].y}) and (${coords[1].x}, ${coords[1].y})`
      });
    }
  }

  private handlePlineCommand(tokens: string[], lineNum: number, rawLine: string) {
    // Format: PLINE <x1>,<y1> <x2>,<y2> ... C
    const vertices: Array<{ x: number; y: number; z?: number }> = [];
    let isClosed = false;

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.toUpperCase() === 'C' || tok.toUpperCase() === 'CLOSE') {
        isClosed = true;
        continue;
      }
      if (tok.includes(',')) {
        const c = parseCoordinatePair(tok);
        if (c) vertices.push(c);
      } else if (i + 1 < tokens.length && !isNaN(parseFloat(tok)) && !isNaN(parseFloat(tokens[i + 1]))) {
        const c = parseCoordinatePair(tok, tokens[i + 1]);
        if (c) {
          vertices.push(c);
          i++;
        }
      }
    }

    if (vertices.length >= 2) {
      const polyEntity: CadPolylineEntity = {
        id: `scr_pline_${Date.now()}_${this.entities.length}`,
        type: 'POLYLINE',
        layer: this.currentLayer,
        color: this.currentColor,
        vertices,
        isClosed
      };
      this.entities.push(polyEntity);
      this.logs.push({
        lineNumber: lineNum,
        rawText: rawLine,
        command: 'PLINE',
        status: 'SUCCESS',
        message: `Created Polyline with ${vertices.length} vertices (${isClosed ? 'Closed' : 'Open'})`
      });
    }
  }

  private handleCircleCommand(tokens: string[], lineNum: number, rawLine: string) {
    // Format: CIRCLE <cx>,<cy> <radius>
    const coord = parseCoordinatePair(tokens[0], tokens[1]);
    const radius = parseFloat(tokens[tokens[0].includes(',') ? 1 : 2]) || 1.0;

    if (coord) {
      const circleEntity: CadCircleEntity = {
        id: `scr_circle_${Date.now()}_${this.entities.length}`,
        type: 'CIRCLE',
        layer: this.currentLayer,
        color: this.currentColor,
        cx: coord.x,
        cy: coord.y,
        radius
      };
      this.entities.push(circleEntity);
      this.logs.push({
        lineNumber: lineNum,
        rawText: rawLine,
        command: 'CIRCLE',
        status: 'SUCCESS',
        message: `Created Circle at (${coord.x}, ${coord.y}) radius ${radius}`
      });
    }
  }

  private handleTextCommand(tokens: string[], lineNum: number, rawLine: string) {
    // AutoCAD TEXT syntax:
    // TEXT J <Justification> <x>,<y> <height> <rotation> <textString...>
    // or TEXT <x>,<y> <height> <rotation> <textString...>
    let idx = 0;
    let anchor: 'start' | 'middle' | 'end' = 'start';

    if (tokens[idx]?.toUpperCase() === 'J') {
      const just = tokens[idx + 1]?.toUpperCase() || 'MC';
      if (just.includes('C') || just === 'M') anchor = 'middle';
      else if (just.includes('R')) anchor = 'end';
      idx += 2;
    }

    let coord: { x: number; y: number } | null = null;
    if (tokens[idx]?.includes(',')) {
      coord = parseCoordinatePair(tokens[idx]);
      idx++;
    } else if (tokens[idx] && tokens[idx + 1] && !isNaN(parseFloat(tokens[idx])) && !isNaN(parseFloat(tokens[idx + 1]))) {
      coord = parseCoordinatePair(tokens[idx], tokens[idx + 1]);
      idx += 2;
    }

    if (!coord) throw new Error('Invalid TEXT coordinate syntax');

    const height = parseFloat(tokens[idx]) || 1.5;
    idx++;
    const rotation = parseFloat(tokens[idx]) || 0;
    idx++;

    const textContent = tokens.slice(idx).join(' ') || 'TEXT';

    const textEntity: CadTextEntity = {
      id: `scr_txt_${Date.now()}_${this.entities.length}`,
      type: 'TEXT',
      layer: this.currentLayer,
      color: this.currentColor,
      x: coord.x,
      y: coord.y,
      height,
      rotation,
      anchor,
      text: textContent
    };

    this.entities.push(textEntity);
    this.logs.push({
      lineNumber: lineNum,
      rawText: rawLine,
      command: 'TEXT',
      status: 'SUCCESS',
      message: `Created Text "${textContent}" at (${coord.x}, ${coord.y})`
    });
  }
}
