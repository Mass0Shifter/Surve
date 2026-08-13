import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CoordinatePoint, Parcel, ProjectMetadata, CadLayers, CadTool, HistorySnapshot, SetoutOverlay, AlignmentOverlay, NigerianGridBelt } from './engine/types';
import { SAMPLE_PROJECT_METADATA, SAMPLE_COORDINATES, SAMPLE_PARCELS } from './engine/sampleData';
import { Header } from './components/layout/Header';
import { Toolbar } from './components/layout/Toolbar';
import { StatusBar } from './components/layout/StatusBar';
import { CadCanvas } from './components/cad/CadCanvas';
import { CoordinateTable } from './components/tables/CoordinateTable';
import { ParcelInspector } from './components/panels/ParcelInspector';
import { LayerManager } from './components/panels/LayerManager';
import { CogoCalculator } from './components/panels/CogoCalculator';
import { HistoryModal } from './components/panels/HistoryModal';
import { BeaconRenumberModal } from './components/panels/BeaconRenumberModal';
import { TitleDeedPlanModal } from './components/tdp/TitleDeedPlanModal';
import { TraverseStudioModal } from './components/traverse/TraverseStudioModal';
import { LevelingStudioModal } from './components/leveling/LevelingStudioModal';
import { TacheometryStudioModal } from './components/tacheometry/TacheometryStudioModal';
import { SetoutStudioModal } from './components/setout/SetoutStudioModal';
import { DatumTransformModal } from './components/transform/DatumTransformModal';
import { AlignmentStudioModal } from './components/alignment/AlignmentStudioModal';
import { VerticalAlignmentModal } from './components/alignment/VerticalAlignmentModal';
import { SubdivisionStudioModal } from './components/subdivision/SubdivisionStudioModal';
import { DxfStudioModal } from './components/dxf/DxfStudioModal';
import { ResectionStudioModal } from './components/resection/ResectionStudioModal';
import { CsvImporterModal } from './components/importer/CsvImporterModal';
import { SurvPackMigrationModal } from './components/importer/SurvPackMigrationModal';
import { AuthModal } from './components/auth/AuthModal';
import { UserProfileModal } from './components/auth/UserProfileModal';
import { OrganizationStudioModal } from './components/organization/OrganizationStudioModal';
import { ProjectLibraryModal } from './components/library/ProjectLibraryModal';
import { SubscriptionStudioModal } from './components/subscription/SubscriptionStudioModal';
import { UpgradePromptModal } from './components/subscription/UpgradePromptModal';
import { FeatureId, hasFeatureAccess } from './engine/subscription/featureGating';
import { UserProfile } from './engine/auth/authTypes';
import { Organization } from './engine/organization/orgTypes';
import { NSurveyBundle, downloadNSurvBundle, parseNSurvBundle } from './engine/storage/nsurvBundle';
import { getCurrentUser, logout, updateUserProfile } from './engine/auth/authEngine';
import { getOrganizationsForUser, getActiveOrganization } from './engine/organization/orgEngine';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ChevronRight, ChevronLeft, Layers, MapPin } from 'lucide-react';

const STORAGE_KEY = 'nsurvey_project_state_v1';
const AUTOSAVE_KEY = 'nsurvey_autosave_enabled';
const HISTORY_LIMIT_KEY = 'nsurvey_history_limit';

export const App: React.FC = () => {
  // Auto-Save & History Capacity Settings
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  const [historyLimit, setHistoryLimit] = useState<number>(() => {
    const saved = localStorage.getItem(HISTORY_LIMIT_KEY);
    return saved ? Math.min(256, Math.max(10, parseInt(saved) || 50)) : 50;
  });

  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // Resizable & Collapsible Sidebars State
  const [leftWidth, setLeftWidth] = useState<number>(330);
  const [rightWidth, setRightWidth] = useState<number>(370);
  const [isLeftVisible, setIsLeftVisible] = useState<boolean>(true);
  const [isRightVisible, setIsRightVisible] = useState<boolean>(true);

  const isDraggingLeftRef = useRef(false);
  const isDraggingRightRef = useRef(false);

  // Master Project State
  const [project, setProject] = useState<ProjectMetadata>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.project) return parsed.project;
      }
    } catch {
      // fallback
    }
    return SAMPLE_PROJECT_METADATA;
  });

  const [points, setPoints] = useState<CoordinatePoint[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.points && Array.isArray(parsed.points)) return parsed.points;
      }
    } catch {
      // fallback
    }
    return SAMPLE_COORDINATES;
  });

  const [parcels, setParcels] = useState<Parcel[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.parcels && Array.isArray(parsed.parcels)) return parsed.parcels;
      }
    } catch {
      // fallback
    }
    return SAMPLE_PARCELS;
  });

  // Undo / Redo History Stacks
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  const stateRef = useRef({ points, parcels, project });
  stateRef.current = { points, parcels, project };

  // Active Tool & Selection State
  const [activeTool, setActiveTool] = useState<CadTool>('select');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(parcels[0]?.id || null);

  // Real-time Cursor Coordinates
  const [cursorCoord, setCursorCoord] = useState<{ easting: number; northing: number }>({
    easting: points[0]?.easting || 294312.45,
    northing: points[0]?.northing || 992100.125
  });

  // Modal States
  const [isCogoOpen, setIsCogoOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isRenumberOpen, setIsRenumberOpen] = useState<boolean>(false);
  const [isTdpOpen, setIsTdpOpen] = useState<boolean>(false);
  const [isTraverseOpen, setIsTraverseOpen] = useState<boolean>(false);
  const [isLevelingOpen, setIsLevelingOpen] = useState<boolean>(false);
  const [isTachOpen, setIsTachOpen] = useState<boolean>(false);
  const [isSetoutOpen, setIsSetoutOpen] = useState<boolean>(false);
  const [isDatumTransformOpen, setIsDatumTransformOpen] = useState<boolean>(false);
  const [isAlignmentOpen, setIsAlignmentOpen] = useState<boolean>(false);
  const [isVerticalOpen, setIsVerticalOpen] = useState<boolean>(false);
  const [isSubdivisionOpen, setIsSubdivisionOpen] = useState<boolean>(false);
  const [isDxfOpen, setIsDxfOpen] = useState<boolean>(false);
  const [isResectionOpen, setIsResectionOpen] = useState<boolean>(false);
  const [isCsvImporterOpen, setIsCsvImporterOpen] = useState<boolean>(false);
  const [isSurvpackOpen, setIsSurvpackOpen] = useState<boolean>(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(false);
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState<boolean>(false);
  const [upgradePromptFeature, setUpgradePromptFeature] = useState<FeatureId | null>(null);
  const nativeNSurvInputRef = useRef<HTMLInputElement | null>(null);

  // User Authentication & Profile States
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => getCurrentUser());
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isOrgStudioOpen, setIsOrgStudioOpen] = useState<boolean>(false);

  // Feature Access Interceptor Helper
  const checkFeatureOrRun = useCallback((featureId: FeatureId, action: () => void) => {
    if (hasFeatureAccess(currentUser, featureId)) {
      action();
    } else {
      setUpgradePromptFeature(featureId);
    }
  }, [currentUser]);

  // Organization & Workspace State
  const [organizations, setOrganizations] = useState<Organization[]>(() => 
    currentUser ? getOrganizationsForUser(currentUser.id) : []
  );
  const [activeOrg, setActiveOrg] = useState<Organization | null>(() => 
    currentUser ? getActiveOrganization(currentUser) : null
  );

  const refreshUserData = useCallback((user: UserProfile | null) => {
    if (user) {
      const userOrgs = getOrganizationsForUser(user.id);
      setOrganizations(userOrgs);
      const active = getActiveOrganization(user) || userOrgs[0] || null;
      setActiveOrg(active);
    } else {
      setOrganizations([]);
      setActiveOrg(null);
    }
  }, []);

  useEffect(() => {
    const handleAuthChanged = (e: any) => {
      const user = e.detail;
      setCurrentUser(user);
      refreshUserData(user);
    };

    const handleOrgsChanged = () => {
      const user = getCurrentUser();
      refreshUserData(user);
    };

    window.addEventListener('nsurvey_auth_changed', handleAuthChanged);
    window.addEventListener('nsurvey_orgs_changed', handleOrgsChanged);

    return () => {
      window.removeEventListener('nsurvey_auth_changed', handleAuthChanged);
      window.removeEventListener('nsurvey_orgs_changed', handleOrgsChanged);
    };
  }, [refreshUserData]);

  const handleSelectOrg = async (orgId: string | null) => {
    if (!currentUser) return;
    try {
      const updated = await updateUserProfile({ activeOrganizationId: orgId || undefined });
      setCurrentUser(updated);
      const selectedOrg = orgId ? getOrganizationsForUser(currentUser.id).find(o => o.id === orgId) || null : null;
      setActiveOrg(selectedOrg);
    } catch (err) {
      console.error('Failed to switch active organization', err);
    }
  };

  const [setoutOverlay, setSetoutOverlay] = useState<SetoutOverlay | null>(null);
  const [alignmentOverlay, setAlignmentOverlay] = useState<AlignmentOverlay | null>(null);

  // Active Layer Toggles (including DTM / Contour settings)
  const [layers, setLayers] = useState<CadLayers>({
    beacons: true,
    beaconLabels: true,
    coordinates: true,
    boundaryLines: true,
    bearings: true,
    distances: true,
    parcelFill: true,
    gridCrosses: true,
    controls: true,
    // DTM Contour defaults
    contours: false,
    contourInterval: 2,
    majorContourEvery: 5,
    showContourLabels: true,
    // Road Alignment defaults
    alignments: true,
    chainages: true
  });

  const handleToggleLayer = (layerKey: keyof CadLayers) => {
    setLayers(prev => {
      const val = prev[layerKey];
      if (typeof val === 'boolean') {
        return { ...prev, [layerKey]: !val };
      }
      return prev;
    });
  };

  const handleUpdateLayerValue = (layerKey: keyof CadLayers, value: any) => {
    setLayers(prev => ({ ...prev, [layerKey]: value }));
  };

  // Mouse Drag Resizer Listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeftRef.current) {
        const newW = Math.max(220, Math.min(550, e.clientX));
        setLeftWidth(newW);
      } else if (isDraggingRightRef.current) {
        const newW = Math.max(240, Math.min(600, window.innerWidth - e.clientX));
        setRightWidth(newW);
      }
    };

    const handleMouseUp = () => {
      isDraggingLeftRef.current = false;
      isDraggingRightRef.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleStartDragLeft = () => {
    isDraggingLeftRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleStartDragRight = () => {
    isDraggingRightRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // LocalStorage Auto-Save Effect
  useEffect(() => {
    if (autoSaveEnabled) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, points, parcels }));
        localStorage.setItem(AUTOSAVE_KEY, 'true');
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastSavedTime(now);
      } catch (err) {
        console.warn('Auto-save failed:', err);
      }
    } else {
      localStorage.setItem(AUTOSAVE_KEY, 'false');
      setLastSavedTime(null);
    }
  }, [project, points, parcels, autoSaveEnabled]);

  const handleToggleAutoSave = () => {
    setAutoSaveEnabled(prev => !prev);
  };

  const handleSetHistoryLimit = (limit: number) => {
    const clamped = Math.min(256, Math.max(10, limit));
    setHistoryLimit(clamped);
    localStorage.setItem(HISTORY_LIMIT_KEY, clamped.toString());
    setUndoStack(prev => prev.slice(-clamped));
  };

  // Push state snapshot onto undo stack before mutations
  const recordSnapshot = useCallback((description: string) => {
    const current = stateRef.current;
    const snapshot: HistorySnapshot = {
      points: JSON.parse(JSON.stringify(current.points)),
      parcels: JSON.parse(JSON.stringify(current.parcels)),
      project: JSON.parse(JSON.stringify(current.project)),
      description,
      timestamp: Date.now()
    };
    setUndoStack(prev => [...prev.slice(-(historyLimit - 1)), snapshot]);
    setRedoStack([]);
  }, [historyLimit]);

  // Undo Handler
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const current = stateRef.current;
    const previous = undoStack[undoStack.length - 1];

    const redoSnapshot: HistorySnapshot = {
      points: JSON.parse(JSON.stringify(current.points)),
      parcels: JSON.parse(JSON.stringify(current.parcels)),
      project: JSON.parse(JSON.stringify(current.project)),
      description: 'Current State',
      timestamp: Date.now()
    };
    setRedoStack(prev => [...prev, redoSnapshot]);

    setPoints(previous.points);
    setParcels(previous.parcels);
    setProject(previous.project);
    setUndoStack(prev => prev.slice(0, -1));
  }, [undoStack]);

  // Redo Handler
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const current = stateRef.current;
    const next = redoStack[redoStack.length - 1];

    const undoSnapshot: HistorySnapshot = {
      points: JSON.parse(JSON.stringify(current.points)),
      parcels: JSON.parse(JSON.stringify(current.parcels)),
      project: JSON.parse(JSON.stringify(current.project)),
      description: 'Before Redo',
      timestamp: Date.now()
    };
    setUndoStack(prev => [...prev, undoSnapshot]);

    setPoints(next.points);
    setParcels(next.parcels);
    setProject(next.project);
    setRedoStack(prev => prev.slice(0, -1));
  }, [redoStack]);

  const handleJumpToSnapshot = (index: number, isUndo: boolean) => {
    const current = stateRef.current;
    if (isUndo) {
      const target = undoStack[index];
      if (!target) return;

      const toRedo: HistorySnapshot[] = [
        {
          points: JSON.parse(JSON.stringify(current.points)),
          parcels: JSON.parse(JSON.stringify(current.parcels)),
          project: JSON.parse(JSON.stringify(current.project)),
          description: 'State before jump',
          timestamp: Date.now()
        },
        ...undoStack.slice(index + 1)
      ];

      setRedoStack(prev => [...prev, ...toRedo]);
      setUndoStack(undoStack.slice(0, index));
      setPoints(target.points);
      setParcels(target.parcels);
      setProject(target.project);
    } else {
      const target = redoStack[index];
      if (!target) return;

      const toUndo: HistorySnapshot[] = [
        {
          points: JSON.parse(JSON.stringify(current.points)),
          parcels: JSON.parse(JSON.stringify(current.parcels)),
          project: JSON.parse(JSON.stringify(current.project)),
          description: 'State before jump',
          timestamp: Date.now()
        },
        ...redoStack.slice(index + 1)
      ];

      setUndoStack(prev => [...prev, ...toUndo]);
      setRedoStack(redoStack.slice(0, index));
      setPoints(target.points);
      setParcels(target.parcels);
      setProject(target.project);
    }
  };

  const handleClearHistory = () => {
    setUndoStack([]);
    setRedoStack([]);
  };

  // Coordinate Handlers
  const handleAddPoint = (newPt: CoordinatePoint): boolean => {
    const isDup = points.some(p => p.id.toLowerCase() === newPt.id.trim().toLowerCase());
    if (isDup) {
      alert(`Error: Beacon ID "${newPt.id}" already exists. Duplicate IDs are not allowed.`);
      return false;
    }
    recordSnapshot(`Add Beacon ${newPt.id}`);
    setPoints(prev => [...prev, newPt]);
    setSelectedPointId(newPt.id);
    return true;
  };

  const handleUpdatePoint = (oldId: string, updatedPt: CoordinatePoint): boolean => {
    if (oldId.toLowerCase() !== updatedPt.id.trim().toLowerCase()) {
      const isDup = points.some(
        p => p.id.toLowerCase() !== oldId.toLowerCase() && p.id.toLowerCase() === updatedPt.id.trim().toLowerCase()
      );
      if (isDup) {
        alert(`Error: Beacon ID "${updatedPt.id}" already exists.`);
        return false;
      }
    }

    recordSnapshot(`Edit Beacon ${oldId}`);
    setPoints(prev => prev.map(p => (p.id.toLowerCase() === oldId.toLowerCase() ? updatedPt : p)));

    if (oldId !== updatedPt.id) {
      setParcels(prev =>
        prev.map(p => ({
          ...p,
          pointIds: p.pointIds.map(pid => (pid === oldId ? updatedPt.id : pid))
        }))
      );
    }

    if (selectedPointId === oldId) {
      setSelectedPointId(updatedPt.id);
    }

    return true;
  };

  const handleAddPointAtCoord = (easting: number, northing: number) => {
    const existingIds = new Set(points.map(p => p.id.toLowerCase()));
    let counter = points.length + 101;
    let autoId = `PB_${counter}`;
    while (existingIds.has(autoId.toLowerCase())) {
      counter++;
      autoId = `PB_${counter}`;
    }

    const newPt: CoordinatePoint = {
      id: autoId,
      easting: Math.round(easting * 1000) / 1000,
      northing: Math.round(northing * 1000) / 1000,
      code: 'PB'
    };
    handleAddPoint(newPt);
  };

  const handleDeletePoint = (id: string) => {
    const affectedParcels = parcels.filter(p => p.pointIds.includes(id));
    if (affectedParcels.length > 0) {
      const parcelNames = affectedParcels.map(p => `"${p.plotNumber}"`).join(', ');
      const confirmMsg = `Warning: Beacon "${id}" is used in ${affectedParcels.length} parcel(s): ${parcelNames}.\n\nDeleting this beacon will alter or invalidate these parcels. Are you sure you want to proceed?`;
      if (!confirm(confirmMsg)) {
        return;
      }
    } else {
      if (!confirm(`Are you sure you want to delete beacon "${id}"?`)) {
        return;
      }
    }

    recordSnapshot(`Delete Beacon ${id}`);
    setPoints(prev => prev.filter(p => p.id !== id));
    setParcels(prev =>
      prev
        .map(p => ({
          ...p,
          pointIds: p.pointIds.filter(pid => pid !== id)
        }))
        .filter(p => p.pointIds.length >= 3)
    );
    if (selectedPointId === id) setSelectedPointId(null);
  };

  const handleBatchImport = (importedPoints: CoordinatePoint[]) => {
    recordSnapshot(`Import ${importedPoints.length} Coordinates`);
    const existingMap = new Map<string, CoordinatePoint>(points.map(p => [p.id.toLowerCase(), p]));
    const newPointsList = [...points];

    for (const ip of importedPoints) {
      const lower = ip.id.toLowerCase();
      if (!existingMap.has(lower)) {
        existingMap.set(lower, ip);
        newPointsList.push(ip);
      }
    }
    setPoints(newPointsList);
  };

  const handleApplyRenumber = (renamedMap: Map<string, string>) => {
    recordSnapshot(`Batch Renumber ${points.length} Beacons`);

    const updatedPoints = points.map(p => {
      const newId = renamedMap.get(p.id);
      return newId ? { ...p, id: newId } : p;
    });

    const updatedParcels = parcels.map(parcel => ({
      ...parcel,
      pointIds: parcel.pointIds.map(pid => renamedMap.get(pid) || pid)
    }));

    setPoints(updatedPoints);
    setParcels(updatedParcels);
    if (selectedPointId) {
      setSelectedPointId(renamedMap.get(selectedPointId) || selectedPointId);
    }
  };

  const handleAddParcel = (newParcel: Parcel): boolean => {
    const isDup = parcels.some(p => p.plotNumber.toLowerCase() === newParcel.plotNumber.trim().toLowerCase());
    if (isDup) {
      alert(`Error: A parcel with Plot Number "${newParcel.plotNumber}" already exists.`);
      return false;
    }
    recordSnapshot(`Create Parcel ${newParcel.plotNumber}`);
    setParcels(prev => [...prev, newParcel]);
    setSelectedParcelId(newParcel.id);
    return true;
  };

  const handleUpdateParcel = (updatedParcel: Parcel): boolean => {
    const isDup = parcels.some(
      p => p.id !== updatedParcel.id && p.plotNumber.toLowerCase() === updatedParcel.plotNumber.trim().toLowerCase()
    );
    if (isDup) {
      alert(`Error: A parcel with Plot Number "${updatedParcel.plotNumber}" already exists.`);
      return false;
    }

    recordSnapshot(`Edit Parcel ${updatedParcel.plotNumber}`);
    setParcels(prev => prev.map(p => (p.id === updatedParcel.id ? updatedParcel : p)));
    return true;
  };

  const handleDeleteParcel = (id: string) => {
    recordSnapshot(`Delete Parcel`);
    setParcels(prev => prev.filter(p => p.id !== id));
    if (selectedParcelId === id) setSelectedParcelId(parcels[0]?.id || null);
  };

  const handleLoadSample = () => {
    recordSnapshot(`Reset to Demo Benchmark`);
    setProject(SAMPLE_PROJECT_METADATA);
    setPoints(SAMPLE_COORDINATES);
    setParcels(SAMPLE_PARCELS);
    setSelectedPointId(null);
    setSelectedParcelId(SAMPLE_PARCELS[0]?.id || null);
    setSetoutOverlay(null);
    setAlignmentOverlay(null);
  };

  const handleInjectTraverse = (balancedPoints: CoordinatePoint[], tName: string) => {
    recordSnapshot(`Inject Traverse Loop ${tName}`);

    // Merge points avoiding duplicates
    const existingMap = new Map(points.map(p => [p.id.toLowerCase(), p]));
    const newPointsList = [...points];

    for (const bp of balancedPoints) {
      if (!existingMap.has(bp.id.toLowerCase())) {
        existingMap.set(bp.id.toLowerCase(), bp);
        newPointsList.push(bp);
      } else {
        const idx = newPointsList.findIndex(p => p.id.toLowerCase() === bp.id.toLowerCase());
        if (idx !== -1) newPointsList[idx] = bp;
      }
    }
    setPoints(newPointsList);

    // Create connected parcel boundary if >= 3 points
    if (balancedPoints.length >= 3) {
      const newParcel: Parcel = {
        id: `parcel_trav_${Date.now()}`,
        plotNumber: tName,
        pointIds: balancedPoints.map(p => p.id),
        ownerName: 'Traverse Boundary Loop',
        color: '#38bdf8'
      };
      setParcels(prev => [...prev.filter(p => p.plotNumber !== tName), newParcel]);
      setSelectedParcelId(newParcel.id);
    }
  };

  const handleNewProject = () => {
    if (points.length > 0 && !confirm('Are you sure you want to create a New Project? All unsaved work in the current session will be cleared.')) {
      return;
    }
    recordSnapshot('Create New Project');
    setProject({
      title: 'UNTITLED SURVEY PLAN',
      location: 'NIGERIA',
      code: `JOB-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      surveyFirm: 'GEOMATICS & SURVEY ASSOCIATES',
      surveyorName: 'SURV. (CHIEF) O. C. EZE',
      surveyorNumber: 'SURCON/REG/2014/4891',
      clientName: 'NEW CLIENT',
      address: 'ABUJA, NIGERIA',
      phone: '+234 803 000 0000',
      date: new Date().toLocaleDateString('en-GB'),
      scale: 1000,
      gridBelt: project.gridBelt || NigerianGridBelt.MID_BELT
    });
    setPoints([]);
    setParcels([]);
    setSelectedPointId(null);
    setSelectedParcelId(null);
    setSetoutOverlay(null);
    setAlignmentOverlay(null);
  };

  const handleToggleMaximizeCanvas = () => {
    if (isLeftVisible || isRightVisible) {
      setIsLeftVisible(false);
      setIsRightVisible(false);
    } else {
      setIsLeftVisible(true);
      setIsRightVisible(true);
    }
  };

  const handleApplyLevelingElevations = (stationElevations: { stationId: string; elevation: number }[]) => {
    recordSnapshot('Apply Leveling Elevations');
    const elevMap = new Map(stationElevations.map(s => [s.stationId.toLowerCase(), s.elevation]));
    let matchCount = 0;

    const updatedPoints = points.map(p => {
      const key = p.id.toLowerCase();
      if (elevMap.has(key)) {
        matchCount++;
        return { ...p, elevation: elevMap.get(key) };
      }
      return p;
    });

    setPoints(updatedPoints);
    alert(`Leveling Synchronization: Updated 3D Elevations (Z) for ${matchCount} matching coordinate beacons in the workspace!`);
  };

  const handleLoadBundle = (bundle: NSurveyBundle) => {
    recordSnapshot(`Load Project ${bundle.project.title}`);
    setProject(bundle.project);
    setPoints(bundle.points);
    setParcels(bundle.parcels);
    if (bundle.layers) {
      setLayers(bundle.layers);
    }
    setSelectedPointId(bundle.points[0]?.id || null);
    setSelectedParcelId(bundle.parcels[0]?.id || null);
    setSetoutOverlay(null);
    setAlignmentOverlay(null);
  };

  return (
    <ErrorBoundary fallbackTitle="NSurvey Workspace Recovery">
      <div className="app-container">
        {/* Hidden File Input for Native .nsurv Imports */}
        <input
          type="file"
          ref={nativeNSurvInputRef}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              try {
                const bundle = parseNSurvBundle(ev.target?.result as string);
                handleLoadBundle(bundle);
              } catch (err: any) {
                alert(err.message);
              }
            };
            reader.readAsText(file);
            e.target.value = '';
          }}
          accept=".nsurv,application/json"
          style={{ display: 'none' }}
        />

        {/* 1. Header with Native Desktop CAD MenuBar */}
        <Header
          project={project}
          points={points}
          parcels={parcels}
          autoSaveEnabled={autoSaveEnabled}
          lastSavedTime={lastSavedTime}
          onToggleAutoSave={handleToggleAutoSave}
          onUpdateProject={(newProj) => {
            recordSnapshot('Update Project Metadata');
            setProject(newProj);
          }}
          onNewProject={handleNewProject}
          onOpenProjectLibrary={() => setIsLibraryOpen(true)}
          onExportNSurv={() => downloadNSurvBundle(project, points, parcels, {
            scope: {
              ownerUserId: currentUser?.id,
              organizationId: activeOrg?.id,
              organizationName: activeOrg?.name
            },
            layers
          })}
          onImportNSurv={() => nativeNSurvInputRef.current?.click()}
          onLoadSample={handleLoadSample}
          onOpenCogo={() => setIsCogoOpen(true)}
          onOpenRenumber={() => setIsRenumberOpen(true)}
          onOpenTdp={() => checkFeatureOrRun('TDP_PRINT_STUDIO', () => setIsTdpOpen(true))}
          onOpenTraverse={() => checkFeatureOrRun('TRAVERSE_BALANCING', () => setIsTraverseOpen(true))}
          onOpenLeveling={() => checkFeatureOrRun('LEVELING_STUDIO', () => setIsLevelingOpen(true))}
          onOpenTacheometry={() => checkFeatureOrRun('TACHEOMETRY_DTM', () => setIsTachOpen(true))}
          onOpenSetout={() => checkFeatureOrRun('SETOUT_STAKING', () => setIsSetoutOpen(true))}
          onOpenDatumTransform={() => checkFeatureOrRun('DATUM_TRANSFORM', () => setIsDatumTransformOpen(true))}
          onOpenAlignment={() => checkFeatureOrRun('ALIGNMENT_STUDIO', () => setIsAlignmentOpen(true))}
          onOpenVerticalAlignment={() => checkFeatureOrRun('VERTICAL_ALIGNMENT', () => setIsVerticalOpen(true))}
          onOpenSubdivision={() => checkFeatureOrRun('SUBDIVISION_STUDIO', () => setIsSubdivisionOpen(true))}
          onOpenDxf={() => checkFeatureOrRun('DXF_STUDIO', () => setIsDxfOpen(true))}
          onOpenResection={() => checkFeatureOrRun('RESECTION_STUDIO', () => setIsResectionOpen(true))}
          onOpenCsvImporter={() => setIsCsvImporterOpen(true)}
          onOpenSurvpackImporter={() => checkFeatureOrRun('LEGACY_BATCH_IMPORT', () => setIsSurvpackOpen(true))}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onOpenHistory={() => setIsHistoryOpen(true)}
          currentUser={currentUser}
          organizations={organizations}
          activeOrg={activeOrg}
          onSelectOrg={handleSelectOrg}
          onOpenOrgStudio={() => setIsOrgStudioOpen(true)}
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenSubscription={() => setIsSubscriptionOpen(true)}
          onRequestUpgrade={(fId) => setUpgradePromptFeature(fId)}
          onLogout={logout}
          isLeftVisible={isLeftVisible}
          isRightVisible={isRightVisible}
          onToggleLeft={() => setIsLeftVisible(v => !v)}
          onToggleRight={() => setIsRightVisible(v => !v)}
          onToggleMaximize={handleToggleMaximizeCanvas}
        />

      {/* 2. CAD Tool Palette Toolbar with Panel Toggles */}
      <Toolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        onOpenCogo={() => setIsCogoOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        historyCount={undoStack.length + redoStack.length + 1}
        isLeftVisible={isLeftVisible}
        isRightVisible={isRightVisible}
        onToggleLeft={() => setIsLeftVisible(v => !v)}
        onToggleRight={() => setIsRightVisible(v => !v)}
        onToggleMaximizeCanvas={() => {
          if (isLeftVisible || isRightVisible) {
            setIsLeftVisible(false);
            setIsRightVisible(false);
          } else {
            setIsLeftVisible(true);
            setIsRightVisible(true);
          }
        }}
      />

      {/* 3. Main Resizable CAD Workstation Area */}
      <main className="app-workspace">
        {/* Left Side: Coordinate Table */}
        {isLeftVisible ? (
          <aside className="workspace-sidebar left-sidebar" style={{ width: `${leftWidth}px` }}>
            <CoordinateTable
              points={points}
              selectedPointId={selectedPointId}
              onSelectPoint={setSelectedPointId}
              onAddPoint={handleAddPoint}
              onUpdatePoint={handleUpdatePoint}
              onDeletePoint={handleDeletePoint}
              onBatchImport={handleBatchImport}
            />
            {/* Left Resizer Drag Handle */}
            <div
              className="resizer-handle resizer-right"
              onMouseDown={handleStartDragLeft}
              title="Drag to resize Coordinates panel"
            />
          </aside>
        ) : (
          <button
            className="collapsed-edge-tab left-edge-tab"
            title="Restore Coordinates Panel"
            onClick={() => setIsLeftVisible(true)}
          >
            <MapPin size={13} />
            <span>Coords</span>
            <ChevronRight size={12} />
          </button>
        )}

        {/* Center: Interactive 2D Vector CAD Canvas */}
        <section className="workspace-center">
          <CadCanvas
            points={points}
            parcels={parcels}
            layers={layers}
            activeTool={activeTool}
            selectedPointId={selectedPointId}
            selectedParcelId={selectedParcelId}
            onSelectPoint={setSelectedPointId}
            onSelectParcel={setSelectedParcelId}
            onAddPointAtCoord={handleAddPointAtCoord}
            onCursorMove={(e, n) => setCursorCoord({ easting: e, northing: n })}
            setoutOverlay={setoutOverlay}
            alignmentOverlay={alignmentOverlay}
          />
        </section>

        {/* Right Side: Parcel Inspector & Layer Manager */}
        {isRightVisible ? (
          <aside className="workspace-sidebar right-sidebar" style={{ width: `${rightWidth}px` }}>
            {/* Right Resizer Drag Handle */}
            <div
              className="resizer-handle resizer-left"
              onMouseDown={handleStartDragRight}
              title="Drag to resize Inspector panel"
            />
            <ParcelInspector
              parcels={parcels}
              points={points}
              selectedParcelId={selectedParcelId}
              onSelectParcel={setSelectedParcelId}
              onAddParcel={handleAddParcel}
              onUpdateParcel={handleUpdateParcel}
              onDeleteParcel={handleDeleteParcel}
            />
            <LayerManager
              layers={layers}
              onToggleLayer={handleToggleLayer}
              onUpdateLayerValue={handleUpdateLayerValue}
            />
          </aside>
        ) : (
          <button
            className="collapsed-edge-tab right-edge-tab"
            title="Restore Inspector & Layers Panel"
            onClick={() => setIsRightVisible(true)}
          >
            <ChevronLeft size={12} />
            <span>Inspector</span>
            <Layers size={13} />
          </button>
        )}
      </main>

      {/* 4. Live Cursor Coordinate Status Bar */}
      <StatusBar
        cursorEasting={cursorCoord.easting}
        cursorNorthing={cursorCoord.northing}
        beaconCount={points.length}
        parcelCount={parcels.length}
        project={project}
      />

      {/* Quick COGO Modal */}
      <CogoCalculator
        points={points}
        isOpen={isCogoOpen}
        onClose={() => setIsCogoOpen(false)}
      />

      {/* History & Version Control Timeline Modal */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        undoStack={undoStack}
        redoStack={redoStack}
        currentSnapshot={{ points, parcels, project, description: 'Live Workspace' }}
        historyLimit={historyLimit}
        onSetHistoryLimit={handleSetHistoryLimit}
        onJumpToSnapshot={handleJumpToSnapshot}
        onClearHistory={handleClearHistory}
      />

      {/* Batch Beacon Prefix & Renumbering Modal */}
      <BeaconRenumberModal
        points={points}
        parcels={parcels}
        isOpen={isRenumberOpen}
        onClose={() => setIsRenumberOpen(false)}
        onApplyRenumber={handleApplyRenumber}
      />

      {/* Title Deed Plan (TDP) Print Studio Modal */}
      <TitleDeedPlanModal
        project={project}
        points={points}
        parcels={parcels}
        currentUser={currentUser}
        activeOrg={activeOrg}
        isOpen={isTdpOpen}
        onClose={() => setIsTdpOpen(false)}
      />

      {/* Traverse Loop Balancing Studio Modal */}
      <TraverseStudioModal
        isOpen={isTraverseOpen}
        onClose={() => setIsTraverseOpen(false)}
        existingPoints={points}
        onInjectTraverse={handleInjectTraverse}
      />

      {/* Spirit Leveling Studio Modal */}
      <LevelingStudioModal
        isOpen={isLevelingOpen}
        onClose={() => setIsLevelingOpen(false)}
        onApplyElevations={handleApplyLevelingElevations}
      />

      {/* Stadia Tacheometry & Total Station Studio Modal */}
      <TacheometryStudioModal
        isOpen={isTachOpen}
        onClose={() => setIsTachOpen(false)}
        onInjectSpotHeights={(newPoints) => {
          recordSnapshot('Inject Tacheometry Spot Heights');
          const existingMap = new Map(points.map(p => [p.id.toLowerCase(), p]));
          const merged = [...points];
          for (const np of newPoints) {
            if (!existingMap.has(np.id.toLowerCase())) merged.push(np);
            else {
              const idx = merged.findIndex(p => p.id.toLowerCase() === np.id.toLowerCase());
              if (idx !== -1) merged[idx] = np;
            }
          }
          setPoints(merged);
        }}
      />

      {/* Setout / Setting-Out Studio Modal */}
      <SetoutStudioModal
        isOpen={isSetoutOpen}
        onClose={() => setIsSetoutOpen(false)}
        existingPoints={points}
        onOverlayChange={setSetoutOverlay}
        onInjectSetoutPoints={(newPoints) => {
          recordSnapshot('Inject Stakeout Peg Beacons');
          const existingMap = new Map(points.map(p => [p.id.toLowerCase(), p]));
          const merged = [...points];
          for (const np of newPoints) {
            if (!existingMap.has(np.id.toLowerCase())) merged.push(np);
            else {
              const idx = merged.findIndex(p => p.id.toLowerCase() === np.id.toLowerCase());
              if (idx !== -1) merged[idx] = np;
            }
          }
          setPoints(merged);
        }}
      />

      {/* Minna ↔ WGS84 Datum Transform Modal */}
      <DatumTransformModal
        isOpen={isDatumTransformOpen}
        onClose={() => setIsDatumTransformOpen(false)}
        projectPoints={points}
        onImportPoints={(importedPoints) => {
          recordSnapshot('Import Datum Transformed Points');
          const existingMap = new Map(points.map(p => [p.id.toLowerCase(), p]));
          const merged = [...points];
          for (const np of importedPoints) {
            if (!existingMap.has(np.id.toLowerCase())) merged.push(np);
            else {
              const idx = merged.findIndex(p => p.id.toLowerCase() === np.id.toLowerCase());
              if (idx !== -1) merged[idx] = np;
            }
          }
          setPoints(merged);
        }}
      />

      {/* Horizontal Alignment & Earthworks Studio Modal */}
      <AlignmentStudioModal
        isOpen={isAlignmentOpen}
        onClose={() => setIsAlignmentOpen(false)}
        existingPoints={points}
        onOverlayChange={setAlignmentOverlay}
        onInjectAlignmentPoints={(newPoints) => {
          recordSnapshot('Inject Road Alignment Beacons');
          const existingMap = new Map(points.map(p => [p.id.toLowerCase(), p]));
          const merged = [...points];
          for (const np of newPoints) {
            if (!existingMap.has(np.id.toLowerCase())) merged.push(np);
            else {
              const idx = merged.findIndex(p => p.id.toLowerCase() === np.id.toLowerCase());
              if (idx !== -1) merged[idx] = np;
            }
          }
          setPoints(merged);
        }}
      />

      {/* Area Sub-Division & Land Splitting Studio Modal */}
      <SubdivisionStudioModal
        isOpen={isSubdivisionOpen}
        onClose={() => setIsSubdivisionOpen(false)}
        parcels={parcels}
        existingPoints={points}
        onApplySubdivision={(parentParcelId, childA, childB, newBeacons) => {
          recordSnapshot(`Sub-Divide Parcel ${parentParcelId}`);

          // 1. Add new partition beacons
          const existingPtMap = new Map(points.map(p => [p.id.toLowerCase(), p]));
          const mergedPoints = [...points];
          for (const nb of newBeacons) {
            if (!existingPtMap.has(nb.id.toLowerCase())) mergedPoints.push(nb);
          }
          setPoints(mergedPoints);

          // 2. Replace parent parcel with Child A and Child B
          setParcels(prev => {
            const filtered = prev.filter(p => p.id !== parentParcelId);
            return [...filtered, childA, childB];
          });
          setSelectedParcelId(childA.id);
        }}
      />

      {/* AutoCAD DXF Import & Export Studio Modal */}
      <DxfStudioModal
        isOpen={isDxfOpen}
        onClose={() => setIsDxfOpen(false)}
        workspacePoints={points}
        workspaceParcels={parcels}
        alignmentOverlay={alignmentOverlay}
        setoutOverlay={setoutOverlay}
        onImportToWorkspace={(impPoints, impParcels) => {
          recordSnapshot('Import DXF Beacons & Parcels');
          const existingPtMap = new Map(points.map(p => [p.id.toLowerCase(), p]));
          const mergedPoints = [...points];
          for (const ip of impPoints) {
            if (!existingPtMap.has(ip.id.toLowerCase())) mergedPoints.push(ip);
          }
          setPoints(mergedPoints);

          const existingPclMap = new Map(parcels.map(p => [p.plotNumber.toLowerCase(), p]));
          const mergedParcels = [...parcels];
          for (const ip of impParcels) {
            if (!existingPclMap.has(ip.plotNumber.toLowerCase())) mergedParcels.push(ip);
          }
          setParcels(mergedParcels);
        }}
      />

      {/* Road Vertical Alignment & Longitudinal Profile Studio Modal */}
      <VerticalAlignmentModal
        isOpen={isVerticalOpen}
        onClose={() => setIsVerticalOpen(false)}
        onInjectVerticalBeacons={(newBeacons) => {
          recordSnapshot('Inject 3D Vertical Alignment Profile');
          const existingMap = new Map(points.map(p => [p.id.toLowerCase(), p]));
          const merged = [...points];
          for (const nb of newBeacons) {
            if (!existingMap.has(nb.id.toLowerCase())) merged.push(nb);
            else {
              const idx = merged.findIndex(p => p.id.toLowerCase() === nb.id.toLowerCase());
              if (idx !== -1) merged[idx] = nb;
            }
          }
          setPoints(merged);
        }}
      />

      {/* Module 7: Resection & COGO Intersections Studio Modal */}
      <ResectionStudioModal
        isOpen={isResectionOpen}
        onClose={() => setIsResectionOpen(false)}
        workspacePoints={points}
        onInjectPoint={(newPt) => {
          recordSnapshot(`Inject Solved Point ${newPt.id}`);
          const existing = points.find(p => p.id.toLowerCase() === newPt.id.toLowerCase());
          if (existing) {
            setPoints(points.map(p => p.id.toLowerCase() === newPt.id.toLowerCase() ? newPt : p));
          } else {
            setPoints([...points, newPt]);
          }
        }}
      />

      {/* Module 8: Universal Field CSV & Custom Schema Importer Modal */}
      <CsvImporterModal
        isOpen={isCsvImporterOpen}
        onClose={() => setIsCsvImporterOpen(false)}
        onImportPoints={(impPoints) => {
          recordSnapshot(`Import ${impPoints.length} CSV Survey Points`);
          const existingMap = new Map(points.map(p => [p.id.toLowerCase(), p]));
          const merged = [...points];
          for (const ip of impPoints) {
            if (!existingMap.has(ip.id.toLowerCase())) {
              merged.push(ip);
            } else {
              const idx = merged.findIndex(p => p.id.toLowerCase() === ip.id.toLowerCase());
              if (idx !== -1) merged[idx] = ip;
            }
          }
          setPoints(merged);
        }}
      />

      {/* Phase 5: SurvPack 3.0 Legacy Project Batch Importer Modal */}
      <SurvPackMigrationModal
        isOpen={isSurvpackOpen}
        onClose={() => setIsSurvpackOpen(false)}
        currentUser={currentUser}
        activeOrg={activeOrg}
        onOpenProjectLibrary={() => setIsLibraryOpen(true)}
        onMigrateToWorkspace={(migrated) => {
          recordSnapshot(`Migrate SurvPack 3.0 Project ${migrated.code}`);
          setProject(migrated.metadata);
          setPoints(migrated.points);
          setParcels(migrated.parcels);
          setSelectedPointId(null);
          setSelectedParcelId(null);
        }}
      />

      {/* User Authentication Modal (Sign In / Register / Password Reset) */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(user) => {
          setCurrentUser(user);
        }}
      />

      {/* Surveyor Profile & Digital Seal Modal */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={currentUser}
        onProfileUpdated={(updated) => {
          setCurrentUser(updated);
        }}
        onOpenSubscription={() => setIsSubscriptionOpen(true)}
      />

      {/* Organization & Team Studio Modal */}
      <OrganizationStudioModal
        isOpen={isOrgStudioOpen}
        onClose={() => setIsOrgStudioOpen(false)}
        currentUser={currentUser}
        onOpenSubscription={() => setIsSubscriptionOpen(true)}
      />

      {/* Project Library & Repositories (.nsurv) Modal */}
      <ProjectLibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        currentProject={project}
        currentPoints={points}
        currentParcels={parcels}
        currentUser={currentUser}
        activeOrg={activeOrg}
        onLoadProject={handleLoadBundle}
        onNewProject={handleNewProject}
      />

      {/* Subscription & Payment Gateway Studio Modal */}
      <SubscriptionStudioModal
        isOpen={isSubscriptionOpen}
        onClose={() => setIsSubscriptionOpen(false)}
        currentUser={currentUser}
        onSubscriptionUpdated={(updated) => {
          setCurrentUser(updated);
        }}
      />

      {/* Feature Gating Upgrade Prompt Modal */}
      <UpgradePromptModal
        isOpen={!!upgradePromptFeature}
        featureId={upgradePromptFeature}
        onClose={() => setUpgradePromptFeature(null)}
        onOpenSubscription={() => setIsSubscriptionOpen(true)}
      />
    </div>
    </ErrorBoundary>
  );
};
