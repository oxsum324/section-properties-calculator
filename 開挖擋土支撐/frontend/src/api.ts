import {
  BootstrapPayload,
  ProjectListItem,
  ProjectState,
  ReferenceData,
  ReportPayload,
} from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export const api = {
  bootstrap: () => request<BootstrapPayload>("/api/bootstrap"),
  getReferenceData: () => request<ReferenceData>("/api/reference-data"),
  saveReferenceData: (referenceData: ReferenceData) =>
    request<ReferenceData>("/api/reference-data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference_data: referenceData }),
    }),
  resetReferenceData: () =>
    request<ReferenceData>("/api/reference-data", {
      method: "DELETE",
    }),
  listProjects: () => request<ProjectListItem[]>("/api/projects"),
  createProject: (name: string) =>
    request<ProjectState>("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  getProject: (projectId: string) => request<ProjectState>(`/api/projects/${projectId}`),
  saveProject: (project: ProjectState) =>
    request<{ project: ProjectState }>(`/api/projects/${project.metadata.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project }),
    }),
  importAnalysis: async (projectId: string, side: "top" | "bottom", file: File) => {
    const form = new FormData();
    form.append("side", side);
    form.append("file", file);
    return request<ProjectState>(`/api/projects/${projectId}/import-analysis`, {
      method: "POST",
      body: form,
    });
  },
  calculate: (projectId: string) =>
    request<ProjectState>(`/api/projects/${projectId}/calculate`, { method: "POST" }),
  generateReport: (projectId: string, concise = false) =>
    request<ReportPayload>(`/api/projects/${projectId}/report?concise=${concise ? "true" : "false"}`, {
      method: "POST",
    }),
  generateWordReport: (projectId: string, concise = false) =>
    request<ReportPayload>(`/api/projects/${projectId}/report/docx?concise=${concise ? "true" : "false"}`, {
      method: "POST",
    }),
};
