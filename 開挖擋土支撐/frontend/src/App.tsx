import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import {
  AnalysisEvent,
  AnalysisImportResult,
  AnalysisSideSource,
  AnalysisSourceMode,
  BoltStrengthRow,
  BootstrapPayload,
  BraceRow,
  CalculationOptions,
  CheckResult,
  ColumnScenarioInput,
  CornerBraceRow,
  ProjectListItem,
  ProjectState,
  ReferenceData,
  SectionProperty,
  SoilLayer,
  SupportRow,
  SummaryItem,
  WaleRow,
} from "./types";

const STEP_PROJECT = 0;
const STEP_ANALYSIS = 1;
const STEP_COMPONENTS = 2;
const STEP_COLUMNS = 3;
const STEP_RESULTS = 4;
const STEP_REPORT = 5;

const steps = [
  "專案設定",
  "分析成果匯入",
  "構件輸入",
  "柱構件",
  "檢核結果",
  "報表匯出",
];

const columnVariantOptions: Array<{
  value: ColumnScenarioInput["variant"];
  label: string;
}> = [
  { value: "middle", label: "中間柱" },
  { value: "composite_normal", label: "共構柱（一般）" },
  { value: "composite_crane", label: "共構柱（大吊車）" },
];

type AnalysisSourceSide = "top" | "bottom";
type AnalysisWorkflowMode = "single_manual" | "dual_manual" | "single_import" | "dual_import" | "mixed";
type ComponentTabKey = "support" | "wale" | "brace" | "corner";

const ADVANCED_PARAMETER_DEFAULTS = {
  alpha_support: 1.25,
  alpha_wale: 1.25,
  alpha_brace: 1.25,
  alpha_corner_brace: 1.25,
  alpha_column: 1.25,
  psi_material: 0.9,
} as const;

const foundationTypeOptions = ["鑽掘或引孔樁", "打入樁"] as const;
const foundationShapeOptions = ["(直徑)", "(寬×長)"] as const;
const wallTypeOptions = ["連續壁", "鋼板樁", "其他"] as const;

const columnNumericFields: Array<keyof ColumnScenarioInput> = [
  "foundation_size_x_m",
  "foundation_size_y_m",
  "column_length_m",
  "kh_kg_per_cm3",
  "bottom_to_excavation_distance_m",
  "eccentricity_y_m",
  "embedment_length_cm",
  "concrete_strength_kg_per_cm2",
  "compression_fs",
  "tension_fs",
  "pile_unit_weight_t_per_m3",
];

const columnNullableNumberFields: Array<keyof ColumnScenarioInput> = [
  "eccentricity_x_m",
  "pile_width_cm",
];

const analysisWorkflowOptions: Array<{
  value: AnalysisWorkflowMode;
  label: string;
  description: string;
}> = [
  {
    value: "single_manual",
    label: "單層手動",
    description: "整頁輸入單側支撐荷重與型號，適合先做單層支撐檢討。",
  },
  {
    value: "dual_manual",
    label: "雙層手動",
    description: "上下層分開完整輸入，不再使用左右窄欄位。",
  },
  {
    value: "single_import",
    label: "單層匯入",
    description: "選定上層或下層後匯入單份分析檔，再做微調。",
  },
  {
    value: "dual_import",
    label: "雙層匯入",
    description: "依序匯入上層與下層資料，最後再一起檢查。",
  },
  {
    value: "mixed",
    label: "進階混合",
    description: "允許上層與下層分別選擇匯入、手動或不使用。",
  },
];

function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [projectList, setProjectList] = useState<ProjectListItem[]>([]);
  const [project, setProject] = useState<ProjectState | null>(null);
  const [referenceDraft, setReferenceDraft] = useState<ReferenceData | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [reportUrl, setReportUrl] = useState<string>("");
  const [wordReportUrl, setWordReportUrl] = useState<string>("");
  const [conciseReportMode, setConciseReportMode] = useState<boolean>(false);
  const [generatedPdfMode, setGeneratedPdfMode] = useState<"detailed" | "concise" | null>(null);
  const [generatedWordMode, setGeneratedWordMode] = useState<"detailed" | "concise" | null>(null);
  const [analysisSingleSide, setAnalysisSingleSide] = useState<AnalysisSourceSide>("top");
  const [componentTab, setComponentTab] = useState<ComponentTabKey>("support");
  const [advancedSettingsExpanded, setAdvancedSettingsExpanded] = useState(false);
  const [quickSettingsExpanded, setQuickSettingsExpanded] = useState(false);
  const [pendingPanelFocus, setPendingPanelFocus] = useState<string | null>(null);
  const [highlightPanelId, setHighlightPanelId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null);
  const [persistedProjectSnapshot, setPersistedProjectSnapshot] = useState("");
  const reportModeLabel = conciseReportMode ? "簡述版" : "詳細版";

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (!project) return;
    const derivedSingleSide = deriveSingleAnalysisSide(
      project.top_analysis_source.mode,
      project.bottom_analysis_source.mode,
    );
    if (derivedSingleSide) {
      setAnalysisSingleSide(derivedSingleSide);
    }
  }, [project?.top_analysis_source.mode, project?.bottom_analysis_source.mode]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 360);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!pendingPanelFocus) return;
    const nextTab = componentTabForPanel(pendingPanelFocus);
    if (nextTab) {
      setComponentTab(nextTab);
    }
    const timer = window.setTimeout(() => {
      const target = document.getElementById(pendingPanelFocus);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        setHighlightPanelId(pendingPanelFocus);
        window.setTimeout(() => setHighlightPanelId((current) => (current === pendingPanelFocus ? null : current)), 2200);
      }
      setPendingPanelFocus(null);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [activeStep, pendingPanelFocus]);

  useEffect(() => {
    if (!project?.metadata.id || autoSaving) return;
    const isDirty = persistedProjectSnapshot
      ? serializeProjectState(project) !== persistedProjectSnapshot
      : false;
    if (!isDirty) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setAutoSaving(true);
          const savedProject = await saveCurrentProjectState(project);
          setLastAutoSavedAt(savedProject.metadata.updated_at ?? new Date().toISOString());
          setError("");
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setAutoSaving(false);
        }
      })();
    }, 30000);
    return () => window.clearTimeout(timer);
  }, [project, persistedProjectSnapshot, autoSaving]);

  async function initialize() {
    try {
      setBusy("初始化中");
      const [boot, projects] = await Promise.all([api.bootstrap(), api.listProjects()]);
      setBootstrap(boot);
      setReferenceDraft(boot.reference_data);
      setProjectList(projects);
      if (projects.length > 0) {
        const loaded = await api.getProject(projects[0].id);
        applyPersistedProjectState(loaded);
      } else {
        const created = await api.createProject("新建擋土支撐專案");
        applyPersistedProjectState(created);
        setProjectList(await api.listProjects());
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function reloadListAndProject(projectId?: string) {
    const projects = await api.listProjects();
    setProjectList(projects);
    const targetId = projectId ?? projects[0]?.id;
    if (targetId) {
      const loaded = await api.getProject(targetId);
      applyPersistedProjectState(loaded);
    }
  }

  function updateProjectListEntry(savedProject: ProjectState) {
    const nextItem = {
      id: savedProject.metadata.id ?? "",
      name: savedProject.metadata.name,
      updated_at: savedProject.metadata.updated_at ?? null,
    };
    setProjectList((current) => {
      const filtered = current.filter((item) => item.id !== nextItem.id);
      return [nextItem, ...filtered].sort((left, right) =>
        String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? "")),
      );
    });
  }

  async function handleCreateProject() {
    try {
      setBusy("建立專案");
      const created = await api.createProject(`新專案 ${new Date().toLocaleString("zh-TW")}`);
      applyPersistedProjectState(created);
      await reloadListAndProject(created.metadata.id ?? undefined);
      setActiveStep(STEP_PROJECT);
      setReportUrl("");
      setWordReportUrl("");
      setGeneratedPdfMode(null);
      setGeneratedWordMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleProjectSwitch(projectId: string) {
    try {
      setBusy("讀取專案");
      const loaded = await api.getProject(projectId);
      applyPersistedProjectState(loaded);
      setReportUrl("");
      setWordReportUrl("");
      setGeneratedPdfMode(null);
      setGeneratedWordMode(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleSaveProject() {
    if (!project) return;
    try {
      setBusy("儲存專案");
      const response = await api.saveProject(syncProjectGuardrails(project));
      applyPersistedProjectState(response.project);
      await reloadListAndProject(response.project.metadata.id ?? undefined);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function saveCurrentProjectState(currentProject: ProjectState): Promise<ProjectState> {
    const response = await api.saveProject(syncProjectGuardrails(currentProject));
    applyPersistedProjectState(response.project);
    updateProjectListEntry(response.project);
    setLastAutoSavedAt(response.project.metadata.updated_at ?? new Date().toISOString());
    return response.project;
  }

  async function handleImportAnalysis(side: AnalysisSourceSide, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !project?.metadata.id) return;
    try {
      setBusy(`匯入${side === "top" ? "上層" : "下層"}分析檔`);
      const savedProject = await saveCurrentProjectState(project);
      const nextProject = await api.importAnalysis(savedProject.metadata.id ?? project.metadata.id, side, file);
      applyPersistedProjectState(nextProject);
      setActiveStep(STEP_ANALYSIS);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }

  async function handleCalculate() {
    if (!project?.metadata.id) return;
    try {
      setBusy("儲存並重新計算");
      const savedProject = await saveCurrentProjectState(project);
      const calculated = await api.calculate(savedProject.metadata.id ?? project.metadata.id);
      applyPersistedProjectState(calculated);
      setActiveStep(STEP_RESULTS);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleGenerateReport() {
    if (!project?.metadata.id) return;
    try {
      setBusy("儲存並產生 PDF");
      const savedProject = await saveCurrentProjectState(project);
      const response = await api.generateReport(savedProject.metadata.id ?? project.metadata.id, conciseReportMode);
      applyPersistedProjectState(response.project);
      setReportUrl(cacheBustUrl(response.download_url));
      setGeneratedPdfMode(response.report_mode);
      setActiveStep(STEP_REPORT);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleGenerateWordReport() {
    if (!project?.metadata.id) return;
    try {
      setBusy("儲存並產生 Word");
      const savedProject = await saveCurrentProjectState(project);
      const response = await api.generateWordReport(savedProject.metadata.id ?? project.metadata.id, conciseReportMode);
      applyPersistedProjectState(response.project);
      setWordReportUrl(cacheBustUrl(response.download_url));
      setGeneratedWordMode(response.report_mode);
      setActiveStep(STEP_REPORT);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleSaveReferenceData() {
    if (!referenceDraft) return;
    try {
      setBusy("儲存參考資料");
      const saved = await api.saveReferenceData(referenceDraft);
      setBootstrap((current) => (current ? { ...current, reference_data: saved } : current));
      setReferenceDraft(saved);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function handleResetReferenceData() {
    try {
      setBusy("還原參考資料");
      const restored = await api.resetReferenceData();
      setBootstrap((current) => (current ? { ...current, reference_data: restored } : current));
      setReferenceDraft(restored);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function applyProjectState(nextProject: ProjectState) {
    const synced = syncProjectGuardrails(nextProject);
    setProject(synced);
    if (!synced.calculation_results) {
      setReportUrl("");
      setWordReportUrl("");
      setGeneratedPdfMode(null);
      setGeneratedWordMode(null);
    }
  }

  function applyPersistedProjectState(nextProject: ProjectState) {
    const synced = syncProjectGuardrails(nextProject);
    setProject(synced);
    setPersistedProjectSnapshot(serializeProjectState(synced));
    if (!synced.calculation_results) {
      setReportUrl("");
      setWordReportUrl("");
      setGeneratedPdfMode(null);
      setGeneratedWordMode(null);
    }
  }

  function setReportMode(nextConcise: boolean) {
    setConciseReportMode(nextConcise);
    setReportUrl("");
    setWordReportUrl("");
    setGeneratedPdfMode(null);
    setGeneratedWordMode(null);
  }

  function jumpToStep(step: number, panelId?: string) {
    if (step === STEP_COMPONENTS && panelId) {
      const nextTab = componentTabForPanel(panelId);
      if (nextTab) {
        setComponentTab(nextTab);
      }
    }
    setActiveStep(step);
    if (panelId) {
      setPendingPanelFocus(panelId);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function applyQuickSupportMode(mode: "top" | "bottom" | "dual") {
    if (!project) return;
    const nextOptions = {
      ...project.calculation_options,
      include_top_supports: mode !== "bottom",
      include_bottom_supports: mode !== "top",
    };
    if (mode === "top") {
      setAnalysisSingleSide("top");
    } else if (mode === "bottom") {
      setAnalysisSingleSide("bottom");
    }
    applyProjectState({
      ...project,
      calculation_options: nextOptions,
      calculation_results: null,
    });
    setError("");
  }

  function updateMetadata(field: keyof ProjectState["metadata"], value: string) {
    if (!project) return;
    applyProjectState({ ...project, metadata: { ...project.metadata, [field]: value } });
  }

  function updateBasic(field: keyof ProjectState["basic_parameters"], value: string) {
    if (!project) return;
    const parsed = Number(value);
    applyProjectState({
      ...project,
      basic_parameters: {
        ...project.basic_parameters,
        [field]:
          field === "wall_type"
            ? normalizeWallTypeValue(value)
            : Number.isFinite(parsed)
              ? parsed
              : value,
      },
    });
  }

  function updateArrayRow<T extends Record<string, unknown>>(
    key:
      | "top_supports"
      | "bottom_supports"
      | "top_wales"
      | "bottom_wales"
      | "top_braces"
      | "bottom_braces"
      | "corner_braces",
    index: number,
    field: keyof T,
    value: string,
  ) {
    if (!project) return;
    const list = [...(project[key] as unknown as T[])];
    const target = { ...list[index] };
    const current = target[field];
    target[field] =
      typeof current === "number" ? (Number(value) as T[keyof T]) : (value as T[keyof T]);
    list[index] = target;
    const nextProject = { ...project, [key]: list, calculation_results: null } as ProjectState;
    applyProjectState(isSupportKey(key) ? cascadeSupportEdit(project, nextProject, key, index) : nextProject);
  }

  function applySectionNameToAll(
    key:
      | "top_supports"
      | "bottom_supports"
      | "top_wales"
      | "bottom_wales"
      | "top_braces"
      | "bottom_braces"
      | "corner_braces",
    sectionName: string,
  ) {
    if (!project || !sectionName) return;
    const nextRows = project[key].map((row) => ({ ...row, section_name: sectionName })) as ProjectState[typeof key];
    const nextProject = { ...project, [key]: nextRows, calculation_results: null } as ProjectState;
    applyProjectState(nextProject);
  }

  function addSupportRow(key: "top_supports" | "bottom_supports") {
    if (!project) return;
    const useDefaultTempForce =
      key === "top_supports"
        ? project.calculation_options.auto_temp_force_top_supports
        : project.calculation_options.auto_temp_force_bottom_supports;
    const list = [...project[key], emptySupportRow(project[key].length, useDefaultTempForce)];
    applyProjectState({ ...project, [key]: list, calculation_results: null } as ProjectState);
  }

  function addWaleRow(key: "top_wales" | "bottom_wales") {
    if (!project) return;
    const seeds = key === "top_wales" ? buildSupportSeeds(project.top_supports) : buildSupportSeeds(project.bottom_supports);
    const list = [...project[key], defaultWaleRowForIndex(project[key], seeds, project[key].length)];
    applyProjectState({ ...project, [key]: list, calculation_results: null } as ProjectState);
  }

  function addBraceRow(key: "top_braces" | "bottom_braces") {
    if (!project) return;
    const seeds = key === "top_braces" ? buildSupportSeeds(project.top_supports) : buildSupportSeeds(project.bottom_supports);
    const list = [...project[key], defaultBraceRowForIndex(project[key], seeds, project[key].length)];
    applyProjectState({ ...project, [key]: list, calculation_results: null } as ProjectState);
  }

  function addCornerBraceRow() {
    if (!project) return;
    const cornerSeeds = buildCornerSeeds(buildSupportSeeds(project.top_supports), buildSupportSeeds(project.bottom_supports));
    applyProjectState({
      ...project,
      corner_braces: [
        ...project.corner_braces,
        defaultCornerBraceRowForIndex(project.corner_braces, cornerSeeds, project.corner_braces.length),
      ],
      calculation_results: null,
    });
  }

  function removeRow(
    key:
      | "top_supports"
      | "bottom_supports"
      | "top_wales"
      | "bottom_wales"
      | "top_braces"
      | "bottom_braces"
      | "corner_braces",
    index: number,
  ) {
    if (!project) return;
    if (isGuardedDependentKey(key)) {
      const minimumRows = minimumDependentRows(project, key);
      if (project[key].length <= minimumRows) {
        setError(`此表至少需保留 ${minimumRows} 列，請先調整支撐層數；若需要更多列，仍可額外新增。`);
        return;
      }
    }
    if (key === "top_supports" || key === "bottom_supports") {
      applyProjectState(syncAfterSupportRemoval(project, key, index));
      setError("");
      return;
    }
    const list = [...project[key]];
    list.splice(index, 1);
    applyProjectState({ ...project, [key]: list, calculation_results: null } as ProjectState);
    setError("");
  }

  function updateColumn(index: number, field: keyof ColumnScenarioInput, value: string) {
    if (!project) return;
    const columns = [...project.columns];
    const next = { ...columns[index] };
    if (columnNullableNumberFields.includes(field)) {
      next[field] = (value === "" ? null : Number(value)) as never;
    } else if (columnNumericFields.includes(field)) {
      next[field] = Number(value) as never;
    } else {
      next[field] = value as never;
    }
    columns[index] = next;
    applyProjectState({ ...project, columns, calculation_results: null });
  }

  function updateColumnEnabled(index: number, enabled: boolean) {
    if (!project) return;
    const columns = [...project.columns];
    const next = { ...columns[index], enabled };
    columns[index] = next;
    applyProjectState({ ...project, columns, calculation_results: null });
  }

  function updateColumnVariant(index: number, variant: ColumnScenarioInput["variant"]) {
    if (!project) return;
    const columns = [...project.columns];
    const current = columns[index];
    const currentTitle = current.title?.trim() ?? "";
    const currentDefaultTitle = columnVariantLabel(current.variant);
    const nextDefaultTitle = columnVariantLabel(variant);
    const next = {
      ...current,
      variant,
      title: currentTitle === "" || currentTitle === currentDefaultTitle ? nextDefaultTitle : current.title,
    };
    columns[index] = next;
    applyProjectState({ ...project, columns, calculation_results: null });
  }

  function addColumnScenario(variant: ColumnScenarioInput["variant"]) {
    if (!project) return;
    const columns = [...project.columns, createColumnScenario(project, variant)];
    applyProjectState({ ...project, columns, calculation_results: null });
    setError("");
  }

  function removeColumnScenario(index: number) {
    if (!project) return;
    const columns = [...project.columns];
    columns.splice(index, 1);
    applyProjectState({ ...project, columns, calculation_results: null });
    setError("");
  }

  function updateCalculationOption(
    field: keyof CalculationOptions,
    enabled: boolean,
  ) {
    if (!project) return;

    const nextOptions = {
      ...project.calculation_options,
      [field]: enabled,
    };
    if (
      !nextOptions.include_top_supports &&
      !nextOptions.include_bottom_supports
    ) {
      setError("水平支撐至少需納入上層或下層其中一側。");
      return;
    }
    applyProjectState({
      ...project,
      calculation_options: nextOptions,
      calculation_results: null,
    });
    setError("");
  }

  function updateAnalysisSourceMode(side: AnalysisSourceSide, mode: AnalysisSourceMode) {
    if (!project) return;
    applyProjectState(setAnalysisSourceModeOnProject(project, side, mode));
    setError("");
  }

  function applyAnalysisWorkflowPreset(
    mode: AnalysisWorkflowMode,
    preferredSide: AnalysisSourceSide = analysisSingleSide,
  ) {
    if (!project) return;

    let nextProject = project;
    const activeSide = preferredSide;
    const passiveSide = otherAnalysisSide(activeSide);
    const activeSource =
      activeSide === "top" ? project.top_analysis_source : project.bottom_analysis_source;
    const passiveSource =
      passiveSide === "top" ? project.top_analysis_source : project.bottom_analysis_source;

    if (mode === "single_manual") {
      nextProject = setAnalysisSourceModeOnProject(nextProject, activeSide, "manual");
      nextProject = setAnalysisSourceModeOnProject(nextProject, passiveSide, "unused");
    } else if (mode === "dual_manual") {
      nextProject = setAnalysisSourceModeOnProject(nextProject, "top", "manual");
      nextProject = setAnalysisSourceModeOnProject(nextProject, "bottom", "manual");
    } else if (mode === "single_import") {
      nextProject = setAnalysisSourceModeOnProject(nextProject, activeSide, "import");
      nextProject = setAnalysisSourceModeOnProject(nextProject, passiveSide, "unused");
    } else if (mode === "dual_import") {
      nextProject = setAnalysisSourceModeOnProject(nextProject, "top", "import");
      nextProject = setAnalysisSourceModeOnProject(nextProject, "bottom", "import");
    } else {
      const activeMode = activeSource.mode === "unused" ? "manual" : activeSource.mode;
      const passiveMode =
        passiveSource.mode === "unused" || passiveSource.mode === activeMode
          ? activeMode === "import"
            ? "manual"
            : "import"
          : passiveSource.mode;
      nextProject = setAnalysisSourceModeOnProject(nextProject, activeSide, activeMode);
      nextProject = setAnalysisSourceModeOnProject(nextProject, passiveSide, passiveMode);
    }

    setAnalysisSingleSide(activeSide);
    applyProjectState(nextProject);
    setError("");
  }

  function updateImportEventClassification(
    side: AnalysisSourceSide,
    eventIndex: number,
    classification: AnalysisEvent["classification"],
  ) {
    if (!project) return;

    const sourceKey = side === "top" ? "top_analysis_source" : "bottom_analysis_source";
    const currentSource = project[sourceKey];
    if (currentSource.import_result.events.length <= eventIndex) return;

    const nextEvents = [...currentSource.import_result.events];
    nextEvents[eventIndex] = {
      ...nextEvents[eventIndex],
      classification,
      included: classification === "support" || classification === "brace",
    };

    applyProjectState({
      ...project,
      [sourceKey]: {
        ...currentSource,
        import_result: {
          ...currentSource.import_result,
          events: nextEvents,
        },
      },
      calculation_results: null,
    } as ProjectState);
    setError("");
  }

  function applyImportAssignmentsToSide(side: AnalysisSourceSide) {
    if (!project) return;

    const source = side === "top" ? project.top_analysis_source : project.bottom_analysis_source;
    const assignments = buildImportedAssignments(source.import_result);
    const supportAssignments = assignments.filter((item) => item.kind === "support");
    const braceAssignments = assignments.filter((item) => item.kind === "brace");
    const nextProject = {
      ...project,
      calculation_options: { ...project.calculation_options },
      calculation_results: null,
    };

    if (side === "top") {
      nextProject.top_supports = supportAssignments.map((item, index) =>
        toCandidateSupportRow(item, project.top_supports, index, project.calculation_options.auto_temp_force_top_supports),
      );
      nextProject.top_braces = braceAssignments.map((item, index) =>
        toCandidateBraceRow(item, project.top_braces, index),
      );
      nextProject.top_wales = [];
      nextProject.calculation_options.include_top_supports = true;
      nextProject.calculation_options.include_top_braces = braceAssignments.length > 0;
      nextProject.calculation_options.include_top_wales = false;
      nextProject.top_analysis_source = {
        ...project.top_analysis_source,
        mode: "import",
      };
    } else {
      nextProject.bottom_supports = supportAssignments.map((item, index) =>
        toCandidateSupportRow(item, project.bottom_supports, index, project.calculation_options.auto_temp_force_bottom_supports),
      );
      nextProject.bottom_braces = braceAssignments.map((item, index) =>
        toCandidateBraceRow(item, project.bottom_braces, index),
      );
      nextProject.bottom_wales = [];
      nextProject.calculation_options.include_bottom_supports = true;
      nextProject.calculation_options.include_bottom_braces = braceAssignments.length > 0;
      nextProject.calculation_options.include_bottom_wales = false;
      nextProject.bottom_analysis_source = {
        ...project.bottom_analysis_source,
        mode: "import",
      };
    }

    if (
      !nextProject.calculation_options.include_top_supports &&
      !nextProject.calculation_options.include_bottom_supports
    ) {
      if (side === "top") {
        nextProject.calculation_options.include_top_supports = true;
      } else {
        nextProject.calculation_options.include_bottom_supports = true;
      }
    }

    applyProjectState(nextProject);
    setError("");
  }

  const [statusCounts, resultOverview] = useMemo(() => {
    const rows = project?.calculation_results ? flattenChecks(project.calculation_results) : [];
    return [
      {
        ok: rows.filter((item) => item.status === "OK").length,
        warn: rows.filter((item) => item.status === "Say~OK").length,
        ng: rows.filter((item) => item.status === "NG").length,
      },
      {
        total: rows.length,
        warnings: project?.calculation_results?.warnings.length ?? 0,
        worstRatio: rows.reduce((max, row) => Math.max(max, normalizedRatio(row.utilization_ratio)), 0),
      },
    ];
  }, [project?.calculation_results]);

  const topImportedStruts = useMemo(
    () => (project ? flattenImportedStruts(project.top_analysis_source.import_result) : []),
    [project?.top_analysis_source],
  );
  const bottomImportedStruts = useMemo(
    () => (project ? flattenImportedStruts(project.bottom_analysis_source.import_result) : []),
    [project?.bottom_analysis_source],
  );
  const topIgnoredImportEvents = useMemo(
    () => (project ? flattenIgnoredImportEvents(project.top_analysis_source.import_result) : []),
    [project?.top_analysis_source],
  );
  const bottomIgnoredImportEvents = useMemo(
    () => (project ? flattenIgnoredImportEvents(project.bottom_analysis_source.import_result) : []),
    [project?.bottom_analysis_source],
  );
  const topImportSummary = useMemo(
    () => (project ? buildImportSummary(project.top_analysis_source.import_result) : emptyImportSummary()),
    [project?.top_analysis_source],
  );
  const bottomImportSummary = useMemo(
    () => (project ? buildImportSummary(project.bottom_analysis_source.import_result) : emptyImportSummary()),
    [project?.bottom_analysis_source],
  );
  const topImportedAssignments = useMemo(
    () => (project ? buildImportedAssignments(project.top_analysis_source.import_result) : []),
    [project?.top_analysis_source],
  );
  const bottomImportedAssignments = useMemo(
    () => (project ? buildImportedAssignments(project.bottom_analysis_source.import_result) : []),
    [project?.bottom_analysis_source],
  );
  const editableSoils = useMemo(
    () => (project ? buildEditableSoils(project) : []),
    [project?.analysis_import.soils, project?.columns],
  );
  const boltSizeKeys = useMemo(
    () => collectBoltSizeKeys(referenceDraft?.bolts ?? bootstrap?.reference_data.bolts ?? []),
    [referenceDraft?.bolts, bootstrap?.reference_data.bolts],
  );
  const referenceDirty = useMemo(() => {
    if (!referenceDraft || !bootstrap) return false;
    return JSON.stringify(referenceDraft) !== JSON.stringify(bootstrap.reference_data);
  }, [referenceDraft, bootstrap?.reference_data]);
  const sectionOptions = useMemo(
    () => buildSectionOptions(referenceDraft?.sections ?? bootstrap?.reference_data.sections ?? []),
    [referenceDraft?.sections, bootstrap?.reference_data.sections],
  );
  const sectionCatalog = useMemo(
    () => referenceDraft?.sections ?? bootstrap?.reference_data.sections ?? [],
    [referenceDraft?.sections, bootstrap?.reference_data.sections],
  );
  const waleWallDeduction = useMemo(
    () => ({
      moment: wallMomentStrength(project?.basic_parameters),
      shear: wallShearStrength(project?.basic_parameters),
    }),
    [project?.basic_parameters],
  );
  const columnSupportCount = useMemo(
    () =>
      project
        ? (project.calculation_options.include_top_supports ? project.top_supports.length : 0) +
          (project.calculation_options.include_bottom_supports ? project.bottom_supports.length : 0)
        : 0,
    [
      project?.calculation_options.include_top_supports,
      project?.calculation_options.include_bottom_supports,
      project?.top_supports,
      project?.bottom_supports,
    ],
  );
  const currentSupportMode = useMemo(
    () => (project ? supportModeLabel(project.calculation_options) : "未設定"),
    [project?.calculation_options],
  );
  const showConcreteWallFields = useMemo(
    () => usesConcreteWallParameters(project?.basic_parameters.wall_type),
    [project?.basic_parameters.wall_type],
  );
  const advancedSettingsCustomCount = useMemo(
    () => countCustomizedAdvancedSettings(project?.basic_parameters),
    [project?.basic_parameters],
  );
  const advancedSettingsSummary = advancedSettingsCustomCount === 0 ? "全部使用預設值" : `已自訂 ${advancedSettingsCustomCount} 項`;
  const analysisWorkflowMode = useMemo(
    () =>
      project
        ? deriveAnalysisWorkflowMode(project.top_analysis_source.mode, project.bottom_analysis_source.mode)
        : "single_manual",
    [project?.top_analysis_source.mode, project?.bottom_analysis_source.mode],
  );
  const displayedSingleSide = useMemo(
    () =>
      project
        ? deriveSingleAnalysisSide(project.top_analysis_source.mode, project.bottom_analysis_source.mode) ??
          analysisSingleSide
        : analysisSingleSide,
    [analysisSingleSide, project?.top_analysis_source.mode, project?.bottom_analysis_source.mode],
  );
  const componentTabItems = useMemo(() => {
    if (!project) {
      return [] as Array<{ key: ComponentTabKey; label: string; note: string; tone: "ok" | "warn" | "muted" }>;
    }
    return [
      {
        key: "support" as const,
        label: "支撐",
        note: buildComponentTabSummary(
          [
            project.calculation_options.include_top_supports
              ? rowCompletionSummary(project.top_supports, isSupportRowComplete)
              : null,
            project.calculation_options.include_bottom_supports
              ? rowCompletionSummary(project.bottom_supports, isSupportRowComplete)
              : null,
          ],
          {
            emptyLabel: "未設定支撐",
            completeLabel: "已齊",
          },
        ),
        tone: buildComponentTabTone(
          [
            project.calculation_options.include_top_supports
              ? rowCompletionSummary(project.top_supports, isSupportRowComplete)
              : null,
            project.calculation_options.include_bottom_supports
              ? rowCompletionSummary(project.bottom_supports, isSupportRowComplete)
              : null,
          ],
        ),
      },
      {
        key: "wale" as const,
        label: "橫擋",
        note: buildComponentTabSummary(
          [
            project.calculation_options.include_top_wales
              ? rowCompletionSummary(project.top_wales, isWaleRowComplete)
              : null,
            project.calculation_options.include_bottom_wales
              ? rowCompletionSummary(project.bottom_wales, isWaleRowComplete)
              : null,
          ],
          {
            emptyLabel: "未納入檢討",
            completeLabel: "已齊",
          },
        ),
        tone: buildComponentTabTone(
          [
            project.calculation_options.include_top_wales
              ? rowCompletionSummary(project.top_wales, isWaleRowComplete)
              : null,
            project.calculation_options.include_bottom_wales
              ? rowCompletionSummary(project.bottom_wales, isWaleRowComplete)
              : null,
          ],
          true,
        ),
      },
      {
        key: "brace" as const,
        label: "斜撐",
        note: buildComponentTabSummary(
          [
            project.calculation_options.include_top_braces
              ? rowCompletionSummary(project.top_braces, isBraceRowComplete)
              : null,
            project.calculation_options.include_bottom_braces
              ? rowCompletionSummary(project.bottom_braces, isBraceRowComplete)
              : null,
          ],
          {
            emptyLabel: "未納入檢討",
            completeLabel: "已齊",
          },
        ),
        tone: buildComponentTabTone(
          [
            project.calculation_options.include_top_braces
              ? rowCompletionSummary(project.top_braces, isBraceRowComplete)
              : null,
            project.calculation_options.include_bottom_braces
              ? rowCompletionSummary(project.bottom_braces, isBraceRowComplete)
              : null,
          ],
          true,
        ),
      },
      {
        key: "corner" as const,
        label: "大角撐",
        note: buildComponentTabSummary(
          [
            project.calculation_options.include_corner_braces
              ? rowCompletionSummary(project.corner_braces, isCornerBraceRowComplete)
              : null,
          ],
          {
            emptyLabel: "未納入檢討",
            completeLabel: "已齊",
          },
        ),
        tone: buildComponentTabTone(
          [
            project.calculation_options.include_corner_braces
              ? rowCompletionSummary(project.corner_braces, isCornerBraceRowComplete)
              : null,
          ],
          true,
        ),
      },
    ];
  }, [project]);
  const topSourceCompletion = useMemo(
    () =>
      project
        ? analysisSourceCompletion(
            project.top_analysis_source.mode,
            project.top_analysis_source,
            project.top_supports,
            topImportedAssignments,
            topImportSummary,
          )
        : "尚未建立",
    [project, topImportedAssignments, topImportSummary],
  );
  const bottomSourceCompletion = useMemo(
    () =>
      project
        ? analysisSourceCompletion(
            project.bottom_analysis_source.mode,
            project.bottom_analysis_source,
            project.bottom_supports,
            bottomImportedAssignments,
            bottomImportSummary,
          )
        : "尚未建立",
    [project, bottomImportedAssignments, bottomImportSummary],
  );
  const stepSummaries = useMemo(() => {
    if (!project) {
      return steps.map(() => ({ text: "待建立", tone: "muted" as const }));
    }

    const metadataFields = [
      project.metadata.name,
      project.metadata.project_code,
      project.metadata.client,
      project.metadata.designer,
      project.metadata.checker,
      project.metadata.location,
    ];
    const metadataCompleted = metadataFields.filter(hasTextValue).length;
    const metadataMissingCount = metadataFields.length - metadataCompleted;

    const activeSourceCompletions = [
      project.top_analysis_source.mode !== "unused"
        ? analysisSourceCompletion(
            project.top_analysis_source.mode,
            project.top_analysis_source,
            project.top_supports,
            topImportedAssignments,
            topImportSummary,
          )
        : null,
      project.bottom_analysis_source.mode !== "unused"
        ? analysisSourceCompletion(
            project.bottom_analysis_source.mode,
            project.bottom_analysis_source,
            project.bottom_supports,
            bottomImportedAssignments,
            bottomImportSummary,
          )
        : null,
    ].filter(Boolean) as string[];
    let analysisSummary: { text: string; tone: "ok" | "warn" | "muted" | "ng" } = {
      text: "待選來源",
      tone: "warn",
    };
    if (activeSourceCompletions.length > 0) {
      if (activeSourceCompletions.some((item) => item.startsWith("待判讀"))) {
        analysisSummary = { text: "待判讀事件", tone: "warn" };
      } else if (activeSourceCompletions.some((item) => item.startsWith("尚未"))) {
        analysisSummary = { text: "待匯入/待填", tone: "warn" };
      } else if (activeSourceCompletions.some((item) => item.startsWith("待補") || item.startsWith("未辨識"))) {
        analysisSummary = { text: "來源待補", tone: "warn" };
      } else {
        analysisSummary = {
          text: activeSourceCompletions.length >= 2 ? "上下層已就緒" : "單側已就緒",
          tone: "ok",
        };
      }
    }

    const basicFields = [
      hasPositiveValue(project.basic_parameters.e_tf_per_cm2),
      hasPositiveValue(project.basic_parameters.fy_tf_per_cm2),
      hasPositiveValue(project.basic_parameters.cm_factor),
      hasPositiveValue(project.basic_parameters.surcharge_wl_tf_per_m),
      hasPositiveValue(project.basic_parameters.alpha_support),
      hasPositiveValue(project.basic_parameters.alpha_wale),
      hasPositiveValue(project.basic_parameters.alpha_brace),
      hasPositiveValue(project.basic_parameters.alpha_corner_brace),
      hasPositiveValue(project.basic_parameters.alpha_column),
      hasPositiveValue(project.basic_parameters.psi_material),
      hasTextValue(project.basic_parameters.wall_type),
      ...(showConcreteWallFields
        ? [
            hasPositiveValue(project.basic_parameters.wall_thickness_cm),
            hasPositiveValue(project.basic_parameters.wall_fc_kg_per_cm2),
          ]
        : []),
    ];
    const missingBasicCount = basicFields.filter((item) => !item).length;
    const validSoils = editableSoils.filter((soil) => hasPositiveValue(soil.depth_m ?? null)).length;
    const projectSettingSummary =
      metadataMissingCount === 0 && missingBasicCount === 0 && validSoils > 0
        ? { text: `基本資料已齊 / 土層 ${validSoils} 層`, tone: "ok" as const }
        : {
            text:
              metadataMissingCount + missingBasicCount > 0
                ? `待補 ${metadataMissingCount + missingBasicCount} 項 / 土層 ${validSoils} 層`
                : `待確認土層 / 目前 ${validSoils} 層`,
            tone: "warn" as const,
          };

    const structuralModuleCompletions = [
      project.calculation_options.include_top_supports ? rowCompletionSummary(project.top_supports, isSupportRowComplete) : null,
      project.calculation_options.include_bottom_supports ? rowCompletionSummary(project.bottom_supports, isSupportRowComplete) : null,
      project.calculation_options.include_top_wales ? rowCompletionSummary(project.top_wales, isWaleRowComplete) : null,
      project.calculation_options.include_bottom_wales ? rowCompletionSummary(project.bottom_wales, isWaleRowComplete) : null,
      project.calculation_options.include_top_braces ? rowCompletionSummary(project.top_braces, isBraceRowComplete) : null,
      project.calculation_options.include_bottom_braces ? rowCompletionSummary(project.bottom_braces, isBraceRowComplete) : null,
      project.calculation_options.include_corner_braces
        ? rowCompletionSummary(project.corner_braces, isCornerBraceRowComplete)
        : null,
    ].filter(Boolean) as string[];
    const structuralIncomplete = structuralModuleCompletions.filter((item) => !item.startsWith("已齊")).length;
    const structuralSummary =
      structuralModuleCompletions.length === 0
        ? { text: "待納入模組", tone: "warn" as const }
        : structuralIncomplete === 0
          ? { text: `${structuralModuleCompletions.length} 模組已齊`, tone: "ok" as const }
          : { text: `待補 ${structuralIncomplete} 模組`, tone: "warn" as const };

    const enabledColumns = project.columns.filter((column) => column.enabled);
    const incompleteColumns = enabledColumns.filter((column) => !columnInputComplete(column)).length;
    const columnSummary =
      enabledColumns.length === 0
        ? { text: "未納入柱構件", tone: "muted" as const }
        : incompleteColumns === 0
          ? { text: `${enabledColumns.length} 情境已齊`, tone: "ok" as const }
          : { text: `待補 ${incompleteColumns} 情境`, tone: "warn" as const };

    let resultSummary: { text: string; tone: "ok" | "warn" | "muted" | "ng" } = { text: "待重算", tone: "muted" };
    if (project.calculation_results) {
      if (statusCounts.ng > 0) resultSummary = { text: `NG ${statusCounts.ng} 項`, tone: "ng" };
      else if (statusCounts.warn > 0) resultSummary = { text: `注意 ${statusCounts.warn} 項`, tone: "warn" };
      else resultSummary = { text: "全數通過", tone: "ok" };
    }

    const reportSummary = !project.calculation_results
      ? { text: "待產出", tone: "muted" as const }
      : reportUrl || wordReportUrl
        ? { text: "已有最新檔案", tone: "ok" as const }
        : { text: "可產出報表", tone: "warn" as const };

    return [
      projectSettingSummary,
      analysisSummary,
      structuralSummary,
      columnSummary,
      resultSummary,
      reportSummary,
    ];
  }, [
    project,
    topImportedAssignments,
    topImportSummary,
    bottomImportedAssignments,
    bottomImportSummary,
    editableSoils,
    showConcreteWallFields,
    statusCounts,
    reportUrl,
    wordReportUrl,
  ]);
  const enabledSummaryLabels = useMemo(() => {
    if (!project?.calculation_results) return [] as string[];
    return availableSummaryColumns(project.calculation_results.summary).map((column) => column.label);
  }, [project?.calculation_results]);
  const projectDirty = useMemo(() => {
    if (!project || !persistedProjectSnapshot) return false;
    return serializeProjectState(project) !== persistedProjectSnapshot;
  }, [project, persistedProjectSnapshot]);
  const projectFreshness = useMemo(() => {
    if (!project) {
      return {
        text: "待建立專案",
        detail: "目前尚未載入專案資料。",
        tone: "muted" as const,
      };
    }
    if (projectDirty) {
      return {
        text: "有未儲存變更",
        detail: "請先儲存專案，避免後續切換或匯出時混淆版本。",
        tone: "warn" as const,
      };
    }
    return {
      text: "專案已儲存",
      detail: `最近儲存：${fmtDateTime(project.metadata.updated_at)}`,
      tone: "ok" as const,
    };
  }, [project, projectDirty]);
  const calculationFreshness = useMemo(() => {
    if (!project?.calculation_results) {
      return {
        text: "待重新計算",
        detail: "最近的輸入異動尚未反映到檢核結果。",
        tone: "warn" as const,
      };
    }
    if (statusCounts.ng > 0) {
      return {
        text: `已有 NG ${statusCounts.ng} 項`,
        detail: "結果已更新，建議先處理不合格項目。",
        tone: "ng" as const,
      };
    }
    if (statusCounts.warn > 0) {
      return {
        text: `已有注意 ${statusCounts.warn} 項`,
        detail: "結果已更新，建議優先確認臨界項目。",
        tone: "warn" as const,
      };
    }
    return {
      text: "檢核結果已更新",
      detail: `最近計算：${fmtDateTime(project.calculation_results.generated_at)}`,
      tone: "ok" as const,
    };
  }, [project?.calculation_results, statusCounts]);
  const reportFreshness = useMemo(() => {
    if (!project?.calculation_results) {
      return {
        text: "報表待重產",
        detail: "請先重新計算，再產出最新 Word / PDF。",
        tone: "muted" as const,
      };
    }
    if (reportUrl || wordReportUrl) {
      return {
        text: "已有本次報表",
        detail: "目前下載連結對應本次計算結果。",
        tone: "ok" as const,
      };
    }
    return {
      text: "尚未產出報表",
      detail: "結果已可用，若要送審可直接產出報表。",
      tone: "warn" as const,
    };
  }, [project?.calculation_results, reportUrl, wordReportUrl]);
  const autoSaveLabel = useMemo(() => {
    if (autoSaving) return "自動儲存中…";
    if (lastAutoSavedAt) return `自動儲存於 ${fmtClock(lastAutoSavedAt)}`;
    return "自動儲存：閒置 30 秒後";
  }, [autoSaving, lastAutoSavedAt]);

  function renderAnalysisSourceCard(
    side: AnalysisSourceSide,
    options?: {
      showModeSelector?: boolean;
      title?: string;
      subtitle?: string;
    },
  ) {
    if (!project) return null;

    const source = side === "top" ? project.top_analysis_source : project.bottom_analysis_source;
    const importedStruts = side === "top" ? topImportedStruts : bottomImportedStruts;
    const ignoredEvents = side === "top" ? topIgnoredImportEvents : bottomIgnoredImportEvents;
    const importSummary = side === "top" ? topImportSummary : bottomImportSummary;
    const importedAssignments = side === "top" ? topImportedAssignments : bottomImportedAssignments;
    const manualRows = side === "top" ? project.top_supports : project.bottom_supports;
    const sideLabel = sidePrefixLabel(side);

    return (
      <AnalysisSourceCard
        key={side}
        title={options?.title ?? `${sideLabel}來源`}
        subtitle={options?.subtitle}
        sideLabel={sideLabel}
        mode={source.mode}
        source={source}
        sectionOptions={sectionOptions}
        importedStruts={importedStruts}
        ignoredEvents={ignoredEvents}
        importSummary={importSummary}
        importedAssignments={importedAssignments}
        manualRows={manualRows}
        showModeSelector={options?.showModeSelector ?? false}
        onModeChange={(mode) => updateAnalysisSourceMode(side, mode)}
        onImport={(event) => void handleImportAnalysis(side, event)}
        onUpdateImportEventClassification={(eventIndex, classification) =>
          updateImportEventClassification(side, eventIndex, classification)
        }
        onApplyAssignments={() => applyImportAssignmentsToSide(side)}
        onAddManualRow={() => addSupportRow(side === "top" ? "top_supports" : "bottom_supports")}
        onRemoveManualRow={(index) =>
          removeRow(side === "top" ? "top_supports" : "bottom_supports", index)
        }
        onChangeManualRow={(index, field, value) =>
          updateArrayRow<SupportRow>(
            side === "top" ? "top_supports" : "bottom_supports",
            index,
            field,
            value,
          )
        }
        onApplySectionToAll={(sectionName) =>
          applySectionNameToAll(side === "top" ? "top_supports" : "bottom_supports", sectionName)
        }
        onGotoDesign={() => setActiveStep(STEP_COMPONENTS)}
      />
    );
  }

  function updateReferenceSection(index: number, field: keyof SectionProperty, value: string) {
    setReferenceDraft((current) => {
      if (!current) return current;
      const sections = [...current.sections];
      const next = { ...sections[index] };
      const currentValue = next[field];
      next[field] =
        typeof currentValue === "number" ? (toNumber(value) as never) : (value as never);
      sections[index] = next;
      return { ...current, sections };
    });
  }

  function addReferenceSection() {
    setReferenceDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: [...current.sections, emptySectionProperty(current.sections.length + 1)],
      };
    });
  }

  function removeReferenceSection(index: number) {
    setReferenceDraft((current) => {
      if (!current) return current;
      const sections = [...current.sections];
      sections.splice(index, 1);
      return { ...current, sections };
    });
  }

  function updateReferenceBolt(index: number, field: keyof BoltStrengthRow, value: string) {
    setReferenceDraft((current) => {
      if (!current) return current;
      const bolts = [...current.bolts];
      const next = { ...bolts[index] };
      if (field === "grade") {
        next.grade = value;
      } else if (field === "ft_tf_per_cm2" || field === "fv_tf_per_cm2") {
        next[field] = toNullableNumber(value);
      }
      bolts[index] = next;
      return { ...current, bolts };
    });
  }

  function updateReferenceBoltSize(index: number, sizeKey: string, value: string) {
    setReferenceDraft((current) => {
      if (!current) return current;
      const bolts = [...current.bolts];
      const next = {
        ...bolts[index],
        sizes: {
          ...bolts[index].sizes,
          [sizeKey]: toNumber(value),
        },
      };
      bolts[index] = next;
      return { ...current, bolts };
    });
  }

  function addReferenceBolt() {
    setReferenceDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        bolts: [...current.bolts, emptyBoltStrengthRow(current.bolts.length + 1, boltSizeKeys)],
      };
    });
  }

  function removeReferenceBolt(index: number) {
    setReferenceDraft((current) => {
      if (!current) return current;
      const bolts = [...current.bolts];
      bolts.splice(index, 1);
      return { ...current, bolts };
    });
  }

  function replaceSoils(nextSoils: SoilLayer[]) {
    if (!project) return;
    const normalized = normalizeSoils(nextSoils);
    applyProjectState({
      ...project,
      analysis_import: {
        ...project.analysis_import,
        soils: normalized,
      },
      columns: syncColumnsFromSoils(project.columns, normalized),
      calculation_results: null,
    });
  }

  function updateSoilRow(index: number, field: keyof SoilLayer, value: string) {
    const rows = [...editableSoils];
    const target = { ...rows[index] };
    const numericFields: Array<keyof SoilLayer> = [
      "depth_m",
      "n_value",
      "unit_weight_t_per_m3",
      "phi_deg",
      "cohesion_t_per_m2",
      "delta_ratio",
      "su_t_per_m2",
      "ka",
      "kp",
      "es_t_per_m2",
      "kh_t_per_m3",
    ];
    if (numericFields.includes(field)) {
      target[field] = (value === "" ? null : Number(value)) as never;
    } else {
      target[field] = value as never;
    }
    rows[index] = target;
    replaceSoils(rows);
  }

  function addSoilRow() {
    replaceSoils([...editableSoils, emptySoilRow(editableSoils.length + 1)]);
  }

  function removeSoilRow(index: number) {
    const rows = [...editableSoils];
    rows.splice(index, 1);
    replaceSoils(rows);
  }

  if (!bootstrap || !project) {
    return (
      <div className="loading-shell">
        <div className="loading-card">
          <h1>擋土支撐計算工具</h1>
          <p>{busy || "載入中..."}</p>
          {error && <p className="error-text">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <p className="eyebrow">Excavation Strut</p>
          <h1>擋土支撐計算平台</h1>
          <p className="brand-note">
            單機本地版，整合分析匯入、構件檢核、彙整結果與 PDF 計算書。
          </p>
        </div>
        <div className="status-card">
          <div className="status-card-item ok">
            <span>OK</span>
            <strong>{statusCounts.ok}</strong>
          </div>
          <div className="status-card-item warn">
            <span>Say~OK</span>
            <strong>{statusCounts.warn}</strong>
          </div>
          <div className="status-card-item ng">
            <span>NG</span>
            <strong>{statusCounts.ng}</strong>
          </div>
        </div>
        <nav className="step-nav">
          {steps.map((step, index) => (
            <button
              key={step}
              className={`step-button ${index === activeStep ? "active" : ""} ${stepSummaries[index]?.tone ?? "muted"}`}
              onClick={() => setActiveStep(index)}
            >
              <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="step-copy">
                <strong>{step}</strong>
                <small className={`step-note ${stepSummaries[index]?.tone ?? "muted"}`}>
                  {stepSummaries[index]?.text ?? "待建立"}
                </small>
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        <header className="toolbar">
          <div className="toolbar-group">
            <label className="toolbar-label">專案</label>
            <select
              value={project.metadata.id ?? ""}
              onChange={(event) => handleProjectSwitch(event.target.value)}
            >
              {projectList.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button className="secondary" onClick={handleCreateProject}>
              新增專案
            </button>
          </div>
          <div className="toolbar-group">
            <button className="secondary" onClick={handleSaveProject} disabled={!projectDirty}>
              {projectDirty ? "儲存變更" : "已儲存"}
            </button>
            <span className="toolbar-label">{autoSaveLabel}</span>
            <button className="secondary" onClick={() => jumpToStep(STEP_RESULTS)}>
              前往檢核結果
            </button>
            <button className="secondary" onClick={() => jumpToStep(STEP_REPORT)}>
              前往報表匯出
            </button>
          </div>
        </header>

        <div className="toolbar-status-strip">
          <div className={`toolbar-status-card ${projectFreshness.tone}`}>
            <span>專案狀態</span>
            <strong>{projectFreshness.text}</strong>
            <small>{projectFreshness.detail}</small>
          </div>
          <div className={`toolbar-status-card ${calculationFreshness.tone}`}>
            <span>檢算狀態</span>
            <strong>{calculationFreshness.text}</strong>
            <small>{calculationFreshness.detail}</small>
          </div>
          <div className={`toolbar-status-card ${reportFreshness.tone}`}>
            <span>報表狀態</span>
            <strong>{reportFreshness.text}</strong>
            <small>{reportFreshness.detail}</small>
          </div>
          <div className="toolbar-status-card muted compact">
            <span>附件模式</span>
            <strong>{reportModeLabel}</strong>
            <small>可於報表匯出頁切換詳細版或簡述版。</small>
          </div>
        </div>

        {busy && <div className="banner-info">處理中：{busy}</div>}
        {error && <div className="banner-error">{error}</div>}

        {activeStep === STEP_PROJECT && (
          <section className="panel-grid">
            <Panel title="專案基本資訊" subtitle="這些欄位會出現在結果頁與 PDF 計算書中。">
              <div className="form-grid">
                <Field label="工程名稱" value={project.metadata.name} onChange={(v) => updateMetadata("name", v)} />
                <Field
                  label="專案代號"
                  value={project.metadata.project_code}
                  onChange={(v) => updateMetadata("project_code", v)}
                />
                <Field label="委託單位" value={project.metadata.client} onChange={(v) => updateMetadata("client", v)} />
                <Field label="設計人員" value={project.metadata.designer} onChange={(v) => updateMetadata("designer", v)} />
                <Field label="校核人員" value={project.metadata.checker} onChange={(v) => updateMetadata("checker", v)} />
                <Field label="單位/公司" value={project.metadata.organization} onChange={(v) => updateMetadata("organization", v)} />
                <Field label="工程位置" value={project.metadata.location} onChange={(v) => updateMetadata("location", v)} />
                <Field
                  label="規範包版本"
                  value={project.metadata.spec_pack_version}
                  onChange={(v) => updateMetadata("spec_pack_version", v)}
                />
              </div>
              <label className="field-block">
                <span>備註</span>
                <textarea
                  rows={5}
                  value={project.metadata.notes}
                  onChange={(event) => updateMetadata("notes", event.target.value)}
                />
              </label>
            </Panel>
            <Panel
              title="參考資料"
              subtitle="以 Excel 為基礎，另外提供本地修改、增加、刪除模式；儲存後會影響後續檢核與 PDF。"
            >
              <div className="meta-grid">
                <MetaItem label="型鋼筆數" value={String(referenceDraft?.sections.length ?? 0)} />
                <MetaItem label="螺栓資料" value={String(referenceDraft?.bolts.length ?? 0)} />
                <MetaItem label="目前模式" value={referenceDirty ? "本地草稿未儲存" : "已同步"} />
              </div>
              <div className="action-row">
                <button className="primary" disabled={!referenceDraft || !referenceDirty} onClick={handleSaveReferenceData}>
                  儲存參考資料
                </button>
                <button className="secondary" disabled={!bootstrap} onClick={handleResetReferenceData}>
                  還原 Excel 原始值
                </button>
              </div>
              <p className="meta-line">
                若變更型鋼名稱，請同步確認支撐/橫擋/斜撐/柱構件中的型號文字；既有專案重新計算時也會使用這份資料。
              </p>
              {referenceDraft && (
                <div className="reference-stack">
                  <details className="reference-group">
                    <summary className="reference-summary">型鋼資料庫</summary>
                    <div className="table-actions">
                      <button className="secondary" onClick={addReferenceSection}>
                        新增型鋼
                      </button>
                    </div>
                    <div className="table-scroll">
                      <table className="data-table compact">
                        <thead>
                          <tr>
                            <th>型號</th>
                            <th>H (cm)</th>
                            <th>B (cm)</th>
                            <th>tw (cm)</th>
                            <th>tf (cm)</th>
                            <th>A (cm2)</th>
                            <th>單重 (kgf/m)</th>
                            <th>Ix (cm4)</th>
                            <th>Iy (cm4)</th>
                            <th>rx (cm)</th>
                            <th>ry (cm)</th>
                            <th>rt (cm)</th>
                            <th>Sx (cm3)</th>
                            <th>Sy (cm3)</th>
                            <th>Zx (cm3)</th>
                            <th>Zy (cm3)</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {referenceDraft.sections.map((section, index) => (
                            <tr key={`${section.name}-${index}`}>
                              <td><input value={section.name} onChange={(event) => updateReferenceSection(index, "name", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.depth_cm} onChange={(event) => updateReferenceSection(index, "depth_cm", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.flange_width_cm} onChange={(event) => updateReferenceSection(index, "flange_width_cm", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.web_thickness_cm} onChange={(event) => updateReferenceSection(index, "web_thickness_cm", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.flange_thickness_cm} onChange={(event) => updateReferenceSection(index, "flange_thickness_cm", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.area_cm2} onChange={(event) => updateReferenceSection(index, "area_cm2", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.unit_weight_kgf_per_m} onChange={(event) => updateReferenceSection(index, "unit_weight_kgf_per_m", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.ix_cm4} onChange={(event) => updateReferenceSection(index, "ix_cm4", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.iy_cm4} onChange={(event) => updateReferenceSection(index, "iy_cm4", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.rx_cm} onChange={(event) => updateReferenceSection(index, "rx_cm", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.ry_cm} onChange={(event) => updateReferenceSection(index, "ry_cm", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.rt_cm} onChange={(event) => updateReferenceSection(index, "rt_cm", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.sx_cm3} onChange={(event) => updateReferenceSection(index, "sx_cm3", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.sy_cm3} onChange={(event) => updateReferenceSection(index, "sy_cm3", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.zx_cm3} onChange={(event) => updateReferenceSection(index, "zx_cm3", event.target.value)} /></td>
                              <td><input type="number" step="any" value={section.zy_cm3} onChange={(event) => updateReferenceSection(index, "zy_cm3", event.target.value)} /></td>
                              <td><button className="ghost" onClick={() => removeReferenceSection(index)}>刪除</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>

                  <details className="reference-group">
                    <summary className="reference-summary">螺栓資料庫</summary>
                    <div className="table-actions">
                      <button className="secondary" onClick={addReferenceBolt}>
                        新增螺栓列
                      </button>
                    </div>
                    <div className="table-scroll">
                      <table className="data-table compact">
                        <thead>
                          <tr>
                            <th>等級</th>
                            <th>Ft (tf/cm2)</th>
                            <th>Fv (tf/cm2)</th>
                            {boltSizeKeys.map((sizeKey) => (
                              <th key={sizeKey}>{sizeKey}</th>
                            ))}
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {referenceDraft.bolts.map((bolt, index) => (
                            <tr key={`${bolt.grade}-${index}`}>
                              <td><input value={bolt.grade} onChange={(event) => updateReferenceBolt(index, "grade", event.target.value)} /></td>
                              <td><input type="number" step="any" value={bolt.ft_tf_per_cm2 ?? ""} onChange={(event) => updateReferenceBolt(index, "ft_tf_per_cm2", event.target.value)} /></td>
                              <td><input type="number" step="any" value={bolt.fv_tf_per_cm2 ?? ""} onChange={(event) => updateReferenceBolt(index, "fv_tf_per_cm2", event.target.value)} /></td>
                              {boltSizeKeys.map((sizeKey) => (
                                <td key={`${bolt.grade}-${sizeKey}`}>
                                  <input
                                    type="number"
                                    step="any"
                                    value={bolt.sizes[sizeKey] ?? 0}
                                    onChange={(event) => updateReferenceBoltSize(index, sizeKey, event.target.value)}
                                  />
                                </td>
                              ))}
                              <td><button className="ghost" onClick={() => removeReferenceBolt(index)}>刪除</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>
              )}
            </Panel>
          </section>
        )}

        {activeStep >= STEP_COMPONENTS && activeStep < STEP_RESULTS && (
          <section
            className={`panel-stack-tight quick-settings-shell ${quickSettingsExpanded ? "expanded" : "collapsed"}`}
          >
            <Panel
              title="常用工具列"
              subtitle="保留常用操作於上方；需要時再展開設定，避免遮住輸入畫面。"
            >
              <div className="quick-top-actions">
                <button className="secondary" type="button" onClick={scrollToTop}>
                  回到頁首
                </button>
                <button className="secondary" type="button" onClick={handleSaveProject}>
                  先存專案
                </button>
                <button className="secondary" type="button" onClick={() => jumpToStep(STEP_REPORT)}>
                  前往報表匯出
                </button>
                <button
                  className={quickSettingsExpanded ? "ghost" : "secondary"}
                  type="button"
                  aria-expanded={quickSettingsExpanded}
                  onClick={() => setQuickSettingsExpanded((expanded) => !expanded)}
                >
                  {quickSettingsExpanded ? "收合常用設定" : "展開常用設定"}
                </button>
              </div>
              <div className="quick-settings-summary">
                <span className="pill">支撐檢討：{currentSupportMode}</span>
                <span className="pill">
                  橫擋牆體扣底：{project.calculation_options.consider_wall_deduction_for_wales ? "考慮" : "不考慮"}
                </span>
                <span className="pill">
                  上層 N2：{project.calculation_options.auto_temp_force_top_supports ? "自動" : "手動"}
                </span>
                <span className="pill">
                  下層 N2：{project.calculation_options.auto_temp_force_bottom_supports ? "自動" : "手動"}
                </span>
                <span className="pill">報表：{reportModeLabel}</span>
              </div>
              {quickSettingsExpanded && (
                <div className="quick-settings-grid">
                  <div className="quick-setting-group">
                    <span className="toolbar-label">支撐模式</span>
                    <div className="pill-row">
                      <button
                        className={`action-pill ${project.calculation_options.include_top_supports && !project.calculation_options.include_bottom_supports ? "active" : ""}`}
                        onClick={() => applyQuickSupportMode("top")}
                      >
                        單向上層
                      </button>
                      <button
                        className={`action-pill ${project.calculation_options.include_bottom_supports && !project.calculation_options.include_top_supports ? "active" : ""}`}
                        onClick={() => applyQuickSupportMode("bottom")}
                      >
                        單向下層
                      </button>
                      <button
                        className={`action-pill ${project.calculation_options.include_top_supports && project.calculation_options.include_bottom_supports ? "active" : ""}`}
                        onClick={() => applyQuickSupportMode("dual")}
                      >
                        雙向支撐
                      </button>
                    </div>
                  </div>
                  <div className="quick-setting-group">
                    <span className="toolbar-label">常用選項</span>
                    <div className="pill-row">
                      <button
                        className={`action-pill ${project.calculation_options.consider_wall_deduction_for_wales ? "active" : ""}`}
                        onClick={() =>
                          updateCalculationOption(
                            "consider_wall_deduction_for_wales",
                            !project.calculation_options.consider_wall_deduction_for_wales,
                          )
                        }
                      >
                        {`橫擋牆體扣底：${project.calculation_options.consider_wall_deduction_for_wales ? "開" : "關"}`}
                      </button>
                      <button
                        className={`action-pill ${project.calculation_options.auto_temp_force_top_supports ? "active" : ""}`}
                        onClick={() =>
                          updateCalculationOption(
                            "auto_temp_force_top_supports",
                            !project.calculation_options.auto_temp_force_top_supports,
                          )
                        }
                      >
                        {`上層 N2 自動：${project.calculation_options.auto_temp_force_top_supports ? "開" : "關"}`}
                      </button>
                      <button
                        className={`action-pill ${project.calculation_options.auto_temp_force_bottom_supports ? "active" : ""}`}
                        onClick={() =>
                          updateCalculationOption(
                            "auto_temp_force_bottom_supports",
                            !project.calculation_options.auto_temp_force_bottom_supports,
                          )
                        }
                      >
                        {`下層 N2 自動：${project.calculation_options.auto_temp_force_bottom_supports ? "開" : "關"}`}
                      </button>
                      <button
                        className={`action-pill ${!conciseReportMode ? "active" : ""}`}
                        onClick={() => setReportMode(false)}
                      >
                        報表：詳細版
                      </button>
                      <button
                        className={`action-pill ${conciseReportMode ? "active" : ""}`}
                        onClick={() => setReportMode(true)}
                      >
                        報表：簡述版
                      </button>
                    </div>
                  </div>
                  <div className="quick-setting-group">
                    <span className="toolbar-label">快速跳轉</span>
                    <div className="pill-row">
                      <button className="action-pill" onClick={() => jumpToStep(STEP_PROJECT)}>專案設定</button>
                      <button className="action-pill" onClick={() => jumpToStep(STEP_COMPONENTS)}>構件輸入</button>
                      <button className="action-pill" onClick={() => jumpToStep(STEP_COLUMNS)}>柱構件</button>
                      <button className="action-pill" onClick={() => jumpToStep(STEP_RESULTS)}>檢核結果</button>
                      <button className="action-pill" onClick={() => jumpToStep(STEP_REPORT)}>報表匯出</button>
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          </section>
        )}

        {activeStep === STEP_ANALYSIS && (
          <section className="panel-stack">
            <Panel title="分析成果分流" subtitle="先選作業方式，再顯示對應的輸入版面；支撐型號可先選，橫擋與斜撐幾何則留到下一步補齊。">
              <div className="workflow-mode-grid">
                {analysisWorkflowOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`workflow-mode-button ${analysisWorkflowMode === option.value ? "active" : ""}`}
                    onClick={() => applyAnalysisWorkflowPreset(option.value)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
              {(analysisWorkflowMode === "single_manual" || analysisWorkflowMode === "single_import") && (
                <div className="workflow-side-row">
                  <span className="workflow-side-label">檢討側別</span>
                  <div className="pill-row">
                    {(["top", "bottom"] as AnalysisSourceSide[]).map((side) => (
                      <button
                        key={side}
                        type="button"
                        className={`pill action-pill ${displayedSingleSide === side ? "active" : ""}`}
                        onClick={() => {
                          setAnalysisSingleSide(side);
                          applyAnalysisWorkflowPreset(analysisWorkflowMode, side);
                        }}
                      >
                        {sidePrefixLabel(side)}檢討
                      </button>
                    ))}
                  </div>
                </div>
              )}
                <div className="workflow-summary">
                  <div className="pill-row">
                    <span className="pill">作業模式：{analysisWorkflowModeLabel(analysisWorkflowMode)}</span>
                    <span className="pill">支撐檢討：{currentSupportMode}</span>
                    <span className="pill">上層來源：{analysisSourceModeLabel(project.top_analysis_source.mode)}</span>
                    <span className="pill">下層來源：{analysisSourceModeLabel(project.bottom_analysis_source.mode)}</span>
                    <span className={`pill ${analysisSourceTone(project.top_analysis_source.mode, topSourceCompletion)}`}>
                      上層資料：{topSourceCompletion}
                    </span>
                    <span className={`pill ${analysisSourceTone(project.bottom_analysis_source.mode, bottomSourceCompletion)}`}>
                      下層資料：{bottomSourceCompletion}
                    </span>
                  </div>
                  <p className="meta-line">{analysisWorkflowHint(analysisWorkflowMode, displayedSingleSide)}</p>
                </div>
              </Panel>

            <div className="panel-stack">
              {(analysisWorkflowMode === "single_manual" || analysisWorkflowMode === "single_import") &&
                renderAnalysisSourceCard(displayedSingleSide, {
                  title: `${sidePrefixLabel(displayedSingleSide)}支撐資料`,
                  subtitle:
                    analysisWorkflowMode === "single_import"
                      ? `本次先整理${sidePrefixLabel(displayedSingleSide)}分析成果，使用整頁版面檢查匯入事件、候選列與支撐草稿。`
                      : `本次只整理${sidePrefixLabel(displayedSingleSide)}手動輸入資料，支數、軸力、溫度力與型號可在同一張表內完成。`,
                })}
              {analysisWorkflowMode === "dual_manual" && (
                <>
                  {renderAnalysisSourceCard("top", {
                    title: "上層手動輸入",
                    subtitle: "完整寬度輸入上層支撐資料，再往下續填下層，不再使用左右窄欄位。",
                  })}
                  {renderAnalysisSourceCard("bottom", {
                    title: "下層手動輸入",
                    subtitle: "雙層手動模式會保留完整寬度，方便對照上層與下層差異。",
                  })}
                </>
              )}
              {analysisWorkflowMode === "dual_import" && (
                <>
                  {renderAnalysisSourceCard("top", {
                    title: "第一步：上層檔案",
                    subtitle: "先匯入上層分析成果，再微調事件分類與候選列。",
                  })}
                  {renderAnalysisSourceCard("bottom", {
                    title: "第二步：下層檔案",
                    subtitle: "下層資料完成後，可再一起前往支撐頁選型號與補幾何。",
                  })}
                </>
              )}
              {analysisWorkflowMode === "mixed" && (
                <>
                  {renderAnalysisSourceCard("top", {
                    title: "上層來源",
                    subtitle: "進階混合模式可讓上層獨立選擇匯入、手動或暫不使用。",
                    showModeSelector: true,
                  })}
                  {renderAnalysisSourceCard("bottom", {
                    title: "下層來源",
                    subtitle: "進階混合模式可讓下層獨立選擇匯入、手動或暫不使用。",
                    showModeSelector: true,
                  })}
                </>
              )}
            </div>

            <Panel title="牆體與土層摘要" subtitle="牆體、開挖深度、水位與土層資料會彙整在此，若辨識不完整可到下一步手動修正。">
              <div className="meta-grid">
                <MetaItem label="匯入來源摘要" value={project.analysis_import.source_name || "人工 / 尚未匯入"} />
                <MetaItem label="來源格式" value={project.analysis_import.source_type || "—"} />
                <MetaItem label="標題" value={project.analysis_import.project_title || "—"} />
                <MetaItem label="開挖深度" value={fmt(project.analysis_import.excavation_depth_m, "m")} />
                <MetaItem label="地下水位" value={fmt(project.analysis_import.ground_water_level_m, "m")} />
                <MetaItem label="牆體 EI" value={fmt(project.analysis_import.wall_ei_tf_m2_per_m)} />
                <MetaItem label="土層筆數" value={String(project.analysis_import.soils.length)} />
                <MetaItem label="施工階段數" value={String(project.analysis_import.stages.length)} />
              </div>
              {project.analysis_import.warnings.length > 0 && (
                <ul className="warning-list">
                  {project.analysis_import.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
              {project.analysis_import.stages.length > 0 && (
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>階段</th>
                      <th>開挖深度 (m)</th>
                      <th>水位 (m)</th>
                      <th>支撐數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.analysis_import.stages.map((stage) => (
                      <tr key={stage.index}>
                        <td>{stage.label}</td>
                        <td>{fmt(stage.excavation_depth_m)}</td>
                        <td>{fmt(stage.water_level_m)}</td>
                        <td>{stage.struts.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </section>
        )}

        {activeStep === STEP_PROJECT && (
          <section className="panel-grid">
            <Panel title="基本材料與牆體參數" subtitle="可依專案需求調整。">
              <div className="form-grid">
                <NumberField label="E (tf/cm2)" value={project.basic_parameters.e_tf_per_cm2} onChange={(v) => updateBasic("e_tf_per_cm2", v)} />
                <NumberField label="Fy (tf/cm2)" value={project.basic_parameters.fy_tf_per_cm2} onChange={(v) => updateBasic("fy_tf_per_cm2", v)} />
                <NumberField label="Cm" value={project.basic_parameters.cm_factor} onChange={(v) => updateBasic("cm_factor", v)} />
                <NumberField label="積載重 WL (tf/m)" value={project.basic_parameters.surcharge_wl_tf_per_m} onChange={(v) => updateBasic("surcharge_wl_tf_per_m", v)} />
                <SelectField label="壁體型式" value={project.basic_parameters.wall_type} options={wallTypeOptions} onChange={(v) => updateBasic("wall_type", v)} />
                {showConcreteWallFields && (
                  <>
                    <NumberField
                      label="壁厚 (cm)"
                      value={project.basic_parameters.wall_thickness_cm}
                      onChange={(v) => updateBasic("wall_thickness_cm", v)}
                    />
                    <NumberField
                      label="混凝土強度 Fc' (kg/cm2)"
                      value={project.basic_parameters.wall_fc_kg_per_cm2}
                      onChange={(v) => updateBasic("wall_fc_kg_per_cm2", v)}
                    />
                  </>
                )}
              </div>
              <div className="advanced-settings-shell">
                <button
                  className="advanced-settings-toggle"
                  type="button"
                  aria-expanded={advancedSettingsExpanded}
                  onClick={() => setAdvancedSettingsExpanded((expanded) => !expanded)}
                >
                  <span>
                    <strong>進階設定</strong>
                    <small>{advancedSettingsSummary}</small>
                  </span>
                  <em>{advancedSettingsExpanded ? "收合" : "展開"}</em>
                </button>
                {advancedSettingsExpanded && (
                  <div className="form-grid advanced-settings-grid">
                    <NumberField label="αs（支撐）" value={project.basic_parameters.alpha_support} onChange={(v) => updateBasic("alpha_support", v)} />
                    <NumberField label="αw（橫擋）" value={project.basic_parameters.alpha_wale} onChange={(v) => updateBasic("alpha_wale", v)} />
                    <NumberField label="αb（斜撐）" value={project.basic_parameters.alpha_brace} onChange={(v) => updateBasic("alpha_brace", v)} />
                    <NumberField label="α角（大角撐）" value={project.basic_parameters.alpha_corner_brace} onChange={(v) => updateBasic("alpha_corner_brace", v)} />
                    <NumberField label="αp（柱）" value={project.basic_parameters.alpha_column} onChange={(v) => updateBasic("alpha_column", v)} />
                    <NumberField label="ψ（材料係數）" value={project.basic_parameters.psi_material} onChange={(v) => updateBasic("psi_material", v)} />
                  </div>
                )}
              </div>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={project.calculation_options.consider_wall_deduction_for_wales}
                  onChange={(event) => updateCalculationOption("consider_wall_deduction_for_wales", event.target.checked)}
                />
                <span>橫擋考慮牆體扣底</span>
              </label>
              <p className="meta-line">勾選時會依 Excel 邏輯扣除牆體可提供的彎矩與剪力強度；取消勾選時則直接以橫擋自身需求檢核。</p>
              <div className="meta-grid">
                <MetaItem label="牆體彎矩 Mwc" value={fmt(waleWallDeduction.moment, "tf-m")} />
                <MetaItem label="牆體剪力 Vwc" value={fmt(waleWallDeduction.shear, "tf")} />
                <MetaItem
                  label="橫擋 ratio 規則"
                  value="取彎矩比與剪力比兩者較大值"
                />
              </div>
            </Panel>
            <Panel
              title="土層匯入與人工調整"
              subtitle="匯入無法辨識時可直接手動建立；深度改動後會自動回填厚度，並同步套用到柱構件貫入檢核。"
            >
              <div className="table-actions">
                <button className="secondary" onClick={addSoilRow}>
                  新增土層
                </button>
                <span className="meta-line">厚度會依本層深度減上一層深度自動計算，第 1 層厚度則等於本層深度。</span>
              </div>
              {editableSoils.length === 0 ? (
                <p className="empty-state">目前沒有土層資料，請先匯入分析檔或手動新增土層。</p>
              ) : (
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>土層名稱</th>
                      <th>厚度 (m)</th>
                      <th>深度 (m)</th>
                      <th>N 值</th>
                      <th>Su (t/m2)</th>
                      <th>單位重</th>
                      <th>phi (deg)</th>
                      <th>c (t/m2)</th>
                      <th>Kh (t/m3)</th>
                      <th>型態</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editableSoils.map((soil, index) => (
                      <tr key={`${soil.index}-${soil.name}-${index}`}>
                        <td>{index + 1}</td>
                        <td>
                          <input
                            value={soil.name}
                            onChange={(event) => updateSoilRow(index, "name", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.thickness_m ?? ""}
                            readOnly
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.depth_m ?? ""}
                            onChange={(event) => updateSoilRow(index, "depth_m", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.n_value ?? ""}
                            onChange={(event) => updateSoilRow(index, "n_value", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.su_t_per_m2 ?? ""}
                            onChange={(event) => updateSoilRow(index, "su_t_per_m2", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.unit_weight_t_per_m3 ?? ""}
                            onChange={(event) =>
                              updateSoilRow(index, "unit_weight_t_per_m3", event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.phi_deg ?? ""}
                            onChange={(event) => updateSoilRow(index, "phi_deg", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.cohesion_t_per_m2 ?? ""}
                            onChange={(event) =>
                              updateSoilRow(index, "cohesion_t_per_m2", event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            value={soil.kh_t_per_m3 ?? ""}
                            onChange={(event) => updateSoilRow(index, "kh_t_per_m3", event.target.value)}
                          />
                        </td>
                        <td>
                          <select
                            value={soil.soil_type}
                            onChange={(event) => updateSoilRow(index, "soil_type", event.target.value)}
                          >
                            <option value="sand">砂土</option>
                            <option value="clay">黏土</option>
                            <option value="mixed">混合</option>
                          </select>
                        </td>
                        <td>
                          <button className="ghost" onClick={() => removeSoilRow(index)}>
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </section>
        )}

        {activeStep === STEP_COMPONENTS && (
          <section className="panel-stack">
            <Panel
              title="構件輸入"
              subtitle="改以頁籤切換支撐、橫擋、斜撐與大角撐，降低頁面長度；各頁籤會同步顯示填表狀態。"
            >
              <div className="meta-grid">
                <MetaItem
                  label="支撐模式"
                  value={supportModeLabel(project.calculation_options)}
                />
                <MetaItem
                  label="上層支撐"
                  value={project.calculation_options.include_top_supports ? "考慮" : "不考慮"}
                />
                <MetaItem
                  label="下層支撐"
                  value={project.calculation_options.include_bottom_supports ? "考慮" : "不考慮"}
                />
              </div>
              <div className="component-tab-bar" role="tablist" aria-label="構件輸入頁籤">
                {componentTabItems.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={componentTab === tab.key}
                    className={`component-tab-button ${componentTab === tab.key ? "active" : ""} ${tab.tone}`}
                    onClick={() => setComponentTab(tab.key)}
                  >
                    <strong>{tab.label}</strong>
                    <span>{tab.note}</span>
                  </button>
                ))}
              </div>
            </Panel>
            {componentTab === "support" && (
              <section className="panel-stack-tight">
                <Panel title="支撐局部捷徑" subtitle="雙向支撐時可直接在上、下層支撐間切換；未納入的一側會以精簡卡片顯示。">
                  <div className="pill-row">
                    <button
                      className={`action-pill ${project.calculation_options.include_top_supports ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COMPONENTS, "top-supports-panel")}
                    >
                      {moduleShortcutLabel("上層支撐", project.calculation_options.include_top_supports, project.top_supports.length, rowCompletionSummary(project.top_supports, isSupportRowComplete))}
                    </button>
                    <button
                      className={`action-pill ${project.calculation_options.include_bottom_supports ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COMPONENTS, "bottom-supports-panel")}
                    >
                      {moduleShortcutLabel("下層支撐", project.calculation_options.include_bottom_supports, project.bottom_supports.length, rowCompletionSummary(project.bottom_supports, isSupportRowComplete))}
                    </button>
                  </div>
                </Panel>
                <div id="top-supports-panel" className={panelFocusClass(highlightPanelId, "top-supports-panel")}>
                  {project.calculation_options.include_top_supports ? (
                    <EditableSupportTable
                      title={editingModuleTitle("top", "水平支撐", project.calculation_options.include_top_supports, project.calculation_options.include_bottom_supports)}
                      subtitle="支撐為必算項目；至少需納入上層或下層其中一側。"
                      enabled={project.calculation_options.include_top_supports}
                      useDefaultTempForce={project.calculation_options.auto_temp_force_top_supports}
                      sectionOptions={sectionOptions}
                      onToggle={(enabled) => updateCalculationOption("include_top_supports", enabled)}
                      onToggleDefaultTempForce={(enabled) => updateCalculationOption("auto_temp_force_top_supports", enabled)}
                      rows={project.top_supports}
                      onAdd={() => addSupportRow("top_supports")}
                      onRemove={(index) => removeRow("top_supports", index)}
                      onChange={(index, field, value) => updateArrayRow<SupportRow>("top_supports", index, field, value)}
                      onApplySectionToAll={(sectionName) => applySectionNameToAll("top_supports", sectionName)}
                    />
                  ) : (
                    <ModuleCollapsedCard
                      title="上層水平支撐"
                      description="目前未納入上層支撐檢討；如本案需要雙向支撐或上層控制，可在此直接啟用。"
                      onEnable={() => updateCalculationOption("include_top_supports", true)}
                    />
                  )}
                </div>
                <div id="bottom-supports-panel" className={panelFocusClass(highlightPanelId, "bottom-supports-panel")}>
                  {project.calculation_options.include_bottom_supports ? (
                    <EditableSupportTable
                      title={editingModuleTitle("bottom", "水平支撐", project.calculation_options.include_top_supports, project.calculation_options.include_bottom_supports)}
                      subtitle="若同時納入上下層，即視為雙向支撐模式。"
                      enabled={project.calculation_options.include_bottom_supports}
                      useDefaultTempForce={project.calculation_options.auto_temp_force_bottom_supports}
                      sectionOptions={sectionOptions}
                      onToggle={(enabled) => updateCalculationOption("include_bottom_supports", enabled)}
                      onToggleDefaultTempForce={(enabled) => updateCalculationOption("auto_temp_force_bottom_supports", enabled)}
                      rows={project.bottom_supports}
                      onAdd={() => addSupportRow("bottom_supports")}
                      onRemove={(index) => removeRow("bottom_supports", index)}
                      onChange={(index, field, value) => updateArrayRow<SupportRow>("bottom_supports", index, field, value)}
                      onApplySectionToAll={(sectionName) => applySectionNameToAll("bottom_supports", sectionName)}
                    />
                  ) : (
                    <ModuleCollapsedCard
                      title="下層水平支撐"
                      description="目前未納入下層支撐檢討；若本案為雙向支撐，可在此快速啟用下層資料。"
                      onEnable={() => updateCalculationOption("include_bottom_supports", true)}
                    />
                  )}
                </div>
              </section>
            )}
            {componentTab === "wale" && (
              <section className="panel-stack-tight">
                <Panel title="橫擋局部捷徑" subtitle="可快速在上、下層橫擋間切換；不考慮的一側會改成精簡提示。">
                  <div className="pill-row">
                    <button
                      className={`action-pill ${project.calculation_options.include_top_wales ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COMPONENTS, "top-wales-panel")}
                    >
                      {moduleShortcutLabel("上層橫擋", project.calculation_options.include_top_wales, project.top_wales.length, rowCompletionSummary(project.top_wales, isWaleRowComplete))}
                    </button>
                    <button
                      className={`action-pill ${project.calculation_options.include_bottom_wales ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COMPONENTS, "bottom-wales-panel")}
                    >
                      {moduleShortcutLabel("下層橫擋", project.calculation_options.include_bottom_wales, project.bottom_wales.length, rowCompletionSummary(project.bottom_wales, isWaleRowComplete))}
                    </button>
                  </div>
                </Panel>
                <div id="top-wales-panel" className={panelFocusClass(highlightPanelId, "top-wales-panel")}>
                  {project.calculation_options.include_top_wales ? (
                    <EditableWaleTable
                      title={editingModuleTitle("top", "橫擋", project.calculation_options.include_top_wales, project.calculation_options.include_bottom_wales)}
                      enabled={project.calculation_options.include_top_wales}
                      minimumRows={minimumDependentRows(project, "top_wales")}
                      sectionOptions={sectionOptions}
                      onToggle={(enabled) => updateCalculationOption("include_top_wales", enabled)}
                      rows={project.top_wales}
                      onAdd={() => addWaleRow("top_wales")}
                      onRemove={(index) => removeRow("top_wales", index)}
                      onChange={(index, field, value) => updateArrayRow<WaleRow>("top_wales", index, field, value)}
                      onApplySectionToAll={(sectionName) => applySectionNameToAll("top_wales", sectionName)}
                    />
                  ) : (
                    <ModuleCollapsedCard
                      title="上層橫擋"
                      description="此側目前不納入橫擋檢討；若需比對牆體扣底與跨度控制，可在此直接啟用。"
                      onEnable={() => updateCalculationOption("include_top_wales", true)}
                    />
                  )}
                </div>
                <div id="bottom-wales-panel" className={panelFocusClass(highlightPanelId, "bottom-wales-panel")}>
                  {project.calculation_options.include_bottom_wales ? (
                    <EditableWaleTable
                      title={editingModuleTitle("bottom", "橫擋", project.calculation_options.include_top_wales, project.calculation_options.include_bottom_wales)}
                      enabled={project.calculation_options.include_bottom_wales}
                      minimumRows={minimumDependentRows(project, "bottom_wales")}
                      sectionOptions={sectionOptions}
                      onToggle={(enabled) => updateCalculationOption("include_bottom_wales", enabled)}
                      rows={project.bottom_wales}
                      onAdd={() => addWaleRow("bottom_wales")}
                      onRemove={(index) => removeRow("bottom_wales", index)}
                      onChange={(index, field, value) => updateArrayRow<WaleRow>("bottom_wales", index, field, value)}
                      onApplySectionToAll={(sectionName) => applySectionNameToAll("bottom_wales", sectionName)}
                    />
                  ) : (
                    <ModuleCollapsedCard
                      title="下層橫擋"
                      description="此側目前不納入橫擋檢討；若需檢視下層跨度與型號，可在此快速啟用。"
                      onEnable={() => updateCalculationOption("include_bottom_wales", true)}
                    />
                  )}
                </div>
              </section>
            )}
            {componentTab === "brace" && (
              <section className="panel-stack-tight">
                <Panel title="斜撐局部捷徑" subtitle="可快速切換上、下層斜撐；不考慮的一側僅保留精簡啟用卡片。">
                  <div className="pill-row">
                    <button
                      className={`action-pill ${project.calculation_options.include_top_braces ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COMPONENTS, "top-braces-panel")}
                    >
                      {moduleShortcutLabel("上層斜撐", project.calculation_options.include_top_braces, project.top_braces.length, rowCompletionSummary(project.top_braces, isBraceRowComplete))}
                    </button>
                    <button
                      className={`action-pill ${project.calculation_options.include_bottom_braces ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COMPONENTS, "bottom-braces-panel")}
                    >
                      {moduleShortcutLabel("下層斜撐", project.calculation_options.include_bottom_braces, project.bottom_braces.length, rowCompletionSummary(project.bottom_braces, isBraceRowComplete))}
                    </button>
                  </div>
                </Panel>
                <div id="top-braces-panel" className={panelFocusClass(highlightPanelId, "top-braces-panel")}>
                  {project.calculation_options.include_top_braces ? (
                    <EditableBraceTable
                      title={editingModuleTitle("top", "斜撐", project.calculation_options.include_top_braces, project.calculation_options.include_bottom_braces)}
                      enabled={project.calculation_options.include_top_braces}
                      minimumRows={minimumDependentRows(project, "top_braces")}
                      sectionOptions={sectionOptions}
                      onToggle={(enabled) => updateCalculationOption("include_top_braces", enabled)}
                      rows={project.top_braces}
                      onAdd={() => addBraceRow("top_braces")}
                      onRemove={(index) => removeRow("top_braces", index)}
                      onChange={(index, field, value) => updateArrayRow<BraceRow>("top_braces", index, field, value)}
                      onApplySectionToAll={(sectionName) => applySectionNameToAll("top_braces", sectionName)}
                    />
                  ) : (
                    <ModuleCollapsedCard
                      title="上層斜撐"
                      description="目前未納入上層斜撐檢討；若本案需檢核 L1、L2 與斜撐型號，可在此啟用。"
                      onEnable={() => updateCalculationOption("include_top_braces", true)}
                    />
                  )}
                </div>
                <div id="bottom-braces-panel" className={panelFocusClass(highlightPanelId, "bottom-braces-panel")}>
                  {project.calculation_options.include_bottom_braces ? (
                    <EditableBraceTable
                      title={editingModuleTitle("bottom", "斜撐", project.calculation_options.include_top_braces, project.calculation_options.include_bottom_braces)}
                      enabled={project.calculation_options.include_bottom_braces}
                      minimumRows={minimumDependentRows(project, "bottom_braces")}
                      sectionOptions={sectionOptions}
                      onToggle={(enabled) => updateCalculationOption("include_bottom_braces", enabled)}
                      rows={project.bottom_braces}
                      onAdd={() => addBraceRow("bottom_braces")}
                      onRemove={(index) => removeRow("bottom_braces", index)}
                      onChange={(index, field, value) => updateArrayRow<BraceRow>("bottom_braces", index, field, value)}
                      onApplySectionToAll={(sectionName) => applySectionNameToAll("bottom_braces", sectionName)}
                    />
                  ) : (
                    <ModuleCollapsedCard
                      title="下層斜撐"
                      description="目前未納入下層斜撐檢討；若後續要補下層斜撐幾何，可在此快速啟用。"
                      onEnable={() => updateCalculationOption("include_bottom_braces", true)}
                    />
                  )}
                </div>
              </section>
            )}
            {componentTab === "corner" && (
              <section className="panel-stack-tight">
                <Panel title="大角撐捷徑" subtitle="大角撐通常僅在需要時檢討；未啟用時改以精簡卡片呈現。">
                  <div className="pill-row">
                    <button
                      className={`action-pill ${project.calculation_options.include_corner_braces ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COMPONENTS, "corner-braces-panel")}
                    >
                      {moduleShortcutLabel("大角撐", project.calculation_options.include_corner_braces, project.corner_braces.length, rowCompletionSummary(project.corner_braces, isCornerBraceRowComplete))}
                    </button>
                  </div>
                </Panel>
                <div id="corner-braces-panel" className={panelFocusClass(highlightPanelId, "corner-braces-panel")}>
                  {project.calculation_options.include_corner_braces ? (
                    <EditableCornerBraceTable
                      title="大角撐"
                      enabled={project.calculation_options.include_corner_braces}
                      minimumRows={minimumDependentRows(project, "corner_braces")}
                      sectionOptions={sectionOptions}
                      onToggle={(enabled) => updateCalculationOption("include_corner_braces", enabled)}
                      rows={project.corner_braces}
                      onAdd={addCornerBraceRow}
                      onRemove={(index) => removeRow("corner_braces", index)}
                      onChange={(index, field, value) => updateArrayRow<CornerBraceRow>("corner_braces", index, field, value)}
                      onApplySectionToAll={(sectionName) => applySectionNameToAll("corner_braces", sectionName)}
                    />
                  ) : (
                    <ModuleCollapsedCard
                      title="大角撐"
                      description="目前未納入大角撐檢討；若本案需比對角隅構件軸力與型號，可在此快速啟用。"
                      onEnable={() => updateCalculationOption("include_corner_braces", true)}
                    />
                  )}
                </div>
              </section>
            )}
          </section>
        )}

        {activeStep === STEP_COLUMNS && (
          <section id="column-settings-panel" className={`panel-stack ${panelFocusClass(highlightPanelId, "column-settings-panel")}`}>
            <Panel title="柱構件情境管理" subtitle="可依本案需求新增中間柱或共構柱情境，並於後續逐一納入或排除檢討。">
              <div className="action-row">
                <button className="secondary" type="button" onClick={() => addColumnScenario("middle")}>
                  新增中間柱
                </button>
                <button className="secondary" type="button" onClick={() => addColumnScenario("composite_normal")}>
                  新增共構柱（一般）
                </button>
                <button className="secondary" type="button" onClick={() => addColumnScenario("composite_crane")}>
                  新增共構柱（大吊車）
                </button>
              </div>
              <p className="meta-line">基礎形式與斷面形狀已改為固定選單，避免自由輸入造成係數或形狀判讀錯誤。</p>
            </Panel>
            {project.columns.length > 1 && (
              <Panel title="柱構件捷徑" subtitle="快速定位到各柱構件情境，適合有多組中間柱或共構柱時使用。">
                <div className="pill-row">
                  {project.columns.map((column, index) => (
                    <button
                      key={`${column.variant}-${index}-jump`}
                      className={`action-pill ${column.enabled ? "active" : ""}`}
                      onClick={() => jumpToStep(STEP_COLUMNS, `column-panel-${index}`)}
                    >
                      {moduleShortcutLabel(
                        column.title || columnVariantLabel(column.variant),
                        column.enabled,
                        1,
                        columnCompletionSummary(column),
                      )}
                    </button>
                  ))}
                </div>
              </Panel>
            )}
            {project.columns.map((column, index) => (
              <div id={`column-panel-${index}`} key={`${column.variant}-${index}`} className={panelFocusClass(highlightPanelId, `column-panel-${index}`)}>
                {(() => {
                  const selectedSection = sectionCatalog.find((section) => section.name === column.column_section_name) ?? null;
                  return (
                <Panel
                  title={column.title || columnVariantLabel(column.variant)}
                  subtitle="用核取方塊決定是否納入檢討；未勾選者不參與計算、摘要與報表。"
                >
                  <div className="table-actions">
                    <label className="field-block inline-field">
                      <span>情境類型</span>
                      <select
                        value={column.variant}
                        onChange={(event) => updateColumnVariant(index, event.target.value as ColumnScenarioInput["variant"])}
                      >
                        {columnVariantOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="ghost" type="button" onClick={() => removeColumnScenario(index)}>
                      刪除此情境
                    </button>
                  </div>
                  <div className="form-grid">
                    <Field
                      label="情境名稱"
                      value={column.title}
                      onChange={(value) => updateColumn(index, "title", value)}
                    />
                  </div>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={column.enabled}
                      onChange={(event) => updateColumnEnabled(index, event.target.checked)}
                    />
                    <span>納入檢討</span>
                  </label>
                  {!column.enabled && (
                    <CollapsedModuleHint text="此柱構件情境目前未納入檢討；若本案需要檢算，勾選後即可展開完整柱構件參數。" />
                  )}
                  <fieldset className="fieldset-reset" disabled={!column.enabled}>
                    {column.enabled && (
                    <>
                    <div className="form-grid">
                      <label className="field-block">
                        <span>柱型鋼</span>
                        <SectionSelectInput
                          value={column.column_section_name}
                          options={sectionOptions}
                          placeholder="請選擇柱型鋼"
                          onChange={(value) => updateColumn(index, "column_section_name", value)}
                        />
                      </label>
                      <SelectField
                        label="基礎形式"
                        value={column.foundation_type}
                        options={foundationTypeOptions}
                        onChange={(value) => updateColumn(index, "foundation_type", value)}
                      />
                      <SelectField
                        label="斷面形狀"
                        value={column.foundation_shape}
                        options={foundationShapeOptions}
                        onChange={(value) => updateColumn(index, "foundation_shape", value)}
                      />
                      <NumberField
                        label="斷面尺寸 X (m)"
                        value={column.foundation_size_x_m}
                        onChange={(value) => updateColumn(index, "foundation_size_x_m", value)}
                      />
                      <NumberField
                        label="斷面尺寸 Y (m)"
                        value={column.foundation_size_y_m}
                        onChange={(value) => updateColumn(index, "foundation_size_y_m", value)}
                      />
                      <NumberField
                        label="柱長 L (m)"
                        value={column.column_length_m}
                        onChange={(value) => updateColumn(index, "column_length_m", value)}
                      />
                      <NumberField
                        label="地盤反力係數 kh (kg/cm3)"
                        value={column.kh_kg_per_cm3}
                        onChange={(value) => updateColumn(index, "kh_kg_per_cm3", value)}
                      />
                      <OptionalNumberField
                        label="樁寬 b (cm)"
                        value={column.pile_width_cm}
                        placeholder={`系統預設 ${fmt(selectedSection?.flange_width_cm ?? null, "cm")}`}
                        onChange={(value) => updateColumn(index, "pile_width_cm", value)}
                      />
                      <OptionalNumberField
                        label="偏心 ex (m)"
                        value={column.eccentricity_x_m}
                        placeholder={`系統預設 ${fmt(defaultColumnEccentricityX(column, selectedSection), "m")}`}
                        onChange={(value) => updateColumn(index, "eccentricity_x_m", value)}
                      />
                      <NumberField
                        label="偏心 ey (m)"
                        value={column.eccentricity_y_m}
                        onChange={(value) => updateColumn(index, "eccentricity_y_m", value)}
                      />
                      <NumberField
                        label="開挖面距最下支撐 (m)"
                        value={column.bottom_to_excavation_distance_m}
                        onChange={(value) => updateColumn(index, "bottom_to_excavation_distance_m", value)}
                      />
                      <NumberField
                        label="貫入深度 (cm)"
                        value={column.embedment_length_cm}
                        onChange={(value) => updateColumn(index, "embedment_length_cm", value)}
                      />
                      <NumberField
                        label="混凝土強度 fc' (kg/cm2)"
                        value={column.concrete_strength_kg_per_cm2}
                        onChange={(value) => updateColumn(index, "concrete_strength_kg_per_cm2", value)}
                      />
                      <NumberField
                        label="壓力 FS（樁）"
                        value={column.compression_fs}
                        onChange={(value) => updateColumn(index, "compression_fs", value)}
                      />
                      <NumberField
                        label="拔力 FS（樁）"
                        value={column.tension_fs}
                        onChange={(value) => updateColumn(index, "tension_fs", value)}
                      />
                      <NumberField
                        label="樁單位重 (tf/m3)"
                        value={column.pile_unit_weight_t_per_m3}
                        onChange={(value) => updateColumn(index, "pile_unit_weight_t_per_m3", value)}
                      />
                    </div>
                    </>
                    )}
                  </fieldset>
                  <p className="meta-line">
                    目前支撐列數：{columnSupportCount}，土層列數：{column.soil_layers.length}
                  </p>
                  {column.enabled && column.eccentricity_x_m === null && (
                    <p className="meta-line">偏心 ex 未指定時，系統將依柱型鋼深度自動取值，目前預設為 {fmt(defaultColumnEccentricityX(column, selectedSection), "m")}。</p>
                  )}
                  {column.enabled && (
                    <p className={`meta-line ${columnCompletionSummary(column).startsWith("待補") ? "attention-line" : ""}`}>
                      填表狀態：{columnCompletionSummary(column)}
                    </p>
                  )}
                </Panel>
                  );
                })()}
              </div>
            ))}
          </section>
        )}

        {activeStep === STEP_RESULTS && (
          <section className="panel-stack">
            <div className={`recalc-banner ${project.calculation_results ? calculationFreshness.tone : "warn"}`}>
              <div className="recalc-banner-copy">
                <strong>{project.calculation_results ? calculationFreshness.text : "資料已變更，請重新計算"}</strong>
                <span>
                  {project.calculation_results
                    ? calculationFreshness.detail
                    : "目前頁面中的輸入已更新，但檢核結果尚未同步；請先重新計算後再確認控制層與報表。"}
                </span>
              </div>
              <button className="primary" type="button" onClick={handleCalculate}>
                {project.calculation_results ? "重新計算" : "開始計算"}
              </button>
            </div>
            <div className="result-overview-grid">
              <div className="result-overview-card ok">
                <span>通過項目</span>
                <strong>{statusCounts.ok}</strong>
                <p>已完成檢核且結果通過。</p>
              </div>
              <div className="result-overview-card warn">
                <span>注意項目</span>
                <strong>{statusCounts.warn}</strong>
                <p>接近控制值或需工程師留意。</p>
              </div>
              <div className="result-overview-card ng">
                <span>不合格項目</span>
                <strong>{statusCounts.ng}</strong>
                <p>建議優先回到對應構件檢查。</p>
              </div>
              <div className="result-overview-card focus">
                <span>最不利比值</span>
                <strong>{fmtRatio(resultOverview.worstRatio)}</strong>
                <p>{`本次共 ${resultOverview.total} 筆檢核，另有 ${resultOverview.warnings} 則系統警示。`}</p>
              </div>
            </div>
            <Panel
              title="分層檢核摘要"
              subtitle={
                enabledSummaryLabels.length > 0
                  ? `僅顯示本案已納入之${enabledSummaryLabels.join("、")}，並標註採用型號，方便直接比對每層的 OK / NG 與設計斷面。`
                  : "同一層構件合併顯示，並標註採用型號，方便直接比對每層的 OK / NG 與設計斷面。"
              }
            >
              {project.calculation_results ? (
                <LevelSummaryTable rows={project.calculation_results.summary} options={project.calculation_options} />
              ) : (
                <p className="empty-state">尚未產生檢核結果。請先點選本頁上方「開始計算」。</p>
              )}
            </Panel>
            <section className="panel-grid">
              <Panel title="柱構件摘要" subtitle="獨立整理柱構件結果，避免和分層支撐混在一起。">
                {project.calculation_results && project.calculation_results.column_checks.length > 0 ? (
                  <ColumnSummaryTable rows={project.calculation_results.column_checks} onLocate={() => jumpToStep(STEP_COLUMNS)} />
                ) : (
                  <p className="empty-state">本案目前未勾選中間柱 / 共構柱檢討。</p>
                )}
              </Panel>
              <Panel title="重點控制項目" subtitle="優先列出 NG / Say~OK；可直接定位回需要修正的設定頁。">
                {project.calculation_results ? (
                  <KeyControlTable
                    rows={flattenChecks(project.calculation_results)}
                    options={project.calculation_options}
                    onLocate={jumpToStep}
                  />
                ) : (
                  <p className="empty-state">尚未產生檢核結果。</p>
                )}
              </Panel>
            </section>
          </section>
        )}

        {activeStep === STEP_REPORT && (
          <section className="panel-grid">
            <Panel title="報表匯出" subtitle="可產出 PDF 正式版與 Word 編修版，便於審查、整編及納入主文。">
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={conciseReportMode}
                  onChange={(event) => setReportMode(event.target.checked)}
                />
                <span>簡述版：各節首筆詳算，其餘以關鍵值摘要列示</span>
              </label>
              <div className="report-mode-card">
                <strong>{`目前準備輸出：${reportModeLabel}`}</strong>
                <span>切換附件編排方式後，系統會清除上一版下載連結，避免誤取舊檔。</span>
              </div>
              <div className="action-row">
                <button className="primary" onClick={handleGenerateReport} disabled={!project.calculation_results}>
                  {`產出 PDF 正式版（${reportModeLabel}）`}
                </button>
                <button className="secondary" onClick={handleGenerateWordReport} disabled={!project.calculation_results}>
                  {`產出 Word 編修版（${reportModeLabel}）`}
                </button>
              </div>
               {!project.calculation_results && (
                <p className="meta-line attention-line">目前尚無最新檢核結果，請先重新計算後再產出報表。</p>
              )}
              {(reportUrl || wordReportUrl) && (
                <div className="generated-report-list">
                  {reportUrl && (
                    <a className="generated-report-link" href={reportUrl} target="_blank" rel="noreferrer">
                      <strong>本次 PDF 正式版</strong>
                      <span>{generatedPdfMode === "concise" ? "簡述版" : "詳細版"}</span>
                      <em>{extractDownloadFilename(reportUrl)}</em>
                    </a>
                  )}
                  {wordReportUrl && (
                    <a className="generated-report-link" href={wordReportUrl} target="_blank" rel="noreferrer">
                      <strong>本次 Word 編修版</strong>
                      <span>{generatedWordMode === "concise" ? "簡述版" : "詳細版"}</span>
                      <em>{extractDownloadFilename(wordReportUrl)}</em>
                    </a>
                  )}
                </div>
              )}
              <p className="meta-line">
                {`目前附件編排方式為${reportModeLabel}。Word 與 PDF 皆包含摘要、輸入基本資料、分析匯入結果、結果彙整與主要檢核內容；簡述版附件改採首筆詳算、後續摘要列示，詳細版則維持逐筆完整展開。`}
              </p>
            </Panel>
            <Panel title="匯出前檢查" subtitle="建議先確認計算結果與警示清單。">
              {project.calculation_results?.warnings.length ? (
                <ul className="warning-list">
                  {project.calculation_results.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">目前沒有額外警示。</p>
              )}
            </Panel>
          </section>
        )}
        {showScrollTop && (
          <button className="primary floating-top-button" type="button" onClick={scrollToTop}>
            回到頁首
          </button>
        )}
      </main>
    </div>
  );
}

function Panel(props: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <p className="panel-title">{props.title}</p>
          {props.subtitle && <p className="panel-subtitle">{props.subtitle}</p>}
        </div>
      </header>
      {props.children}
    </section>
  );
}

function Field(props: { label: string; value: string | number; onChange: (value: string) => void }) {
  return (
    <label className="field-block">
      <span>{props.label}</span>
      <input value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function NumberField(props: { label: string; value: number; onChange: (value: string) => void }) {
  return (
    <label className="field-block">
      <span>{props.label}</span>
      <input type="number" step="any" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-block">
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function OptionalNumberField(props: {
  label: string;
  value: number | null | undefined;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-block">
      <span>{props.label}</span>
      <input
        type="number"
        step="any"
        value={props.value ?? ""}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function SectionSelectInput(props: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const options = props.value && !props.options.includes(props.value)
    ? [props.value, ...props.options]
    : props.options;
  return (
    <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
      <option value="">{props.placeholder ?? "請選擇型號"}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function MetaItem(props: { label: string; value: string }) {
  return (
    <div className="meta-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function CollapsedModuleHint(props: { text: string }) {
  return <p className="collapsed-module-hint">{props.text}</p>;
}

function ModuleCollapsedCard(props: { title: string; description: string; onEnable: () => void }) {
  return (
    <div className="module-collapsed-card">
      <div className="module-collapsed-copy">
        <strong>{props.title}</strong>
        <p>{props.description}</p>
      </div>
      <button className="secondary" type="button" onClick={props.onEnable}>
        納入檢討
      </button>
    </div>
  );
}

function AnalysisSourceCard(props: {
  title: string;
  subtitle?: string;
  sideLabel: string;
  mode: AnalysisSourceMode;
  source: AnalysisSideSource;
  sectionOptions: string[];
  importedStruts: ImportedStrutRow[];
  ignoredEvents: ImportedIgnoredEventRow[];
  importSummary: ImportSummary;
  importedAssignments: ImportedAssignment[];
  manualRows: SupportRow[];
  showModeSelector?: boolean;
  onModeChange: (mode: AnalysisSourceMode) => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onUpdateImportEventClassification: (
    eventIndex: number,
    classification: AnalysisEvent["classification"],
  ) => void;
  onApplyAssignments: () => void;
  onAddManualRow: () => void;
  onRemoveManualRow: (index: number) => void;
  onChangeManualRow: (index: number, field: keyof SupportRow, value: string) => void;
  onApplySectionToAll: (sectionName: string) => void;
  onGotoDesign: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFileName, setPendingFileName] = useState("");
  const analysis = props.source.import_result;
  const importedCount = props.importedStruts.length;
  const summary = props.importSummary;
  const stageRows = buildStageImportRows(analysis);
  const currentFileName = analysis.source_name || pendingFileName || "尚未選擇檔案";
  const completion = analysisSourceCompletion(
    props.mode,
    props.source,
    props.manualRows,
    props.importedAssignments,
    summary,
  );
  const completionTone = analysisSourceTone(props.mode, completion);

  function handleFilePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setPendingFileName(file.name);
    }
    props.onImport(event);
  }

  return (
    <Panel
      title={props.title}
      subtitle={props.subtitle ?? `${props.sideLabel}可各自選擇匯入分析檔、手動輸入或暫不使用。`}
    >
      <div className="source-mode-row">
        {props.showModeSelector ? (
          <label className="field-block source-mode-field">
            <span>來源方式</span>
            <select
              value={props.mode}
              onChange={(event) => props.onModeChange(event.target.value as AnalysisSourceMode)}
            >
              <option value="import">匯入分析檔</option>
              <option value="manual">手動輸入</option>
              <option value="unused">不使用</option>
            </select>
          </label>
        ) : (
          <div className="workflow-locked-mode">
            <span>本側模式</span>
            <strong>{analysisSourceModeLabel(props.mode)}</strong>
          </div>
        )}
        <div className="pill-row">
          <span className={`pill ${completionTone}`}>資料狀態：{completion}</span>
          <span className="pill">
            {props.mode === "import"
              ? `可套用候選列 ${summary.candidateCount} 筆`
              : props.mode === "manual"
                ? `目前手動列數 ${props.manualRows.length} 筆`
                : "本側不納入"}
          </span>
        </div>
      </div>

      {props.mode === "import" && (
        <>
          <div className="upload-row">
            <input
              ref={fileInputRef}
              className="file-picker-input"
              type="file"
              accept=".lst,.LST,.rio,.RIO,.o,.O,.txt,.TXT"
              onChange={handleFilePick}
            />
            <button className="primary" type="button" onClick={() => fileInputRef.current?.click()}>
              選擇匯入檔案
            </button>
            <span className="upload-file-name">{currentFileName}</span>
            <button className="secondary" onClick={props.onApplyAssignments}>
              依目前分類重建本側草稿
            </button>
            <button className="secondary" onClick={props.onGotoDesign}>
              前往支撐頁選型號
            </button>
          </div>
          <p className="meta-line">選定檔案後會立即開始匯入並更新下方摘要，不需再按第二次確認。</p>
          <div className="meta-grid">
            <MetaItem label="來源檔名" value={analysis.source_name || "—"} />
            <MetaItem label="來源格式" value={analysis.source_type || "—"} />
            <MetaItem label="標題" value={analysis.project_title || "—"} />
            <MetaItem label="開挖深度" value={fmt(analysis.excavation_depth_m, "m")} />
            <MetaItem label="地下水位" value={fmt(analysis.ground_water_level_m, "m")} />
            <MetaItem label="牆體 EI" value={fmt(analysis.wall_ei_tf_m2_per_m)} />
          </div>
          <div className="info-card">
            <p className="info-title">{props.sideLabel}分析匯入提醒</p>
            <p className="info-body">
              單向分析檔只代表這一側的荷重來源。系統會先把 {props.sideLabel} 的支撐、樓版、拆撐事件分流整理；真正可套用的只有水平支撐 / 斜撐候選，另一側資料不會被覆蓋，橫擋、大角撐與型號仍於後續步驟人工決定。
            </p>
          </div>
          <div className="meta-grid">
            <MetaItem label="水平支撐候選" value={String(summary.supportCount)} />
            <MetaItem label="斜撐候選" value={String(summary.braceCount)} />
            <MetaItem label="忽略樓版" value={String(summary.floorCount)} />
            <MetaItem label="拆撐事件" value={String(summary.removeCount)} />
            <MetaItem label="待人工判讀" value={String(summary.otherCount)} />
            <MetaItem label="可套用候選列" value={String(summary.candidateCount)} />
          </div>
          {analysis.warnings.length > 0 && (
            <ul className="warning-list">
              {analysis.warnings.map((warning) => (
                <li key={`${props.sideLabel}-${warning}`}>{warning}</li>
              ))}
            </ul>
          )}
          {stageRows.length > 0 && (
            <div className="table-scroll table-scroll-card">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>階段</th>
                    <th>開挖深度 (m)</th>
                    <th>水位 (m)</th>
                    <th>候選事件</th>
                    <th>忽略事件</th>
                  </tr>
                </thead>
                <tbody>
                  {stageRows.map((stage) => (
                    <tr key={`${props.sideLabel}-${stage.index}`}>
                      <td>{stage.label}</td>
                      <td>{fmt(stage.excavation_depth_m)}</td>
                      <td>{fmt(stage.water_level_m)}</td>
                      <td>{stage.candidateCount}</td>
                      <td>{stage.ignoredCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {analysis.events.length > 0 && (
            <div className="panel-stack-tight">
              <div className="table-actions">
                <span className="meta-line">事件清單微調：改完分類後，可直接重建本側草稿。</span>
              </div>
              <div className="table-scroll table-scroll-card">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>階段</th>
                      <th>BUT No.</th>
                      <th>深度 (m)</th>
                      <th>跨距 (m)</th>
                      <th>角度 (deg)</th>
                      <th>荷重 (tf)</th>
                      <th>目前分類</th>
                      <th>說明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.events.map((event, index) => (
                      <tr key={`${props.sideLabel}-event-${index}`}>
                        <td>{event.stage_label}</td>
                        <td>{event.butt_no ?? "—"}</td>
                        <td>{fmt(event.depth_m)}</td>
                        <td>{fmt(event.span_m)}</td>
                        <td>{fmt(event.angle_deg)}</td>
                        <td>{fmt(event.load_t)}</td>
                        <td>
                          <select
                            value={event.classification}
                            onChange={(selectEvent) =>
                              props.onUpdateImportEventClassification(
                                index,
                                selectEvent.target.value as AnalysisEvent["classification"],
                              )
                            }
                          >
                            <option value="support">水平支撐</option>
                            <option value="brace">斜撐</option>
                            <option value="floor">樓版 / 樓層</option>
                            <option value="remove">拆撐事件</option>
                            <option value="other">其他 / 忽略</option>
                          </select>
                        </td>
                        <td>{event.description || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {importedCount > 0 ? (
            <div className="panel-stack-tight">
              <div className="table-actions">
                <span className="meta-line">已辨識可套用候選事件：{importedCount} 筆</span>
              </div>
              <div className="table-scroll table-scroll-card">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>階段</th>
                      <th>支撐序號</th>
                      <th>類型</th>
                      <th>深度 (m)</th>
                      <th>跨距 (m)</th>
                      <th>角度 (deg)</th>
                      <th>荷重 (tf)</th>
                      <th>建議形式</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.importedStruts.map((strut) => (
                      <tr key={`${props.sideLabel}-${strut.stageIndex}-${strut.index}`}>
                        <td>{strut.stageLabel}</td>
                        <td>{strut.index}</td>
                        <td>{candidateKindLabel(strut.classification)}</td>
                        <td>{fmt(strut.depth_m)}</td>
                        <td>{fmt(strut.span_m)}</td>
                        <td>{fmt(strut.angle_deg)}</td>
                        <td>{fmt(strut.load_t)}</td>
                        <td>{suggestedSupportType(strut.angle_deg, strut.classification)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-actions">
                <span className="meta-line">候選列建議：{props.importedAssignments.length} 筆</span>
              </div>
              <div className="table-scroll table-scroll-card">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>候選形式</th>
                      <th>層別</th>
                      <th>深度 (m)</th>
                      <th>角度 (deg)</th>
                      <th>控制荷重 (tf)</th>
                      <th>來源階段</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.importedAssignments.map((item) => (
                      <tr key={`${props.sideLabel}-${item.id}`}>
                        <td>{candidateKindLabel(item.kind)}</td>
                        <td>{item.levelLabel}</td>
                        <td>{fmt(item.depth_m)}</td>
                        <td>{fmt(item.angle_deg)}</td>
                        <td>{fmt(item.load_t)}</td>
                        <td>{item.stageLabels.join("、")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="empty-state">尚未辨識到可直接轉成支撐候選列的資料，必要時可切換成手動輸入。</p>
          )}
          {props.ignoredEvents.length > 0 && (
            <div className="panel-stack-tight">
              <div className="table-actions">
                <span className="meta-line">
                  已辨識但不直接套用的事件：{props.ignoredEvents.length} 筆
                </span>
              </div>
              <div className="table-scroll table-scroll-card">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>階段</th>
                      <th>事件類型</th>
                      <th>深度 (m)</th>
                      <th>跨距 (m)</th>
                      <th>荷重 (tf)</th>
                      <th>事件說明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.ignoredEvents.map((event, index) => (
                      <tr key={`${props.sideLabel}-${event.stageIndex}-${event.classification}-${index}`}>
                        <td>{event.stageLabel}</td>
                        <td>{ignoredEventLabel(event.classification)}</td>
                        <td>{fmt(event.depth_m)}</td>
                        <td>{fmt(event.span_m)}</td>
                        <td>{fmt(event.load_t)}</td>
                        <td>{event.description || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {props.mode === "manual" && (
        <div className="panel-stack-tight">
          <div className="info-card">
            <p className="info-title">{props.sideLabel}手動輸入</p>
            <p className="info-body">
              這裡可先輸入支數、軸力、溫度力、間距與支撐型號；橫擋跨度、斜撐幾何與大角撐長度等設計資訊，留到「構件輸入」步驟再補齊。溫度力預設為第 1 層 30 tf，其餘各層 15 tf，仍可再手動修改。
            </p>
          </div>
          <ManualSupportLoadTable
            sideLabel={props.sideLabel}
            sectionOptions={props.sectionOptions}
            rows={props.manualRows}
            onAdd={props.onAddManualRow}
            onRemove={props.onRemoveManualRow}
            onChange={props.onChangeManualRow}
            onApplySectionToAll={props.onApplySectionToAll}
          />
        </div>
      )}

      {props.mode === "unused" && (
        <p className="empty-state">
          本側暫不納入分析來源與支撐檢討。既有資料會先保留，不會自動刪除；若後續需要檢討，再切回匯入分析檔或手動輸入即可。
        </p>
      )}
    </Panel>
  );
}

function ManualSupportLoadTable(props: {
  sideLabel: string;
  sectionOptions: string[];
  rows: SupportRow[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: keyof SupportRow, value: string) => void;
  onApplySectionToAll: (sectionName: string) => void;
}) {
  const completion = rowCompletionSummary(props.rows, isSupportRowComplete);
  return (
    <>
      <div className="table-actions">
        <span className={`meta-line ${completion.startsWith("待補") ? "attention-line" : ""}`}>填表狀態：{completion}</span>
        <button className="secondary" onClick={props.onAdd}>
          新增{props.sideLabel}列
        </button>
      </div>
      <div className="table-scroll table-scroll-card">
        <table className="data-table compact">
          <thead>
            <tr>
              <th>層別</th>
              <th>支數</th>
              <th>型號</th>
              <th>軸力 (tf)</th>
              <th>溫度力 (tf)</th>
              <th>間距 (m)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, index) => (
              <tr key={`${props.sideLabel}-${index}`}>
                <td><input value={row.level_label} onChange={(event) => props.onChange(index, "level_label", event.target.value)} /></td>
                <td><input type="number" step="1" value={row.support_count} onChange={(event) => props.onChange(index, "support_count", event.target.value)} /></td>
                <td>
                  <div className="inline-field-stack">
                    <SectionSelectInput
                      value={row.section_name}
                      options={props.sectionOptions}
                      placeholder="請選擇支撐型號"
                      onChange={(value) => props.onChange(index, "section_name", value)}
                    />
                    <button
                      className="ghost mini-action"
                      type="button"
                      disabled={!row.section_name}
                      onClick={() => props.onApplySectionToAll(row.section_name)}
                    >
                      套用全層
                    </button>
                  </div>
                </td>
                <td><input type="number" step="any" value={row.axial_force_t} onChange={(event) => props.onChange(index, "axial_force_t", event.target.value)} /></td>
                <td><input type="number" step="any" value={row.temp_force_t} onChange={(event) => props.onChange(index, "temp_force_t", event.target.value)} /></td>
                <td><input type="number" step="any" value={row.spacing_m} onChange={(event) => props.onChange(index, "spacing_m", event.target.value)} /></td>
                <td><button className="ghost" onClick={() => props.onRemove(index)}>刪除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {props.rows.length === 0 && <p className="empty-state">尚未建立任何手動輸入列。</p>}
    </>
  );
}

function EditableSupportTable(props: {
  title: string;
  subtitle?: string;
  enabled: boolean;
  useDefaultTempForce: boolean;
  sectionOptions: string[];
  onToggle: (enabled: boolean) => void;
  onToggleDefaultTempForce: (enabled: boolean) => void;
  rows: SupportRow[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: keyof SupportRow, value: string) => void;
  onApplySectionToAll: (sectionName: string) => void;
}) {
  const completion = rowCompletionSummary(props.rows, isSupportRowComplete);
  return (
    <Panel title={props.title} subtitle={props.subtitle}>
      <label className="check-field">
        <input
          type="checkbox"
          checked={props.enabled}
          onChange={(event) => props.onToggle(event.target.checked)}
        />
        <span>納入檢討</span>
      </label>
      {!props.enabled && (
        <CollapsedModuleHint text="目前未納入此模組檢討；如需檢算，勾選上方核取方塊後即可展開完整輸入表。" />
      )}
      <fieldset className="fieldset-reset" disabled={!props.enabled}>
      {props.enabled && (
      <>
        <div className="table-actions">
          <label className="check-field">
            <input
              type="checkbox"
              checked={props.useDefaultTempForce}
              onChange={(event) => props.onToggleDefaultTempForce(event.target.checked)}
            />
            <span>N2 帶入預設值</span>
          </label>
          <span className="meta-line">勾選後會直接套用第 1 層 30 tf、其餘各層 15 tf，並鎖定欄位避免混淆。</span>
          <span className={`meta-line ${completion.startsWith("待補") ? "attention-line" : ""}`}>填表狀態：{completion}</span>
          <button className="secondary" onClick={props.onAdd}>
            新增列
          </button>
        </div>
        <div className="table-scroll table-scroll-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>層別</th>
                <th>支數</th>
                <th>型號</th>
                <th>N1 (tf)</th>
                <th>N2 (tf)</th>
                <th>間距 (m)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, index) => (
                <tr key={`${props.title}-${index}`}>
                  <td><input value={row.level_label} onChange={(e) => props.onChange(index, "level_label", e.target.value)} /></td>
                  <td><input type="number" value={row.support_count} onChange={(e) => props.onChange(index, "support_count", e.target.value)} /></td>
                  <td>
                    <div className="inline-field-stack">
                      <SectionSelectInput
                        value={row.section_name}
                        options={props.sectionOptions}
                        placeholder="請選擇支撐型號"
                        onChange={(value) => props.onChange(index, "section_name", value)}
                      />
                      <button
                        className="ghost mini-action"
                        type="button"
                        disabled={!row.section_name}
                        onClick={() => props.onApplySectionToAll(row.section_name)}
                      >
                        套用全層
                      </button>
                    </div>
                  </td>
                  <td><input type="number" step="any" value={row.axial_force_t} onChange={(e) => props.onChange(index, "axial_force_t", e.target.value)} /></td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      disabled={props.useDefaultTempForce}
                      value={props.useDefaultTempForce ? defaultSupportTempForce(index) : row.temp_force_t}
                      onChange={(e) => props.onChange(index, "temp_force_t", e.target.value)}
                    />
                  </td>
                  <td><input type="number" step="any" value={row.spacing_m} onChange={(e) => props.onChange(index, "spacing_m", e.target.value)} /></td>
                  <td><button className="ghost" onClick={() => props.onRemove(index)}>刪除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
      )}
      </fieldset>
    </Panel>
  );
}

function EditableWaleTable(props: {
  title: string;
  enabled: boolean;
  minimumRows: number;
  sectionOptions: string[];
  onToggle: (enabled: boolean) => void;
  rows: WaleRow[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: keyof WaleRow, value: string) => void;
  onApplySectionToAll: (sectionName: string) => void;
}) {
  const completion = rowCompletionSummary(props.rows, isWaleRowComplete);
  return (
    <Panel title={props.title}>
      <label className="check-field">
        <input
          type="checkbox"
          checked={props.enabled}
          onChange={(event) => props.onToggle(event.target.checked)}
        />
        <span>納入檢討</span>
      </label>
      {!props.enabled && (
        <CollapsedModuleHint text="目前未納入橫擋檢討；若本案需要檢算，再勾選後展開跨度、型號與荷重設定。" />
      )}
      <fieldset className="fieldset-reset" disabled={!props.enabled}>
      {props.enabled && (
      <>
        <div className="table-actions">
          {props.minimumRows > 0 && (
            <span className="meta-line">至少顯示 {props.minimumRows} 列，會隨支撐層數自動補齊。</span>
          )}
          <span className="meta-line">型號預設沿用同層支撐，跨度預設為支撐間距扣 1.5 m；雙支支撐則扣 1.9 m，仍可手動修改。</span>
          <span className={`meta-line ${completion.startsWith("待補") ? "attention-line" : ""}`}>填表狀態：{completion}</span>
          <button className="secondary" onClick={props.onAdd}>
            新增列
          </button>
        </div>
        <div className="table-scroll table-scroll-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>層別</th>
              <th>支數</th>
              <th>型號</th>
              <th>跨度 (m)</th>
              <th>支撐間距 (m)</th>
              <th>Ww (tf/m)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, index) => (
              <tr key={`${props.title}-${index}`}>
                <td><input value={row.level_label} onChange={(e) => props.onChange(index, "level_label", e.target.value)} /></td>
                <td><input type="number" value={row.wale_count} onChange={(e) => props.onChange(index, "wale_count", e.target.value)} /></td>
                <td>
                  <div className="inline-field-stack">
                    <SectionSelectInput
                      value={row.section_name}
                      options={props.sectionOptions}
                      placeholder="請選擇橫擋型號"
                      onChange={(value) => props.onChange(index, "section_name", value)}
                    />
                    <button
                      className="ghost mini-action"
                      type="button"
                      disabled={!row.section_name}
                      onClick={() => props.onApplySectionToAll(row.section_name)}
                    >
                      套用全層
                    </button>
                  </div>
                </td>
                <td><input type="number" step="any" value={row.span_m} onChange={(e) => props.onChange(index, "span_m", e.target.value)} /></td>
                <td><input type="number" step="any" value={row.support_spacing_m} onChange={(e) => props.onChange(index, "support_spacing_m", e.target.value)} /></td>
                <td><input type="number" step="any" value={row.line_load_tf_per_m} onChange={(e) => props.onChange(index, "line_load_tf_per_m", e.target.value)} /></td>
                <td><button className="ghost" disabled={props.rows.length <= props.minimumRows} onClick={() => props.onRemove(index)}>刪除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </>
      )}
      </fieldset>
    </Panel>
  );
}

function EditableBraceTable(props: {
  title: string;
  enabled: boolean;
  minimumRows: number;
  sectionOptions: string[];
  onToggle: (enabled: boolean) => void;
  rows: BraceRow[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: keyof BraceRow, value: string) => void;
  onApplySectionToAll: (sectionName: string) => void;
}) {
  const completion = rowCompletionSummary(props.rows, isBraceRowComplete);
  return (
    <Panel title={props.title}>
      <label className="check-field">
        <input
          type="checkbox"
          checked={props.enabled}
          onChange={(event) => props.onToggle(event.target.checked)}
        />
        <span>納入檢討</span>
      </label>
      {!props.enabled && (
        <CollapsedModuleHint text="目前未納入斜撐檢討；如需檢算，勾選後再填入型號、L1、L2、角度與荷重。" />
      )}
      <fieldset className="fieldset-reset" disabled={!props.enabled}>
      {props.enabled && (
      <>
        <div className="table-actions">
          {props.minimumRows > 0 && (
            <span className="meta-line">至少顯示 {props.minimumRows} 列，會隨支撐層數自動補齊。</span>
          )}
          <span className={`meta-line ${completion.startsWith("待補") ? "attention-line" : ""}`}>填表狀態：{completion}</span>
          <button className="secondary" onClick={props.onAdd}>
            新增列
          </button>
        </div>
        <div className="table-scroll table-scroll-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>層別</th>
              <th>型號</th>
              <th>L1 (m)</th>
              <th>L2 (m)</th>
              <th>角度 (deg)</th>
              <th>Ww (tf/m)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, index) => (
              <tr key={`${props.title}-${index}`}>
                <td><input value={row.level_label} onChange={(e) => props.onChange(index, "level_label", e.target.value)} /></td>
                <td>
                  <div className="inline-field-stack">
                    <SectionSelectInput
                      value={row.section_name}
                      options={props.sectionOptions}
                      placeholder="請選擇斜撐型號"
                      onChange={(value) => props.onChange(index, "section_name", value)}
                    />
                    <button
                      className="ghost mini-action"
                      type="button"
                      disabled={!row.section_name}
                      onClick={() => props.onApplySectionToAll(row.section_name)}
                    >
                      套用全層
                    </button>
                  </div>
                </td>
                <td><input type="number" step="any" value={row.l1_m} onChange={(e) => props.onChange(index, "l1_m", e.target.value)} /></td>
                <td><input type="number" step="any" value={row.l2_m} onChange={(e) => props.onChange(index, "l2_m", e.target.value)} /></td>
                <td><input type="number" step="any" value={row.angle_deg} onChange={(e) => props.onChange(index, "angle_deg", e.target.value)} /></td>
                <td><input type="number" step="any" value={row.tributary_line_load_tf_per_m} onChange={(e) => props.onChange(index, "tributary_line_load_tf_per_m", e.target.value)} /></td>
                <td><button className="ghost" disabled={props.rows.length <= props.minimumRows} onClick={() => props.onRemove(index)}>刪除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </>
      )}
      </fieldset>
    </Panel>
  );
}

function EditableCornerBraceTable(props: {
  title: string;
  enabled: boolean;
  minimumRows: number;
  sectionOptions: string[];
  onToggle: (enabled: boolean) => void;
  rows: CornerBraceRow[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: keyof CornerBraceRow, value: string) => void;
  onApplySectionToAll: (sectionName: string) => void;
}) {
  const completion = rowCompletionSummary(props.rows, isCornerBraceRowComplete);
  return (
    <Panel title={props.title}>
      <label className="check-field">
        <input
          type="checkbox"
          checked={props.enabled}
          onChange={(event) => props.onToggle(event.target.checked)}
        />
        <span>納入檢討</span>
      </label>
      {!props.enabled && (
        <CollapsedModuleHint text="目前未納入大角撐檢討；需要時再勾選展開型號、長度與軸力設定。" />
      )}
      <fieldset className="fieldset-reset" disabled={!props.enabled}>
      {props.enabled && (
      <>
        <div className="table-actions">
          {props.minimumRows > 0 && (
            <span className="meta-line">至少顯示 {props.minimumRows} 列，會依支撐層數自動補齊。</span>
          )}
          <span className={`meta-line ${completion.startsWith("待補") ? "attention-line" : ""}`}>填表狀態：{completion}</span>
          <button className="secondary" onClick={props.onAdd}>
            新增列
          </button>
        </div>
        <div className="table-scroll table-scroll-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>層別</th>
              <th>型號</th>
              <th>長度 (m)</th>
              <th>軸力 (tf)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, index) => (
              <tr key={`${props.title}-${index}`}>
                <td><input value={row.level_label} onChange={(e) => props.onChange(index, "level_label", e.target.value)} /></td>
                <td>
                  <div className="inline-field-stack">
                    <SectionSelectInput
                      value={row.section_name}
                      options={props.sectionOptions}
                      placeholder="請選擇大角撐型號"
                      onChange={(value) => props.onChange(index, "section_name", value)}
                    />
                    <button
                      className="ghost mini-action"
                      type="button"
                      disabled={!row.section_name}
                      onClick={() => props.onApplySectionToAll(row.section_name)}
                    >
                      套用全層
                    </button>
                  </div>
                </td>
                <td><input type="number" step="any" value={row.length_m} onChange={(e) => props.onChange(index, "length_m", e.target.value)} /></td>
                <td><input type="number" step="any" value={row.axial_force_t} onChange={(e) => props.onChange(index, "axial_force_t", e.target.value)} /></td>
                <td><button className="ghost" disabled={props.rows.length <= props.minimumRows} onClick={() => props.onRemove(index)}>刪除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </>
      )}
      </fieldset>
    </Panel>
  );
}

function LevelSummaryTable(props: { rows: SummaryItem[]; options: CalculationOptions }) {
  const rows = buildLevelSummaryRows(props.rows);
  const summaryColumns = availableSummaryColumns(props.rows);
  const worstRatio = rows.reduce((max, row) => Math.max(max, normalizedRatio(row.worstRatio)), 0);
  return (
    <div className="table-scroll table-scroll-card">
      <table className="data-table">
        <thead>
          <tr>
            <th>層別</th>
            {summaryColumns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
            <th>最差比值</th>
            <th>狀態</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className={
                normalizedRatio(row.worstRatio) > 0 && nearlyEqual(normalizedRatio(row.worstRatio), worstRatio)
                  ? "worst-row"
                  : ""
              }
            >
              <td>{row.label}</td>
              {summaryColumns.map((column) => (
                <td key={`${row.label}-${column.key}`}>
                  <SummaryMatrixCell items={summaryRowItems(row, column.key)} options={props.options} />
                </td>
              ))}
              <td><UtilizationCell value={row.worstRatio} status={row.status} /></td>
              <td><StatusBadge status={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ColumnSummaryTable(props: { rows: CheckResult[]; onLocate: () => void }) {
  const rows = buildColumnSummaryRows(props.rows);
  const worstRatio = rows.reduce((max, row) => Math.max(max, normalizedRatio(row.ratio)), 0);
  return (
    <div className="table-scroll table-scroll-card">
      <table className="data-table compact">
        <thead>
          <tr>
            <th>構件</th>
            <th>型號</th>
            <th>利用率</th>
            <th>狀態</th>
            <th>備註</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className={
                normalizedRatio(row.ratio) > 0 && nearlyEqual(normalizedRatio(row.ratio), worstRatio)
                  ? "worst-row"
                  : ""
              }
            >
              <td>{row.label}</td>
              <td>{row.sectionName}</td>
              <td><UtilizationCell value={row.ratio} status={row.status} /></td>
              <td><StatusBadge status={row.status} /></td>
              <td>{row.note}</td>
              <td><button className="ghost compact-action" onClick={props.onLocate}>前往柱構件</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyControlTable(props: {
  rows: CheckResult[];
  options: CalculationOptions;
  onLocate: (step: number, panelId?: string) => void;
}) {
  const rows = buildKeyControlRows(props.rows);
  const worstRatio = rows.reduce((max, row) => Math.max(max, normalizedRatio(row.utilization_ratio)), 0);
  return (
    <div className="table-scroll table-scroll-card">
      <table className="data-table compact">
        <thead>
          <tr>
            <th>模組</th>
            <th>標籤</th>
            <th>控制條件</th>
            <th>控制值 / 允許值</th>
            <th>利用率</th>
            <th>狀態</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${row.module_name}-${row.label}-${index}`}
              className={normalizedRatio(row.utilization_ratio) > 0 && nearlyEqual(normalizedRatio(row.utilization_ratio), worstRatio) ? "worst-row" : ""}
            >
              <td>{displayCheckModuleName(row.module_name, props.options)}</td>
              <td>{row.label}</td>
              <td>{row.controlling_condition}</td>
              <td>{formatDemandAllowable(row)}</td>
              <td><UtilizationCell value={row.utilization_ratio} status={row.status} /></td>
              <td><StatusBadge status={row.status} /></td>
              <td>
                <button
                  className="ghost compact-action"
                  onClick={() => {
                    const target = panelTargetForModule(row.module_name, props.options);
                    props.onLocate(target.step, target.panelId);
                  }}
                >
                  {locateLabelForModule(row.module_name)}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryMatrixCell(props: { items: SummaryItem[]; options: CalculationOptions }) {
  if (props.items.length === 0) {
    return <span className="table-muted">—</span>;
  }

  return (
    <div className="summary-matrix-cell">
      {props.items.map((item, index) => (
        <div key={`${item.group}-${item.label}-${index}`} className={`summary-line ${statusTone(item.status)}`}>
          <span className="summary-line-head">{summaryHeadline(item, props.options)}</span>
          <div className="summary-line-progress">
            <div className={`summary-line-progress-fill ${statusTone(item.status)}`} style={{ width: `${Math.min(normalizedRatio(item.utilization_ratio), 1.2) / 1.2 * 100}%` }} />
          </div>
          <span className="summary-line-section">{summarySectionName(item)}</span>
        </div>
      ))}
    </div>
  );
}

function UtilizationCell(props: { value: number | null | undefined; status?: string }) {
  const ratio = normalizedRatio(props.value);
  const tone =
    props.status === "NG" || ratio >= 1
      ? "ng"
      : props.status === "Say~OK" || ratio >= 0.85
        ? "warn"
        : "ok";
  const width = `${Math.min(ratio, 1.2) / 1.2 * 100}%`;

  return (
    <div className={`utilization-cell ${tone}`}>
      <span>{fmtRatio(ratio)}</span>
      <div className="utilization-track" aria-hidden="true">
        <div className={`utilization-fill ${tone}`} style={{ width }} />
      </div>
    </div>
  );
}

function StatusBadge(props: { status: string }) {
  return <span className={`status-badge ${props.status}`}>{props.status}</span>;
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: string): number | null {
  return value === "" ? null : toNumber(value);
}

function cacheBustUrl(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}ts=${Date.now()}`;
}

function extractDownloadFilename(url: string): string {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    return decodeURIComponent(pathname.split("/").pop() || url);
  } catch {
    return url;
  }
}

function collectBoltSizeKeys(rows: BoltStrengthRow[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    Object.keys(row.sizes).forEach((key) => keys.add(key));
  }
  return Array.from(keys);
}

function emptySectionProperty(index: number): SectionProperty {
  return {
    name: `NEW-SECTION-${index}`,
    depth_cm: 0,
    flange_width_cm: 0,
    web_thickness_cm: 0,
    flange_thickness_cm: 0,
    area_cm2: 0,
    unit_weight_kgf_per_m: 0,
    ix_cm4: 0,
    iy_cm4: 0,
    rx_cm: 0,
    ry_cm: 0,
    rt_cm: 0,
    sx_cm3: 0,
    sy_cm3: 0,
    zx_cm3: 0,
    zy_cm3: 0,
  };
}

function buildSectionOptions(sections: SectionProperty[]): string[] {
  return Array.from(
    new Set(
      sections
        .map((section) => section.name.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, "zh-Hant"));
}

function emptyBoltStrengthRow(index: number, sizeKeys: string[]): BoltStrengthRow {
  return {
    grade: `NEW-BOLT-${index}`,
    ft_tf_per_cm2: null,
    fv_tf_per_cm2: null,
    sizes: Object.fromEntries(sizeKeys.map((key) => [key, 0])),
  };
}

function defaultSupportTempForce(index: number): number {
  return index === 0 ? 30 : 15;
}

function emptySupportRow(index = 0, useDefaultTempForce = true): SupportRow {
  return {
    level_label: "",
    support_count: 1,
    section_name: "",
    axial_force_t: 0,
    temp_force_t: useDefaultTempForce ? defaultSupportTempForce(index) : 0,
    spacing_m: 0,
  };
}

function emptyWaleRow(): WaleRow {
  return {
    level_label: "",
    wale_count: 1,
    section_name: "",
    span_m: 0,
    support_spacing_m: 0,
    line_load_tf_per_m: 0,
  };
}

function emptyBraceRow(): BraceRow {
  return {
    level_label: "",
    section_name: "",
    l1_m: 0,
    l2_m: 0,
    angle_deg: 45,
    tributary_line_load_tf_per_m: 0,
  };
}

function emptyCornerBraceRow(): CornerBraceRow {
  return {
    level_label: "",
    section_name: "",
    length_m: 0,
    axial_force_t: 0,
  };
}

function emptySoilRow(index: number): SoilLayer {
  return {
    index,
    name: `第 ${index} 層`,
    thickness_m: null,
    depth_m: null,
    n_value: null,
    unit_weight_t_per_m3: null,
    phi_deg: null,
    cohesion_t_per_m2: null,
    delta_ratio: null,
    su_t_per_m2: null,
    ka: null,
    kp: null,
    es_t_per_m2: null,
    kh_t_per_m3: null,
    soil_type: "mixed",
  };
}

function flattenChecks(results: NonNullable<ProjectState["calculation_results"]>): CheckResult[] {
  return [
    ...results.support_checks,
    ...results.wale_checks,
    ...results.brace_checks,
    ...results.corner_brace_checks,
    ...results.column_checks,
  ];
}

function buildEditableSoils(project: ProjectState): SoilLayer[] {
  if (project.analysis_import.soils.length > 0) {
    return normalizeSoils(project.analysis_import.soils);
  }
  const baseLayers = project.columns[0]?.soil_layers ?? [];
  return normalizeSoils(
    baseLayers.map((soil) => ({
      index: soil.index,
      name: soil.name,
      thickness_m: soil.thickness_m,
      depth_m: soil.depth_m,
      n_value: soil.n_value ?? null,
      su_t_per_m2: soil.su_t_per_m2 ?? null,
      soil_type: soil.soil_type,
    })),
  );
}

function normalizeSoils(soils: SoilLayer[]): SoilLayer[] {
  let previousDepth: number | null = null;
  return soils.map((soil, index) => {
    const normalizedDepth =
      soil.depth_m === null || soil.depth_m === undefined || Number.isNaN(soil.depth_m)
        ? null
        : soil.depth_m;
    const calculatedThickness = soilThicknessFromDepth(normalizedDepth, previousDepth);
    if (normalizedDepth !== null) {
      previousDepth = normalizedDepth;
    }
    return {
      ...emptySoilRow(index + 1),
      ...soil,
      index: index + 1,
      name: soil.name || `第 ${index + 1} 層`,
      depth_m: normalizedDepth,
      thickness_m: calculatedThickness,
    };
  });
}

function syncColumnsFromSoils(
  columns: ColumnScenarioInput[],
  soils: SoilLayer[],
): ColumnScenarioInput[] {
  const foundationSoils = toFoundationSoils(soils);
  return columns.map((column) => ({
    ...column,
    soil_layers: foundationSoils.map((soil) => ({ ...soil })),
  }));
}

function toFoundationSoils(soils: SoilLayer[]) {
  return normalizeSoils(soils)
    .filter((soil): soil is SoilLayer & { depth_m: number; thickness_m: number } => soil.depth_m !== null && soil.depth_m !== undefined && soil.thickness_m !== null && soil.thickness_m !== undefined)
    .map((soil, index) => {
    return {
      index: index + 1,
      name: soil.name,
      depth_m: soil.depth_m,
      thickness_m: soil.thickness_m,
      n_value: soil.n_value ?? null,
      su_t_per_m2: soil.su_t_per_m2 ?? null,
      soil_type: soil.soil_type,
    };
  });
}

function soilThicknessFromDepth(depth: number | null, previousDepth: number | null): number | null {
  if (depth === null || Number.isNaN(depth)) return null;
  const baseDepth = previousDepth ?? 0;
  return roundValue(Math.max(depth - baseDepth, 0));
}

function isSameSoilRows(left: SoilLayer[], right: SoilLayer[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isSameColumnSoils(left: ColumnScenarioInput[], right: ColumnScenarioInput[]): boolean {
  return JSON.stringify(left.map((column) => column.soil_layers)) === JSON.stringify(right.map((column) => column.soil_layers));
}

type GuardedDependentKey =
  | "top_wales"
  | "bottom_wales"
  | "top_braces"
  | "bottom_braces"
  | "corner_braces";

type SupportSeed = {
  levelLabel: string;
  supportCount: number;
  spacingM: number;
  totalForceT: number;
  sectionName: string;
};

type SupportKey = "top_supports" | "bottom_supports";

function isSupportKey(key: string): key is SupportKey {
  return key === "top_supports" || key === "bottom_supports";
}

function isGuardedDependentKey(key: string): key is GuardedDependentKey {
  return (
    key === "top_wales" ||
    key === "bottom_wales" ||
    key === "top_braces" ||
    key === "bottom_braces" ||
    key === "corner_braces"
  );
}

function minimumDependentRows(
  project: ProjectState,
  key: GuardedDependentKey,
): number {
  const topCount = project.calculation_options.include_top_supports ? project.top_supports.length : 0;
  const bottomCount = project.calculation_options.include_bottom_supports
    ? project.bottom_supports.length
    : 0;

  if (key === "top_wales" || key === "top_braces") return topCount;
  if (key === "bottom_wales" || key === "bottom_braces") return bottomCount;
  return Math.max(topCount, bottomCount);
}

function syncAfterSupportRemoval(
  project: ProjectState,
  supportKey: SupportKey,
  index: number,
): ProjectState {
  const previousTopMinimum = minimumDependentRows(project, "top_wales");
  const previousBottomMinimum = minimumDependentRows(project, "bottom_wales");
  const previousCornerMinimum = minimumDependentRows(project, "corner_braces");

  const nextSupportRows = [...project[supportKey]];
  nextSupportRows.splice(index, 1);

  const nextProject: ProjectState = {
    ...project,
    [supportKey]: nextSupportRows,
    calculation_results: null,
  } as ProjectState;

  const nextTopMinimum = minimumDependentRows(nextProject, "top_wales");
  const nextBottomMinimum = minimumDependentRows(nextProject, "bottom_wales");
  const nextCornerMinimum = minimumDependentRows(nextProject, "corner_braces");

  if (supportKey === "top_supports") {
    nextProject.top_wales = trimLinkedRowsAfterSupportRemoval(
      project.top_wales,
      previousTopMinimum,
      nextTopMinimum,
      index,
    );
    nextProject.top_braces = trimLinkedRowsAfterSupportRemoval(
      project.top_braces,
      previousTopMinimum,
      nextTopMinimum,
      index,
    );
  } else {
    nextProject.bottom_wales = trimLinkedRowsAfterSupportRemoval(
      project.bottom_wales,
      previousBottomMinimum,
      nextBottomMinimum,
      index,
    );
    nextProject.bottom_braces = trimLinkedRowsAfterSupportRemoval(
      project.bottom_braces,
      previousBottomMinimum,
      nextBottomMinimum,
      index,
    );
  }

  nextProject.corner_braces = trimCornerRowsAfterSupportRemoval(
    project.corner_braces,
    previousCornerMinimum,
    nextCornerMinimum,
  );

  return nextProject;
}

function trimLinkedRowsAfterSupportRemoval<T>(
  rows: T[],
  previousMinimum: number,
  nextMinimum: number,
  index: number,
): T[] {
  if (nextMinimum >= previousMinimum || rows.length !== previousMinimum) {
    return rows;
  }
  const nextRows = [...rows];
  nextRows.splice(Math.min(index, Math.max(nextRows.length - 1, 0)), 1);
  return nextRows;
}

function trimCornerRowsAfterSupportRemoval(
  rows: CornerBraceRow[],
  previousMinimum: number,
  nextMinimum: number,
): CornerBraceRow[] {
  if (nextMinimum >= previousMinimum || rows.length !== previousMinimum) {
    return rows;
  }
  return rows.slice(0, nextMinimum);
}

function syncProjectGuardrails(project: ProjectState): ProjectState {
  const normalizedBasicParameters = {
    ...project.basic_parameters,
    wall_type: normalizeWallTypeValue(project.basic_parameters.wall_type),
  };
  const normalizedSoils = buildEditableSoils(project);
  const nextColumns = syncColumnsFromSoils(project.columns, normalizedSoils);
  const soilsChanged = !isSameSoilRows(project.analysis_import.soils, normalizedSoils);
  const columnsChanged = !isSameColumnSoils(project.columns, nextColumns);
  const basicChanged = JSON.stringify(project.basic_parameters) !== JSON.stringify(normalizedBasicParameters);
  const originalTopSeeds = project.calculation_options.include_top_supports
    ? buildSupportSeeds(project.top_supports)
    : [];
  const originalBottomSeeds = project.calculation_options.include_bottom_supports
    ? buildSupportSeeds(project.bottom_supports)
    : [];

  const [topSupports, topSupportsChanged] = syncSupportRows(
    project.top_supports,
    project.calculation_options.auto_temp_force_top_supports,
  );
  const [bottomSupports, bottomSupportsChanged] = syncSupportRows(
    project.bottom_supports,
    project.calculation_options.auto_temp_force_bottom_supports,
  );

  const topSeeds = project.calculation_options.include_top_supports
    ? buildSupportSeeds(topSupports)
    : [];
  const bottomSeeds = project.calculation_options.include_bottom_supports
    ? buildSupportSeeds(bottomSupports)
    : [];
  const originalCornerSeeds = buildCornerSeeds(originalTopSeeds, originalBottomSeeds);
  const cornerSeeds = buildCornerSeeds(topSeeds, bottomSeeds);

  const [topWales, topWalesChanged] = syncWaleRows(project.top_wales, topSeeds, originalTopSeeds);
  const [bottomWales, bottomWalesChanged] = syncWaleRows(project.bottom_wales, bottomSeeds, originalBottomSeeds);
  const [topBraces, topBracesChanged] = syncBraceRows(project.top_braces, topSeeds, originalTopSeeds);
  const [bottomBraces, bottomBracesChanged] = syncBraceRows(project.bottom_braces, bottomSeeds, originalBottomSeeds);
  const [cornerBraces, cornerBracesChanged] = syncCornerBraceRows(project.corner_braces, cornerSeeds, originalCornerSeeds);

  if (
    !topSupportsChanged &&
    !bottomSupportsChanged &&
    !topWalesChanged &&
    !bottomWalesChanged &&
    !topBracesChanged &&
    !bottomBracesChanged &&
    !cornerBracesChanged &&
    !soilsChanged &&
    !columnsChanged &&
    !basicChanged
  ) {
    return project;
  }

  return {
    ...project,
    basic_parameters: normalizedBasicParameters,
    analysis_import: {
      ...project.analysis_import,
      soils: normalizedSoils,
    },
    columns: nextColumns,
    top_supports: topSupports,
    bottom_supports: bottomSupports,
    top_wales: topWales,
    bottom_wales: bottomWales,
    top_braces: topBraces,
    bottom_braces: bottomBraces,
    corner_braces: cornerBraces,
  };
}

function syncSupportRows(rows: SupportRow[], useDefaultTempForce: boolean): [SupportRow[], boolean] {
  let changed = false;
  const nextRows = rows.map((row, index) => {
    const updated: SupportRow = {
      ...row,
      support_count: Math.max(row.support_count || 1, 1),
      temp_force_t: normalizeSupportTempForce(row.temp_force_t, index, useDefaultTempForce),
    };
    if (!isSameSupportRow(row, updated)) {
      changed = true;
    }
    return updated;
  });
  return [changed ? nextRows : rows, changed];
}

function buildSupportSeeds(rows: SupportRow[]): SupportSeed[] {
  return rows.map((row, index) => ({
    levelLabel: row.level_label || String(index + 1),
    supportCount: Math.max(row.support_count || 1, 1),
    spacingM: row.spacing_m || 0,
    totalForceT: (row.axial_force_t || 0) + (row.temp_force_t || 0),
    sectionName: row.section_name || "",
  }));
}

function buildCornerSeeds(topSeeds: SupportSeed[], bottomSeeds: SupportSeed[]): SupportSeed[] {
  const size = Math.max(topSeeds.length, bottomSeeds.length);
  const seeds: SupportSeed[] = [];
  for (let index = 0; index < size; index += 1) {
    const top = topSeeds[index];
    const bottom = bottomSeeds[index];
    const topForce = top?.totalForceT ?? 0;
    const bottomForce = bottom?.totalForceT ?? 0;
    const primary = topForce >= bottomForce ? top ?? bottom : bottom ?? top;
    if (!primary) continue;
    seeds.push({
      levelLabel: primary.levelLabel || String(index + 1),
      supportCount: primary.supportCount,
      spacingM: primary.spacingM,
      totalForceT: Math.max(topForce, bottomForce),
      sectionName: primary.sectionName,
    });
  }
  return seeds;
}

function supportSeedFromRow(row: SupportRow, index: number, useDefaultTempForce: boolean): SupportSeed {
  const supportCount = Math.max(row.support_count || 1, 1);
  const spacingM = row.spacing_m || 0;
  const tempForceT = normalizeSupportTempForce(row.temp_force_t, index, useDefaultTempForce);
  return {
    levelLabel: row.level_label || String(index + 1),
    supportCount,
    spacingM,
    totalForceT: (row.axial_force_t || 0) + tempForceT,
    sectionName: row.section_name || "",
  };
}

function normalizeSupportTempForce(value: number, index: number, useDefaultTempForce: boolean): number {
  if (!useDefaultTempForce) return value || 0;
  return defaultSupportTempForce(index);
}

function shouldFollowSupportSection(currentSection: string, previousSupportSection: string): boolean {
  return !currentSection || (!!previousSupportSection && currentSection === previousSupportSection);
}

function shouldFollowAutoNumber(currentValue: number, previousDefault: number): boolean {
  return currentValue <= 0 || nearlyEqual(currentValue, previousDefault);
}

function shouldFollowSupportCount(currentCount: number, previousSupportCount: number): boolean {
  return currentCount <= 0 || currentCount === previousSupportCount;
}

function shouldFollowLevelLabel(currentLabel: string, previousLabel: string): boolean {
  return !currentLabel || currentLabel === previousLabel;
}

function isAutoManagedWaleRow(row: WaleRow, previousSeed: SupportSeed): boolean {
  return (
    shouldFollowLevelLabel(row.level_label, previousSeed.levelLabel) &&
    shouldFollowSupportCount(row.wale_count, previousSeed.supportCount) &&
    shouldFollowSupportSection(row.section_name, previousSeed.sectionName) &&
    shouldFollowAutoNumber(row.support_spacing_m, roundValue(previousSeed.spacingM)) &&
    shouldFollowAutoNumber(row.span_m, autoWaleSpan(previousSeed.spacingM, previousSeed.supportCount))
  );
}

function isAutoManagedBraceRow(row: BraceRow, previousSeed: SupportSeed): boolean {
  return (
    shouldFollowLevelLabel(row.level_label, previousSeed.levelLabel) &&
    shouldFollowSupportSection(row.section_name, previousSeed.sectionName) &&
    shouldFollowAutoNumber(row.l1_m, defaultBraceL1()) &&
    shouldFollowAutoNumber(row.l2_m, defaultBraceL2(previousSeed.supportCount))
  );
}

function isAutoManagedCornerBraceRow(row: CornerBraceRow, previousSeed: SupportSeed): boolean {
  return (
    shouldFollowLevelLabel(row.level_label, previousSeed.levelLabel) &&
    shouldFollowSupportSection(row.section_name, previousSeed.sectionName) &&
    shouldFollowAutoNumber(row.length_m, defaultBraceL2(previousSeed.supportCount))
  );
}

function cascadeSupportEdit(
  previousProject: ProjectState,
  nextProject: ProjectState,
  key: SupportKey,
  index: number,
): ProjectState {
  const previousRow = previousProject[key][index];
  const nextRow = nextProject[key][index];
  if (!previousRow || !nextRow) return nextProject;

  const useDefaultTempForce =
    key === "top_supports"
      ? nextProject.calculation_options.auto_temp_force_top_supports
      : nextProject.calculation_options.auto_temp_force_bottom_supports;
  const previousUseDefaultTempForce =
    key === "top_supports"
      ? previousProject.calculation_options.auto_temp_force_top_supports
      : previousProject.calculation_options.auto_temp_force_bottom_supports;

  const previousSeed = supportSeedFromRow(previousRow, index, previousUseDefaultTempForce);
  const nextSeed = supportSeedFromRow(nextRow, index, useDefaultTempForce);

  const waleKey = key === "top_supports" ? "top_wales" : "bottom_wales";
  const braceKey = key === "top_supports" ? "top_braces" : "bottom_braces";

  const nextWales = [...nextProject[waleKey]];
  const existingWale = nextWales[index];
  if (existingWale) {
    const updatedWale: WaleRow = {
      ...existingWale,
      level_label: shouldFollowLevelLabel(existingWale.level_label, previousSeed.levelLabel)
        ? nextSeed.levelLabel
        : existingWale.level_label,
      wale_count: shouldFollowSupportCount(existingWale.wale_count, previousSeed.supportCount)
        ? nextSeed.supportCount
        : existingWale.wale_count,
      section_name: shouldFollowSupportSection(existingWale.section_name, previousSeed.sectionName)
        ? nextSeed.sectionName
        : existingWale.section_name,
      support_spacing_m: shouldFollowAutoNumber(existingWale.support_spacing_m, roundValue(previousSeed.spacingM))
        ? roundValue(nextSeed.spacingM)
        : existingWale.support_spacing_m,
      span_m: shouldFollowAutoNumber(existingWale.span_m, autoWaleSpan(previousSeed.spacingM, previousSeed.supportCount))
        ? autoWaleSpan(nextSeed.spacingM, nextSeed.supportCount)
        : existingWale.span_m,
      line_load_tf_per_m: shouldFollowAutoNumber(existingWale.line_load_tf_per_m, roundValue(estimatedLineLoad(previousSeed)))
        ? roundValue(estimatedLineLoad(nextSeed))
        : existingWale.line_load_tf_per_m,
    };
    nextWales[index] = updatedWale;
  }

  const nextBraces = [...nextProject[braceKey]];
  const existingBrace = nextBraces[index];
  if (existingBrace) {
    const updatedBrace: BraceRow = {
      ...existingBrace,
      level_label: shouldFollowLevelLabel(existingBrace.level_label, previousSeed.levelLabel)
        ? nextSeed.levelLabel
        : existingBrace.level_label,
      section_name: shouldFollowSupportSection(existingBrace.section_name, previousSeed.sectionName)
        ? nextSeed.sectionName
        : existingBrace.section_name,
      l1_m: shouldFollowAutoNumber(existingBrace.l1_m, defaultBraceL1()) ? defaultBraceL1() : existingBrace.l1_m,
      l2_m: shouldFollowAutoNumber(existingBrace.l2_m, defaultBraceL2(previousSeed.supportCount))
        ? defaultBraceL2(nextSeed.supportCount)
        : existingBrace.l2_m,
      tributary_line_load_tf_per_m: shouldFollowAutoNumber(
        existingBrace.tributary_line_load_tf_per_m,
        roundValue(estimatedLineLoad(previousSeed)),
      )
        ? roundValue(estimatedLineLoad(nextSeed))
        : existingBrace.tributary_line_load_tf_per_m,
    };
    nextBraces[index] = updatedBrace;
  }

  return {
    ...nextProject,
    [waleKey]: nextWales,
    [braceKey]: nextBraces,
  };
}

function syncWaleRows(
  rows: WaleRow[],
  seeds: SupportSeed[],
  previousSeeds: SupportSeed[] = seeds,
): [WaleRow[], boolean] {
  if (seeds.length === 0) return [rows, false];
  const nextRows = [...rows];
  let changed = false;
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const previousSeed = previousSeeds[index] ?? seed;
    const defaultLineLoad = estimatedLineLoad(seed);
    const defaultRow = defaultWaleRow(seed, nextRows);
    const existing = nextRows[index];
    if (!existing) {
      nextRows.push(defaultRow);
      changed = true;
      continue;
    }
    const previousAutoSpan = autoWaleSpan(previousSeed.spacingM, previousSeed.supportCount);
    const nextAutoSpan = autoWaleSpan(defaultRow.support_spacing_m, defaultRow.wale_count);
    const shouldRefreshSpan =
      existing.span_m <= 0 ||
      nearlyEqual(existing.span_m, previousAutoSpan) ||
      existing.span_m > defaultRow.support_spacing_m;
    const shouldRefreshLineLoad =
      existing.line_load_tf_per_m <= 0 ||
      nearlyEqual(existing.line_load_tf_per_m, roundValue(estimatedLineLoad(previousSeed))) ||
      isAutoManagedWaleRow(existing, previousSeed);
    const updated: WaleRow = {
      ...existing,
      level_label: shouldFollowLevelLabel(existing.level_label, previousSeed.levelLabel)
        ? seed.levelLabel
        : existing.level_label,
      wale_count: shouldFollowSupportCount(existing.wale_count, previousSeed.supportCount)
        ? defaultRow.wale_count
        : existing.wale_count,
      section_name: shouldFollowSupportSection(existing.section_name, previousSeed.sectionName)
        ? defaultRow.section_name
        : existing.section_name,
      span_m: shouldRefreshSpan ? nextAutoSpan : existing.span_m,
      support_spacing_m: shouldFollowAutoNumber(existing.support_spacing_m, roundValue(previousSeed.spacingM))
        ? defaultRow.support_spacing_m
        : existing.support_spacing_m,
      line_load_tf_per_m: shouldRefreshLineLoad ? roundValue(defaultLineLoad) : existing.line_load_tf_per_m,
    };
    if (!isSameWaleRow(existing, updated)) {
      nextRows[index] = updated;
      changed = true;
    }
  }
  return [changed ? nextRows : rows, changed];
}

function syncBraceRows(
  rows: BraceRow[],
  seeds: SupportSeed[],
  previousSeeds: SupportSeed[] = seeds,
): [BraceRow[], boolean] {
  if (seeds.length === 0) return [rows, false];
  const nextRows = [...rows];
  let changed = false;
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const previousSeed = previousSeeds[index] ?? seed;
    const defaultRow = defaultBraceRow(seed, nextRows);
    const existing = nextRows[index];
    if (!existing) {
      nextRows.push(defaultRow);
      changed = true;
      continue;
    }
    const shouldRefreshTributaryLoad =
      existing.tributary_line_load_tf_per_m <= 0 ||
      nearlyEqual(existing.tributary_line_load_tf_per_m, roundValue(estimatedLineLoad(previousSeed))) ||
      isAutoManagedBraceRow(existing, previousSeed);
    const updated: BraceRow = {
      ...existing,
      level_label: shouldFollowLevelLabel(existing.level_label, previousSeed.levelLabel)
        ? seed.levelLabel
        : existing.level_label,
      section_name: shouldFollowSupportSection(existing.section_name, previousSeed.sectionName)
        ? defaultRow.section_name
        : existing.section_name,
      l1_m: shouldFollowAutoNumber(existing.l1_m, defaultBraceL1()) ? defaultRow.l1_m : existing.l1_m,
      l2_m: shouldFollowAutoNumber(existing.l2_m, defaultBraceL2(previousSeed.supportCount))
        ? defaultRow.l2_m
        : existing.l2_m,
      angle_deg: existing.angle_deg > 0 ? existing.angle_deg : defaultRow.angle_deg,
      tributary_line_load_tf_per_m: shouldRefreshTributaryLoad
        ? defaultRow.tributary_line_load_tf_per_m
        : existing.tributary_line_load_tf_per_m,
    };
    if (!isSameBraceRow(existing, updated)) {
      nextRows[index] = updated;
      changed = true;
    }
  }
  return [changed ? nextRows : rows, changed];
}

function syncCornerBraceRows(
  rows: CornerBraceRow[],
  seeds: SupportSeed[],
  previousSeeds: SupportSeed[] = seeds,
): [CornerBraceRow[], boolean] {
  if (seeds.length === 0) return [rows, false];
  const nextRows = [...rows];
  let changed = false;
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const previousSeed = previousSeeds[index] ?? seed;
    const defaultRow = defaultCornerBraceRow(seed, nextRows);
    const existing = nextRows[index];
    if (!existing) {
      nextRows.push(defaultRow);
      changed = true;
      continue;
    }
    const updated: CornerBraceRow = {
      ...existing,
      level_label: shouldFollowLevelLabel(existing.level_label, previousSeed.levelLabel)
        ? seed.levelLabel
        : existing.level_label,
      section_name: shouldFollowSupportSection(existing.section_name, previousSeed.sectionName)
        ? defaultRow.section_name
        : existing.section_name,
      length_m: shouldFollowAutoNumber(existing.length_m, defaultBraceL2(previousSeed.supportCount))
        ? defaultRow.length_m
        : existing.length_m,
      axial_force_t:
        existing.axial_force_t <= 0 ||
        nearlyEqual(existing.axial_force_t, roundValue(previousSeed.totalForceT)) ||
        isAutoManagedCornerBraceRow(existing, previousSeed)
          ? defaultRow.axial_force_t
          : existing.axial_force_t,
    };
    if (!isSameCornerBraceRow(existing, updated)) {
      nextRows[index] = updated;
      changed = true;
    }
  }
  return [changed ? nextRows : rows, changed];
}

function estimatedLineLoad(seed: SupportSeed): number {
  if (seed.spacingM <= 0) return 0;
  return (seed.totalForceT * seed.supportCount) / seed.spacingM;
}

function supportClearanceByCount(supportCount: number): number {
  return supportCount >= 2 ? 1.9 : 1.5;
}

function autoWaleSpan(spacingM: number, supportCount: number): number {
  return roundValue(Math.max(spacingM - supportClearanceByCount(supportCount), 0));
}

function defaultBraceL1(): number {
  return 1.5;
}

function defaultBraceL2(supportCount: number): number {
  return supportCount >= 2 ? 2.6 : 3.0;
}

function fallbackSectionName(
  seed: SupportSeed,
  rows: Array<{ section_name: string }>,
): string {
  if (seed.sectionName) return seed.sectionName;
  return rows.find((row) => row.section_name)?.section_name || "";
}

function defaultWaleRow(seed: SupportSeed, rows: WaleRow[]): WaleRow {
  return {
    level_label: seed.levelLabel,
    wale_count: seed.supportCount,
    section_name: fallbackSectionName(seed, rows),
    span_m: autoWaleSpan(seed.spacingM, seed.supportCount),
    support_spacing_m: roundValue(seed.spacingM),
    line_load_tf_per_m: roundValue(estimatedLineLoad(seed)),
  };
}

function defaultWaleRowForIndex(rows: WaleRow[], seeds: SupportSeed[], index: number): WaleRow {
  const seed = seeds[Math.min(index, Math.max(seeds.length - 1, 0))];
  return seed ? defaultWaleRow(seed, rows) : emptyWaleRow();
}

function defaultBraceRow(seed: SupportSeed, rows: BraceRow[]): BraceRow {
  return {
    level_label: seed.levelLabel,
    section_name: fallbackSectionName(seed, rows),
    l1_m: defaultBraceL1(),
    l2_m: defaultBraceL2(seed.supportCount),
    angle_deg: 45,
    tributary_line_load_tf_per_m: roundValue(estimatedLineLoad(seed)),
  };
}

function defaultBraceRowForIndex(rows: BraceRow[], seeds: SupportSeed[], index: number): BraceRow {
  const seed = seeds[Math.min(index, Math.max(seeds.length - 1, 0))];
  return seed ? defaultBraceRow(seed, rows) : emptyBraceRow();
}

function defaultCornerBraceRow(seed: SupportSeed, rows: CornerBraceRow[]): CornerBraceRow {
  return {
    level_label: seed.levelLabel,
    section_name: fallbackSectionName(seed, rows),
    length_m: defaultBraceL2(seed.supportCount),
    axial_force_t: roundValue(seed.totalForceT),
  };
}

function defaultCornerBraceRowForIndex(
  rows: CornerBraceRow[],
  seeds: SupportSeed[],
  index: number,
): CornerBraceRow {
  const seed = seeds[Math.min(index, Math.max(seeds.length - 1, 0))];
  return seed ? defaultCornerBraceRow(seed, rows) : emptyCornerBraceRow();
}

function nearlyEqual(left: number, right: number, epsilon = 1e-6): boolean {
  return Math.abs(left - right) <= epsilon;
}

function isSameSupportRow(left: SupportRow, right: SupportRow): boolean {
  return (
    left.level_label === right.level_label &&
    left.support_count === right.support_count &&
    left.section_name === right.section_name &&
    left.axial_force_t === right.axial_force_t &&
    left.temp_force_t === right.temp_force_t &&
    left.spacing_m === right.spacing_m
  );
}

function isSameWaleRow(left: WaleRow, right: WaleRow): boolean {
  return (
    left.level_label === right.level_label &&
    left.wale_count === right.wale_count &&
    left.section_name === right.section_name &&
    left.span_m === right.span_m &&
    left.support_spacing_m === right.support_spacing_m &&
    left.line_load_tf_per_m === right.line_load_tf_per_m
  );
}

function isSameBraceRow(left: BraceRow, right: BraceRow): boolean {
  return (
    left.level_label === right.level_label &&
    left.section_name === right.section_name &&
    left.l1_m === right.l1_m &&
    left.l2_m === right.l2_m &&
    left.angle_deg === right.angle_deg &&
    left.tributary_line_load_tf_per_m === right.tributary_line_load_tf_per_m
  );
}

function isSameCornerBraceRow(left: CornerBraceRow, right: CornerBraceRow): boolean {
  return (
    left.level_label === right.level_label &&
    left.section_name === right.section_name &&
    left.length_m === right.length_m &&
    left.axial_force_t === right.axial_force_t
  );
}

type ImportedStrutRow = {
  stageIndex: number;
  stageLabel: string;
  index: number;
  classification: "support" | "brace";
  depth_m: number;
  span_m: number;
  angle_deg: number;
  load_t: number;
  stiffness: number;
};

type ImportedIgnoredEventRow = {
  stageIndex: number;
  stageLabel: string;
  classification: "floor" | "remove" | "other";
  buttNo?: number | null;
  depth_m?: number | null;
  span_m?: number | null;
  angle_deg?: number | null;
  load_t?: number | null;
  stiffness?: number | null;
  description: string;
};

type ImportedAssignment = {
  id: string;
  kind: "support" | "brace";
  levelLabel: string;
  depth_m: number;
  span_m: number;
  angle_deg: number;
  load_t: number;
  stageLabels: string[];
};

type ImportSummary = {
  supportCount: number;
  braceCount: number;
  floorCount: number;
  removeCount: number;
  otherCount: number;
  candidateCount: number;
};

type StageImportRow = {
  index: number;
  label: string;
  excavation_depth_m?: number | null;
  water_level_m?: number | null;
  candidateCount: number;
  ignoredCount: number;
};

type LevelSummaryRow = {
  label: string;
  support: SummaryItem[];
  wale: SummaryItem[];
  brace: SummaryItem[];
  corner: SummaryItem[];
  worstRatio?: number | null;
  status: string;
};

type SummaryColumnKey = "support" | "wale" | "brace" | "corner";

type ColumnSummaryRow = {
  moduleName: string;
  label: string;
  sectionName: string;
  ratio?: number | null;
  status: string;
  note: string;
};

function buildLevelSummaryRows(rows: SummaryItem[]): LevelSummaryRow[] {
  const grouped = new Map<string, LevelSummaryRow>();
  for (const row of rows) {
    if (row.group === "柱構件") continue;
    const existing =
      grouped.get(row.label) ??
      {
        label: row.label,
        support: [],
        wale: [],
        brace: [],
        corner: [],
        worstRatio: null,
        status: "OK",
      };
    const bucket = summaryBucket(row.group);
    if (bucket === "support") existing.support.push(row);
    if (bucket === "wale") existing.wale.push(row);
    if (bucket === "brace") existing.brace.push(row);
    if (bucket === "corner") existing.corner.push(row);
    existing.worstRatio =
      existing.worstRatio === null
        ? normalizedRatio(row.utilization_ratio)
        : Math.max(normalizedRatio(existing.worstRatio), normalizedRatio(row.utilization_ratio));
    existing.status = combineStatus([existing.status, row.status]);
    grouped.set(row.label, existing);
  }

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      support: sortSummaryItems(row.support),
      wale: sortSummaryItems(row.wale),
      brace: sortSummaryItems(row.brace),
      corner: sortSummaryItems(row.corner),
    }))
    .sort((a, b) => compareLayerLabel(a.label, b.label));
}

const summaryColumnDefinitions: Array<{ key: SummaryColumnKey; label: string }> = [
  { key: "support", label: "水平支撐" },
  { key: "wale", label: "橫擋" },
  { key: "brace", label: "斜撐" },
  { key: "corner", label: "大角撐" },
];

function availableSummaryColumns(rows: SummaryItem[]): Array<{ key: SummaryColumnKey; label: string }> {
  const available = new Set<SummaryColumnKey>();
  rows.forEach((row) => {
    const bucket = summaryBucket(row.group);
    if (bucket !== "other") {
      available.add(bucket);
    }
  });
  return summaryColumnDefinitions.filter((column) => available.has(column.key));
}

function summaryRowItems(row: LevelSummaryRow, key: SummaryColumnKey): SummaryItem[] {
  return row[key];
}

function buildColumnSummaryRows(rows: CheckResult[]): ColumnSummaryRow[] {
  return rows.map((row) => {
    const warnings = Array.isArray(row.details.warnings)
      ? row.details.warnings.filter((item): item is string => typeof item === "string")
      : [];
    return {
      moduleName: row.module_name,
      label: row.label,
      sectionName: String(row.inputs["型號"] ?? "—"),
      ratio: row.utilization_ratio,
      status: row.status,
      note: warnings.length > 0 ? warnings.join("；") : row.controlling_condition,
    };
  });
}

function buildKeyControlRows(rows: CheckResult[]): CheckResult[] {
  const flagged = rows.filter((row) => row.status !== "OK");
  const source = flagged.length > 0 ? flagged : rows;
  return [...source]
    .sort((a, b) => normalizedRatio(b.utilization_ratio) - normalizedRatio(a.utilization_ratio))
    .slice(0, flagged.length > 0 ? undefined : 10);
}

function emptyImportSummary(): ImportSummary {
  return {
    supportCount: 0,
    braceCount: 0,
    floorCount: 0,
    removeCount: 0,
    otherCount: 0,
    candidateCount: 0,
  };
}

function buildImportSummary(analysisImport: AnalysisImportResult): ImportSummary {
  if (analysisImport.events.length > 0) {
    const summary = emptyImportSummary();
    for (const event of analysisImport.events) {
      if (event.classification === "support") summary.supportCount += 1;
      else if (event.classification === "brace") summary.braceCount += 1;
      else if (event.classification === "floor") summary.floorCount += 1;
      else if (event.classification === "remove") summary.removeCount += 1;
      else summary.otherCount += 1;
    }
    summary.candidateCount = summary.supportCount + summary.braceCount;
    return summary;
  }

  const rows = flattenImportedStruts(analysisImport);
  return {
    supportCount: rows.filter((row) => row.classification === "support").length,
    braceCount: rows.filter((row) => row.classification === "brace").length,
    floorCount: 0,
    removeCount: 0,
    otherCount: 0,
    candidateCount: rows.length,
  };
}

function buildStageImportRows(analysisImport: AnalysisImportResult): StageImportRow[] {
  if (analysisImport.events.length > 0) {
    const counts = new Map<number, { candidateCount: number; ignoredCount: number }>();
    for (const event of analysisImport.events) {
      const bucket = counts.get(event.stage_index) ?? { candidateCount: 0, ignoredCount: 0 };
      if (event.classification === "support" || event.classification === "brace") {
        bucket.candidateCount += 1;
      } else {
        bucket.ignoredCount += 1;
      }
      counts.set(event.stage_index, bucket);
    }
    return analysisImport.stages.map((stage) => {
      const bucket = counts.get(stage.index) ?? { candidateCount: 0, ignoredCount: 0 };
      return {
        index: stage.index,
        label: stage.label,
        excavation_depth_m: stage.excavation_depth_m,
        water_level_m: stage.water_level_m,
        candidateCount: bucket.candidateCount,
        ignoredCount: bucket.ignoredCount,
      };
    });
  }

  return analysisImport.stages.map((stage) => ({
    index: stage.index,
    label: stage.label,
    excavation_depth_m: stage.excavation_depth_m,
    water_level_m: stage.water_level_m,
    candidateCount: stage.struts.length,
    ignoredCount: 0,
  }));
}

function flattenImportedStruts(analysisImport: AnalysisImportResult): ImportedStrutRow[] {
  if (analysisImport.events.length > 0) {
    const rows = analysisImport.events.flatMap((event) => {
      if (!isCandidateEvent(event)) return [];
      if (
        event.depth_m === null ||
        event.depth_m === undefined ||
        event.span_m === null ||
        event.span_m === undefined ||
        event.angle_deg === null ||
        event.angle_deg === undefined ||
        event.load_t === null ||
        event.load_t === undefined ||
        event.stiffness === null ||
        event.stiffness === undefined
      ) {
        return [];
      }
      return [
        {
          stageIndex: event.stage_index,
          stageLabel: event.stage_label,
          index: event.butt_no ?? 0,
          classification: event.classification,
          depth_m: event.depth_m,
          span_m: event.span_m,
          angle_deg: event.angle_deg,
          load_t: event.load_t,
          stiffness: event.stiffness,
        },
      ];
    });
    if (rows.length > 0) return rows;
  }
  return analysisImport.stages.flatMap((stage) =>
    stage.struts.map((strut) => ({
      stageIndex: stage.index,
      stageLabel: stage.label,
      index: strut.index,
      classification: isSupportCandidate(strut.angle_deg) ? "support" : "brace",
      depth_m: strut.depth_m,
      span_m: strut.span_m,
      angle_deg: strut.angle_deg,
      load_t: strut.load_t,
      stiffness: strut.stiffness,
    })),
  );
}

function flattenIgnoredImportEvents(analysisImport: AnalysisImportResult): ImportedIgnoredEventRow[] {
  if (analysisImport.events.length === 0) return [];
  return analysisImport.events
    .filter(isIgnoredEvent)
    .map((event) => ({
      stageIndex: event.stage_index,
      stageLabel: event.stage_label,
      classification: event.classification,
      buttNo: event.butt_no,
      depth_m: event.depth_m,
      span_m: event.span_m,
      angle_deg: event.angle_deg,
      load_t: event.load_t,
      stiffness: event.stiffness,
      description: event.description,
    }));
}

function isCandidateEvent(event: AnalysisEvent): event is AnalysisEvent & { classification: "support" | "brace" } {
  return event.classification === "support" || event.classification === "brace";
}

function isIgnoredEvent(
  event: AnalysisEvent,
): event is AnalysisEvent & { classification: "floor" | "remove" | "other" } {
  return event.classification === "floor" || event.classification === "remove" || event.classification === "other";
}

function suggestedSupportType(
  angleDeg: number,
  classification?: ImportedStrutRow["classification"],
): string {
  if (classification === "support") return "水平支撐候選";
  if (classification === "brace") return "斜撐候選";
  if (Math.abs(angleDeg) <= 10) return "水平支撐候選";
  if (Math.abs(angleDeg) < 80) return "斜撐候選";
  return "特殊形式，請確認";
}

function buildImportedAssignments(
  analysisImport: AnalysisImportResult,
): ImportedAssignment[] {
  const consolidated = consolidateImportedStruts(flattenImportedStruts(analysisImport));
  const supports = consolidated.filter((item) => isSupportCandidate(item.angle_deg));
  const braces = consolidated.filter((item) => isBraceCandidate(item.angle_deg));
  return [
    ...assignCandidateRows(supports, "support"),
    ...assignCandidateRows(braces, "brace"),
  ];
}

function consolidateImportedStruts(rows: ImportedStrutRow[]): ImportedStrutRow[] {
  const grouped = new Map<string, ImportedStrutRow>();
  for (const row of rows) {
    const key = `${row.classification}-${row.index}-${row.depth_m.toFixed(2)}-${Math.abs(row.angle_deg).toFixed(1)}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...row });
      continue;
    }
    if (row.load_t >= existing.load_t) {
      grouped.set(key, {
        ...row,
        stageLabel: mergeStageLabels(existing.stageLabel, row.stageLabel),
      });
      continue;
    }
    existing.stageLabel = mergeStageLabels(existing.stageLabel, row.stageLabel);
    existing.span_m = Math.max(existing.span_m, row.span_m);
    existing.stiffness = Math.max(existing.stiffness, row.stiffness);
  }
  return [...grouped.values()].sort(
    (left, right) =>
      left.depth_m - right.depth_m || left.index - right.index || left.stageIndex - right.stageIndex,
  );
}

function mergeStageLabels(left: string, right: string): string {
  const labels = new Set([...left.split("、"), ...right.split("、")].filter(Boolean));
  return [...labels].join("、");
}

function assignCandidateRows(
  rows: ImportedStrutRow[],
  kind: "support" | "brace",
): ImportedAssignment[] {
  return rows.map((row, index) => ({
    id: `${kind}-${row.index}-${row.depth_m.toFixed(2)}-${index}`,
    kind,
    levelLabel: String(index + 1),
    depth_m: row.depth_m,
    span_m: row.span_m,
    angle_deg: row.angle_deg,
    load_t: row.load_t,
    stageLabels: row.stageLabel.split("、").filter(Boolean),
  }));
}

function toCandidateSupportRow(
  item: ImportedAssignment,
  existingRows: SupportRow[],
  index: number,
  useDefaultTempForce: boolean,
): SupportRow {
  const existingTempForce = existingRows[index]?.temp_force_t ?? 0;
  return {
    level_label: item.levelLabel,
    support_count: existingRows[index]?.support_count ?? 1,
    section_name: pickSectionName(existingRows, index),
    axial_force_t: roundValue(item.load_t),
    temp_force_t:
      existingTempForce > 0 ? existingTempForce : normalizeSupportTempForce(0, index, useDefaultTempForce),
    spacing_m: roundValue(item.span_m),
  };
}

function toCandidateBraceRow(
  item: ImportedAssignment,
  existingRows: BraceRow[],
  index: number,
): BraceRow {
  const baseLength = Math.max(item.span_m, 0.001);
  const tributaryLineLoad =
    item.load_t * Math.sin((Math.abs(item.angle_deg) * Math.PI) / 180) / baseLength;
  return {
    level_label: item.levelLabel,
    section_name: pickSectionName(existingRows, index),
    l1_m: roundValue(baseLength),
    l2_m: roundValue(baseLength),
    angle_deg: roundValue(item.angle_deg),
    tributary_line_load_tf_per_m: roundValue(tributaryLineLoad),
  };
}

function pickSectionName<T extends { section_name: string }>(rows: T[], index: number): string {
  return rows[index]?.section_name || rows[0]?.section_name || "";
}

function roundValue(value: number): number {
  return Number(value.toFixed(3));
}

function isSupportCandidate(angleDeg: number): boolean {
  return Math.abs(angleDeg) <= 10;
}

function isBraceCandidate(angleDeg: number): boolean {
  return Math.abs(angleDeg) > 10 && Math.abs(angleDeg) < 80;
}

function candidateKindLabel(kind: ImportedAssignment["kind"]): string {
  return kind === "support" ? "水平支撐候選" : "斜撐候選";
}

function ignoredEventLabel(classification: ImportedIgnoredEventRow["classification"]): string {
  if (classification === "floor") return "樓版 / 樓層事件";
  if (classification === "remove") return "拆撐事件";
  return "其他事件";
}

function otherAnalysisSide(side: AnalysisSourceSide): AnalysisSourceSide {
  return side === "top" ? "bottom" : "top";
}

function deriveSingleAnalysisSide(
  topMode: AnalysisSourceMode,
  bottomMode: AnalysisSourceMode,
): AnalysisSourceSide | null {
  const topActive = topMode !== "unused";
  const bottomActive = bottomMode !== "unused";
  if (topActive && !bottomActive) return "top";
  if (bottomActive && !topActive) return "bottom";
  return null;
}

function deriveAnalysisWorkflowMode(
  topMode: AnalysisSourceMode,
  bottomMode: AnalysisSourceMode,
): AnalysisWorkflowMode {
  if (topMode === "manual" && bottomMode === "unused") return "single_manual";
  if (topMode === "unused" && bottomMode === "manual") return "single_manual";
  if (topMode === "import" && bottomMode === "unused") return "single_import";
  if (topMode === "unused" && bottomMode === "import") return "single_import";
  if (topMode === "manual" && bottomMode === "manual") return "dual_manual";
  if (topMode === "import" && bottomMode === "import") return "dual_import";
  return "mixed";
}

function analysisWorkflowModeLabel(mode: AnalysisWorkflowMode): string {
  return analysisWorkflowOptions.find((option) => option.value === mode)?.label ?? "進階混合";
}

function analysisWorkflowHint(
  mode: AnalysisWorkflowMode,
  side: AnalysisSourceSide,
): string {
  const sideLabel = sidePrefixLabel(side);
  if (mode === "single_manual") {
    return `單層手動模式會只顯示 ${sideLabel} 的整頁輸入表，適合直接輸入 N1、N2、間距與支撐型號。`;
  }
  if (mode === "dual_manual") {
    return "雙層手動模式改成上下堆疊，先完成上層，再往下整理下層，閱讀與輸入都更直覺。";
  }
  if (mode === "single_import") {
    return `單層匯入模式只整理 ${sideLabel} 一側資料，可先核對事件分類與候選列，再帶到後續設計頁。`;
  }
  if (mode === "dual_import") {
    return "雙層匯入模式會依序整理上層與下層，不再一開始就把兩張窄卡同時攤開。";
  }
  return "進階混合模式適合上層與下層採不同資料來源時使用，可個別切換匯入、手動或不使用。";
}

function setAnalysisSourceModeOnProject(
  project: ProjectState,
  side: AnalysisSourceSide,
  mode: AnalysisSourceMode,
): ProjectState {
  const nextProject = {
    ...project,
    top_analysis_source: { ...project.top_analysis_source },
    bottom_analysis_source: { ...project.bottom_analysis_source },
    calculation_options: { ...project.calculation_options },
    calculation_results: null,
  };
  const targetSource =
    side === "top" ? nextProject.top_analysis_source : nextProject.bottom_analysis_source;
  targetSource.mode = mode;

  if (side === "top") {
    if (mode === "unused") {
      nextProject.calculation_options.include_top_supports = false;
      nextProject.calculation_options.include_top_wales = false;
      nextProject.calculation_options.include_top_braces = false;
      if (!nextProject.calculation_options.include_bottom_supports) {
        nextProject.calculation_options.include_bottom_supports = true;
      }
    } else {
      nextProject.calculation_options.include_top_supports = true;
      if (nextProject.top_supports.length === 0) {
        nextProject.top_supports = [
          emptySupportRow(0, nextProject.calculation_options.auto_temp_force_top_supports),
        ];
      }
    }
  } else if (mode === "unused") {
    nextProject.calculation_options.include_bottom_supports = false;
    nextProject.calculation_options.include_bottom_wales = false;
    nextProject.calculation_options.include_bottom_braces = false;
    if (!nextProject.calculation_options.include_top_supports) {
      nextProject.calculation_options.include_top_supports = true;
    }
  } else {
    nextProject.calculation_options.include_bottom_supports = true;
    if (nextProject.bottom_supports.length === 0) {
      nextProject.bottom_supports = [
        emptySupportRow(0, nextProject.calculation_options.auto_temp_force_bottom_supports),
      ];
    }
  }

  return nextProject;
}

function analysisSourceModeLabel(mode: AnalysisSourceMode): string {
  if (mode === "import") return "匯入分析檔";
  if (mode === "manual") return "手動輸入";
  return "不使用";
}

function supportModeLabel(options: CalculationOptions): string {
  if (options.include_top_supports && options.include_bottom_supports) {
    return "雙向支撐";
  }
  if (options.include_top_supports) {
    return "單向支撐（上層）";
  }
  if (options.include_bottom_supports) {
    return "單向支撐（下層）";
  }
  return "未設定";
}

function sidePrefixLabel(side: "top" | "bottom"): string {
  return side === "top" ? "上層" : "下層";
}

function isSingleModuleMode(topEnabled: boolean, bottomEnabled: boolean): boolean {
  return topEnabled !== bottomEnabled;
}

function activeModuleSide(topEnabled: boolean, bottomEnabled: boolean): "top" | "bottom" | null {
  if (topEnabled && !bottomEnabled) return "top";
  if (bottomEnabled && !topEnabled) return "bottom";
  return null;
}

function editingModuleTitle(
  side: "top" | "bottom",
  baseName: string,
  topEnabled: boolean,
  bottomEnabled: boolean,
): string {
  const activeSide = activeModuleSide(topEnabled, bottomEnabled);
  if (activeSide === side) return baseName;
  return `${sidePrefixLabel(side)}${baseName}`;
}

function hasTextValue(value: string): boolean {
  return value.trim().length > 0;
}

function hasPositiveValue(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isSupportRowComplete(row: SupportRow): boolean {
  return hasTextValue(row.level_label) && row.support_count > 0 && hasTextValue(row.section_name) && hasPositiveValue(row.spacing_m);
}

function isWaleRowComplete(row: WaleRow): boolean {
  return hasTextValue(row.level_label) && row.wale_count > 0 && hasTextValue(row.section_name) && hasPositiveValue(row.span_m) && hasPositiveValue(row.support_spacing_m);
}

function isBraceRowComplete(row: BraceRow): boolean {
  return hasTextValue(row.level_label) && hasTextValue(row.section_name) && hasPositiveValue(row.l1_m) && hasPositiveValue(row.l2_m) && hasPositiveValue(row.angle_deg);
}

function isCornerBraceRowComplete(row: CornerBraceRow): boolean {
  return hasTextValue(row.level_label) && hasTextValue(row.section_name) && hasPositiveValue(row.length_m);
}

function columnInputComplete(column: ColumnScenarioInput): boolean {
  return (
    hasTextValue(column.column_section_name) &&
    hasTextValue(column.foundation_type) &&
    hasTextValue(column.foundation_shape) &&
    hasPositiveValue(column.foundation_size_x_m) &&
    hasPositiveValue(column.foundation_size_y_m) &&
    hasPositiveValue(column.column_length_m) &&
    hasPositiveValue(column.kh_kg_per_cm3) &&
    hasPositiveValue(column.bottom_to_excavation_distance_m) &&
    hasPositiveValue(column.embedment_length_cm) &&
    hasPositiveValue(column.concrete_strength_kg_per_cm2)
  );
}

function rowCompletionSummary<T>(rows: T[], checker: (row: T) => boolean): string {
  if (rows.length === 0) return "尚未建立";
  const completed = rows.filter(checker).length;
  if (completed === rows.length) return `已齊 ${completed}/${rows.length}`;
  return `待補 ${rows.length - completed} 列`;
}

function columnCompletionSummary(column: ColumnScenarioInput): string {
  if (!column.enabled) return "未納入檢討";
  return columnInputComplete(column) ? "已齊" : "待補 1 組";
}

function moduleStateSummary(enabled: boolean, rowCount: number, completion: string): string {
  if (!enabled) return `不考慮 / 保留 ${rowCount} 列`;
  return `${rowCount} 列 / ${completion}`;
}

function moduleShortcutLabel(label: string, enabled: boolean, rowCount: number, completion: string): string {
  if (!enabled) return `${label} · 不考慮`;
  if (completion.startsWith("待補")) return `${label} · ${rowCount}列 · ${completion}`;
  if (completion.startsWith("已齊")) return `${label} · ${rowCount}列 · 已齊`;
  return `${label} · ${completion}`;
}

function usesConcreteWallParameters(wallType: string | null | undefined): boolean {
  return normalizeWallTypeValue(wallType ?? "") === "連續壁";
}

function normalizeWallTypeValue(value: string): string {
  const compact = value.replace(/\s+/g, "");
  if (compact.includes("連續") || compact.includes("连续")) return "連續壁";
  if (compact.includes("鋼板")) return "鋼板樁";
  return "其他";
}

function countCustomizedAdvancedSettings(
  params: ProjectState["basic_parameters"] | null | undefined,
): number {
  if (!params) return 0;
  return ([
    !nearlyEqual(params.alpha_support, ADVANCED_PARAMETER_DEFAULTS.alpha_support),
    !nearlyEqual(params.alpha_wale, ADVANCED_PARAMETER_DEFAULTS.alpha_wale),
    !nearlyEqual(params.alpha_brace, ADVANCED_PARAMETER_DEFAULTS.alpha_brace),
    !nearlyEqual(params.alpha_corner_brace, ADVANCED_PARAMETER_DEFAULTS.alpha_corner_brace),
    !nearlyEqual(params.alpha_column, ADVANCED_PARAMETER_DEFAULTS.alpha_column),
    !nearlyEqual(params.psi_material, ADVANCED_PARAMETER_DEFAULTS.psi_material),
  ].filter(Boolean)).length;
}

function buildComponentTabSummary(
  items: Array<string | null>,
  options: { emptyLabel: string; completeLabel: string },
): string {
  const values = items.filter(Boolean) as string[];
  if (values.length === 0) return options.emptyLabel;
  if (values.every((value) => value.startsWith("已齊"))) return options.completeLabel;
  const waiting = values.filter((value) => value.startsWith("待補")).length;
  if (waiting > 0) return `待補 ${waiting} 組`;
  if (values.some((value) => value.startsWith("尚未"))) return "尚未建立";
  return values.join(" / ");
}

function buildComponentTabTone(
  items: Array<string | null>,
  emptyAsMuted = false,
): "ok" | "warn" | "muted" {
  const values = items.filter(Boolean) as string[];
  if (values.length === 0) return emptyAsMuted ? "muted" : "warn";
  if (values.every((value) => value.startsWith("已齊"))) return "ok";
  return "warn";
}

function componentTabForPanel(panelId: string): ComponentTabKey | null {
  if (panelId.includes("supports")) return "support";
  if (panelId.includes("wales")) return "wale";
  if (panelId.includes("braces")) return panelId.includes("corner") ? "corner" : "brace";
  return null;
}

function analysisSourceCompletion(
  mode: AnalysisSourceMode,
  source: AnalysisSideSource,
  manualRows: SupportRow[],
  importedAssignments: ImportedAssignment[],
  summary: ImportSummary,
): string {
  if (mode === "unused") return "未納入";
  if (mode === "manual") return rowCompletionSummary(manualRows, isSupportRowComplete);
  if (!source.import_result.source_name) return "尚未匯入";
  if (summary.otherCount > 0) return `待判讀 ${summary.otherCount} 筆`;
  if (importedAssignments.length > 0) return `已整理 ${importedAssignments.length} 筆`;
  if (summary.candidateCount > 0) return "待重建草稿";
  return "未辨識候選";
}

function analysisSourceTone(mode: AnalysisSourceMode, completion: string): string {
  if (mode === "unused") return "muted";
  if (completion.startsWith("已齊") || completion.startsWith("已整理")) return "ok";
  if (completion.startsWith("尚未")) return "muted";
  return "warn";
}

function columnVariantLabel(variant: ColumnScenarioInput["variant"]): string {
  return (
    columnVariantOptions.find((option) => option.value === variant)?.label ?? "柱構件"
  );
}

function activeSupportRows(project: ProjectState): SupportRow[] {
  return [
    ...(project.calculation_options.include_top_supports ? project.top_supports : []),
    ...(project.calculation_options.include_bottom_supports ? project.bottom_supports : []),
  ].map((row) => ({ ...row }));
}

function createColumnScenario(
  project: ProjectState,
  variant: ColumnScenarioInput["variant"],
): ColumnScenarioInput {
  return {
    title: columnVariantLabel(variant),
    variant,
    enabled: true,
    column_section_name: "",
    support_rows: activeSupportRows(project),
    foundation_type: foundationTypeOptions[0],
    foundation_shape: foundationShapeOptions[0],
    foundation_size_x_m: 0.8,
    foundation_size_y_m: 2.5,
    column_length_m: 20.0,
    kh_kg_per_cm3: 4.0,
    pile_width_cm: null,
    bottom_to_excavation_distance_m: 4.0,
    eccentricity_x_m: null,
    eccentricity_y_m: 0.0,
    embedment_length_cm: 300.0,
    concrete_strength_kg_per_cm2: 175.0,
    soil_layers: toFoundationSoils(project.analysis_import.soils),
    compression_fs: 2.0,
    tension_fs: 3.0,
    pile_unit_weight_t_per_m3: 1.8,
  };
}

function defaultColumnEccentricityX(column: ColumnScenarioInput, section: SectionProperty | null): number {
  if (column.eccentricity_x_m !== null && column.eccentricity_x_m !== undefined) {
    return column.eccentricity_x_m;
  }
  if (section) {
    return roundValue(section.depth_cm / 200.0 + 0.2);
  }
  return 0.2;
}

function summaryBucket(group: string): "support" | "wale" | "brace" | "corner" | "other" {
  if (group.includes("水平支撐")) return "support";
  if (group.includes("橫擋")) return "wale";
  if (group.includes("斜撐")) return "brace";
  if (group.includes("角撐")) return "corner";
  return "other";
}

function sortSummaryItems(items: SummaryItem[]): SummaryItem[] {
  return [...items].sort((a, b) => groupOrder(a.group) - groupOrder(b.group));
}

function groupOrder(group: string): number {
  if (group.startsWith("上")) return 0;
  if (group.startsWith("下")) return 1;
  return 2;
}

function groupPrefix(group: string, options: CalculationOptions): string {
  if (group.includes("水平支撐") && isSingleModuleMode(options.include_top_supports, options.include_bottom_supports)) return "";
  if (group.includes("橫擋") && isSingleModuleMode(options.include_top_wales, options.include_bottom_wales)) return "";
  if (group.includes("斜撐") && isSingleModuleMode(options.include_top_braces, options.include_bottom_braces)) return "";
  if (group.startsWith("上")) return "上";
  if (group.startsWith("下")) return "下";
  return "";
}

function summaryHeadline(item: SummaryItem, options: CalculationOptions): string {
  return `${groupPrefix(item.group, options)} ${fmtRatio(item.utilization_ratio)} ${item.status}`.trim();
}

function summarySectionName(item: SummaryItem): string {
  return item.section_name ? `型號：${item.section_name}` : "型號：未選型號";
}

function wallMomentStrength(params: ProjectState["basic_parameters"] | null | undefined): number {
  if (!params || !usesConcreteWallParameters(params.wall_type)) return 0;
  return (
    0.9 *
    2.0 *
    Math.sqrt(params.wall_fc_kg_per_cm2) *
    (100.0 * params.wall_thickness_cm * params.wall_thickness_cm / 6.0) /
    100000.0
  );
}

function wallShearStrength(params: ProjectState["basic_parameters"] | null | undefined): number {
  if (!params || !usesConcreteWallParameters(params.wall_type)) return 0;
  return (
    0.75 *
    0.53 *
    Math.sqrt(params.wall_fc_kg_per_cm2) *
    (100.0 * params.wall_thickness_cm) /
    1000.0
  );
}

function displayCheckModuleName(moduleName: string, options: CalculationOptions): string {
  if (moduleName.includes("水平支撐") && isSingleModuleMode(options.include_top_supports, options.include_bottom_supports)) {
    return "水平支撐";
  }
  if (moduleName.includes("橫擋") && isSingleModuleMode(options.include_top_wales, options.include_bottom_wales)) {
    return "橫擋";
  }
  if (moduleName.includes("斜撐") && isSingleModuleMode(options.include_top_braces, options.include_bottom_braces)) {
    return "斜撐";
  }
  return moduleName;
}

function locateLabelForModule(moduleName: string): string {
  if (moduleName.includes("柱")) return "前往柱構件";
  return "前往支撐設定";
}

function panelTargetForModule(
  moduleName: string,
  options: CalculationOptions,
): { step: number; panelId?: string } {
  if (moduleName.includes("柱")) {
    return { step: STEP_COLUMNS, panelId: "column-settings-panel" };
  }
  if (moduleName.includes("角撐")) {
    return { step: STEP_COMPONENTS, panelId: "corner-braces-panel" };
  }
  const supportSide = inferModuleSide(moduleName, options);
  if (moduleName.includes("水平支撐")) {
    return { step: STEP_COMPONENTS, panelId: supportSide === "bottom" ? "bottom-supports-panel" : "top-supports-panel" };
  }
  if (moduleName.includes("橫擋")) {
    return { step: STEP_COMPONENTS, panelId: supportSide === "bottom" ? "bottom-wales-panel" : "top-wales-panel" };
  }
  if (moduleName.includes("斜撐")) {
    return { step: STEP_COMPONENTS, panelId: supportSide === "bottom" ? "bottom-braces-panel" : "top-braces-panel" };
  }
  return { step: STEP_COMPONENTS };
}

function inferModuleSide(moduleName: string, options: CalculationOptions): "top" | "bottom" {
  if (moduleName.startsWith("下")) return "bottom";
  if (moduleName.startsWith("上")) return "top";
  if (moduleName.includes("水平支撐")) {
    return activeModuleSide(options.include_top_supports, options.include_bottom_supports) ?? "top";
  }
  if (moduleName.includes("橫擋")) {
    return activeModuleSide(options.include_top_wales, options.include_bottom_wales) ?? "top";
  }
  if (moduleName.includes("斜撐")) {
    return activeModuleSide(options.include_top_braces, options.include_bottom_braces) ?? "top";
  }
  return "top";
}

function panelFocusClass(activePanelId: string | null, panelId: string): string {
  return activePanelId === panelId ? "panel-focus-ring" : "";
}

function combineStatus(statuses: string[]): string {
  if (statuses.includes("NG")) return "NG";
  if (statuses.includes("Say~OK")) return "Say~OK";
  return "OK";
}

function compareLayerLabel(left: string, right: string): number {
  const leftValue = Number(left);
  const rightValue = Number(right);
  if (Number.isFinite(leftValue) && Number.isFinite(rightValue)) {
    return leftValue - rightValue;
  }
  return left.localeCompare(right, "zh-Hant");
}

function normalizedRatio(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return Math.max(0, value);
}

function fmtRatio(value: number | null | undefined): string {
  return fmt(normalizedRatio(value));
}

function formatDemandAllowable(row: CheckResult): string {
  return `${fmt(row.computed_value)} / ${fmt(row.allowable_value)}`;
}

function statusTone(status: string): "ok" | "warn" | "ng" {
  if (status === "NG") return "ng";
  if (status === "Say~OK") return "warn";
  return "ok";
}

function fmt(value: number | string | null | undefined, suffix = ""): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return `${value.toFixed(3)}${suffix ? ` ${suffix}` : ""}`;
  return value;
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtClock(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function serializeProjectState(project: ProjectState): string {
  return JSON.stringify(project);
}

export default App;
