import { summarizeCompanyProjects } from "@/lib/crm/summaries";
import { PROJECT_PHASES, type ProjectPhase } from "@/lib/crm/projects";
import { toast } from "@crm/notifications/toast";
import { create } from "zustand";
import { type Company, type SortKey } from "@/data/companies";
import type { CrmSnapshot } from "@/lib/crm/types";
import type { Entity } from "@/lib/crm/validation";
import { isRole } from "@/lib/access-policy";
import { DEFAULT_FILTERS } from "@/lib/companies";

type CompaniesState = {
  projectPartners: CrmSnapshot["projectPartners"];
  projectSubmissions: CrmSnapshot["projectSubmissions"];
  companies: CrmSnapshot["companies"];
  contacts: CrmSnapshot["contacts"];
  deals: CrmSnapshot["deals"];
  tasks: CrmSnapshot["tasks"];
  activities: CrmSnapshot["activities"];
  projectFiles: CrmSnapshot["projectFiles"];
  projectDecisions: CrmSnapshot["projectDecisions"];
  feeMilestones: CrmSnapshot["feeMilestones"];
  paymentReceipts: CrmSnapshot["paymentReceipts"];
  phaseSchedules: CrmSnapshot["phaseSchedules"];
  projectDeliverables: CrmSnapshot["projectDeliverables"];
  accessState: "checking" | "allowed" | "denied" | "unavailable";
  accessEpoch: number;
  checkAccess: (hide?: boolean) => Promise<boolean>;
  blockAccess: (state: "denied" | "unavailable", error: string) => void;
  exportCompanies: () => Promise<Blob | null>;
  canWrite: boolean;
  loading: boolean;
  saving: boolean;
  projectPhaseSaves: Record<string, ProjectPhase>;
  projectPhaseRevisions: Record<string, number>;
  changeProjectPhase: (id: string, phase: ProjectPhase) => Promise<boolean>;
  error: string | null;
  refresh: () => Promise<void>;
  mutate: (
    entity: Entity,
    method: "POST" | "PATCH" | "DELETE",
    data: unknown,
  ) => Promise<boolean>;
  sortBy: SortKey;
  owner: string;
  stage: string;
  activityWindow: number;
  selectedIds: string[];
  projectId: string | null;
  openProject: (id: string) => void;
  closeProject: () => void;
  detailId: string | null;
  detailOpen: boolean;
  profileName: string | null;
  profileOpen: boolean;
  newCompanyOpen: boolean;
  sidebarOpen: boolean;
  searchOpen: boolean;
  unreadNotificationIds: string[];
  activeTab: string;
  setSortBy: (sortBy: SortKey) => void;
  setOwner: (owner: string) => void;
  setStage: (stage: string) => void;
  setActivityWindow: (days: number) => void;
  resetFilters: () => void;
  toggleSelected: (id: string) => void;
  setSelected: (ids: string[]) => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  openProfile: (name: string) => void;
  closeProfile: () => void;
  setNewCompanyOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  setActiveTab: (tab: string) => void;
  addCompany: (company: Company) => Promise<boolean>;
};

function projectPhaseView(
  deals: CrmSnapshot["deals"],
  companies: CrmSnapshot["companies"],
) {
  return {
    deals,
    companies: companies.map((company) => ({
      ...company,
      ...summarizeCompanyProjects(
        deals.filter((d) => d.companyId === company.id),
      ),
    })),
  };
}

export const useCompaniesStore = create<CompaniesState>((set, get) => ({
  projectPartners: [],
  projectSubmissions: [],
  companies: [],
  contacts: [],
  deals: [],
  tasks: [],
  activities: [],
  projectFiles: [],
  projectDecisions: [],
  feeMilestones: [],
  paymentReceipts: [],
  phaseSchedules: [],
  projectDeliverables: [],
  accessState: "checking",
  accessEpoch: 0,
  canWrite: false,
  loading: true,
  saving: false,
  projectPhaseSaves: {},
  projectPhaseRevisions: {},
  error: null,
  blockAccess: (accessState, error) => {
    toast.dismiss();
    set((state) => ({
      accessState,
      accessEpoch: state.accessEpoch + 1,
      error,
      projectPhaseSaves: {},
      projectPhaseRevisions: {},
      projectPartners: [],
      projectSubmissions: [],
      companies: [],
      contacts: [],
      deals: [],
      tasks: [],
      activities: [],
      projectFiles: [],
      projectDecisions: [],
      feeMilestones: [],
      paymentReceipts: [],
      phaseSchedules: [],
      projectDeliverables: [],
      canWrite: false,
      loading: false,
      saving: false,
      selectedIds: [],
      detailId: null,
      projectId: null,
      detailOpen: false,
      profileName: null,
      profileOpen: false,
      newCompanyOpen: false,
      searchOpen: false,
      unreadNotificationIds: [],
    }));
  },
  checkAccess: async (hide = false) => {
    if (hide)
      set((state) => ({
        accessState: "checking",
        accessEpoch: state.accessEpoch + 1,
        projectPhaseSaves: {},
        loading: true,
      }));
    const epoch = get().accessEpoch;
    try {
      const response = await fetch("/api/auth/access", {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (epoch !== get().accessEpoch) return false;
      if (!response.ok) {
        get().blockAccess(
          [401, 403].includes(response.status) ? "denied" : "unavailable",
          "Workspace access is no longer available. Sign in again or contact your administrator.",
        );
        return false;
      }
      const data = await response.json();
      if (epoch !== get().accessEpoch) return false;
      if (!isRole(data.role)) throw new Error("Invalid access response.");
      set({
        accessState: "allowed",
        canWrite: data.role === "admin" || data.role === "member",
        error: null,
      });
      return true;
    } catch {
      if (epoch === get().accessEpoch)
        get().blockAccess(
          "unavailable",
          "Could not verify workspace access. Reconnect and try again.",
        );
      return false;
    }
  },
  refresh: async () => {
    const epoch = get().accessEpoch;
    const phaseRevisions = get().projectPhaseRevisions;
    try {
      const response = await fetch("/api/crm", { cache: "no-store" });
      const data = await response.json();
      if (epoch !== get().accessEpoch) return;
      if (!response.ok) {
        get().blockAccess(
          [401, 403].includes(response.status) ? "denied" : "unavailable",
          data.error || "Could not load CRM records.",
        );
        return;
      }
      const current = get();
      const deals = data.deals.map((deal: CrmSnapshot["deals"][number]) => {
        const phase =
          current.projectPhaseSaves[deal.id] ??
          ((phaseRevisions[deal.id] ?? 0) !==
          (current.projectPhaseRevisions[deal.id] ?? 0)
            ? current.deals.find((p) => p.id === deal.id)?.stage
            : undefined);
        return phase ? { ...deal, stage: phase } : deal;
      });
      set({
        ...data,
        ...projectPhaseView(deals, data.companies),
        canWrite: data.role === "admin" || data.role === "member",
        loading: false,
        error: null,
      });
    } catch {
      if (epoch === get().accessEpoch)
        get().blockAccess(
          "unavailable",
          "Could not verify workspace access. Reconnect and try again.",
        );
    }
  },
  exportCompanies: async () => {
    if (get().accessState !== "allowed") return null;
    const epoch = get().accessEpoch;
    const { sortBy, owner, stage, activityWindow } = get();
    try {
      const response = await fetch("/api/crm/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortBy, owner, stage, activityWindow }),
      });
      if (epoch !== get().accessEpoch || get().accessState !== "allowed")
        return null;
      if (!response.ok) {
        if ([401, 403].includes(response.status))
          get().blockAccess(
            "denied",
            "Your workspace access has been revoked.",
          );
        else
          get().blockAccess(
            "unavailable",
            "Could not verify access for export. Please try again.",
          );
        return null;
      }
      const blob = await response.blob();
      return epoch === get().accessEpoch && get().accessState === "allowed"
        ? blob
        : null;
    } catch {
      if (epoch === get().accessEpoch)
        get().blockAccess(
          "unavailable",
          "Could not verify access for export. Reconnect and try again.",
        );
      return null;
    }
  },
  changeProjectPhase: async (id, stage) => {
    const current = get();
    const project = current.deals.find((p) => p.id === id);
    if (
      !project ||
      current.accessState !== "allowed" ||
      !current.canWrite ||
      current.saving ||
      current.projectPhaseSaves[id] ||
      !PROJECT_PHASES.includes(stage)
    )
      return false;
    if (project.stage === stage) return true;
    const epoch = current.accessEpoch;
    let shouldRefreshPhase = true;
    set((state) => ({
      ...projectPhaseView(
        state.deals.map((p) => (p.id === id ? { ...p, stage } : p)),
        state.companies,
      ),
      projectPhaseSaves: { ...state.projectPhaseSaves, [id]: stage },
      projectPhaseRevisions: {
        ...state.projectPhaseRevisions,
        [id]: (state.projectPhaseRevisions[id] ?? 0) + 1,
      },
      error: null,
    }));
    try {
      const response = await fetch("/api/crm/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "changePhase",
          id,
          stage,
          expectedStage: project.stage,
        }),
      });
      const result = await response.json();
      shouldRefreshPhase = response.status === 404 || response.status === 409;
      if (epoch !== get().accessEpoch) return false;
      if (!response.ok) {
        if (response.status === 401)
          get().blockAccess("denied", "Sign in to your workspace.");
        if (response.status === 403) await get().checkAccess();
        throw new Error(result.error || "Could not save the project phase.");
      }
      toast.success("Project phase updated", `${project.title} · ${stage}`);
      return true;
    } catch (error) {
      if (epoch === get().accessEpoch) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not save the project phase.";
        set((state) => ({
          ...projectPhaseView(
            state.deals.map((p) =>
              p.id === id ? { ...p, stage: project.stage } : p,
            ),
            state.companies,
          ),
          error: message,
        }));
        toast.error("Could not update project phase", message);
      }
      return false;
    } finally {
      if (epoch === get().accessEpoch)
        set((state) => {
          const pending = { ...state.projectPhaseSaves };
          delete pending[id];
          return {
            projectPhaseSaves: pending,
            projectPhaseRevisions: {
              ...state.projectPhaseRevisions,
              [id]: (state.projectPhaseRevisions[id] ?? 0) + 1,
            },
          };
        });
      if (shouldRefreshPhase && epoch === get().accessEpoch)
        await get().refresh();
    }
  },
  mutate: async (entity, method, data) => {
    const input =
      data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    // Capture names before refresh: a deleted record will no longer be in the store.
    const existing = get()[entity].find((record) => record.id === input.id);
    const record = { ...existing, ...input } as Record<string, unknown>;
    const label = {
      projectPartners: "Project partner",
      projectSubmissions: "Submission",
      companies: "Client",
      contacts: "Contact",
      deals: "Project",
      tasks: "Task",
      activities: "Activity",
      projectFiles: "File link",
      projectDecisions: "Decision",
      feeMilestones: "Fee milestone",
      paymentReceipts: "Payment receipt",
      phaseSchedules: "Phase schedule",
      projectDeliverables: "Deliverable",
    }[entity];
    const name = String(
      record.name ||
        record.title ||
        record.phase ||
        record.receiptNumber ||
        record.body ||
        "",
    ).trim();
    const displayName = name.length > 120 ? `${name.slice(0, 117)}…` : name;
    const client = get().companies.find(
      (company) => company.id === record.companyId,
    );
    const context =
      [displayName, client ? `Client: ${client.name}` : ""]
        .filter(Boolean)
        .join(" · ") || undefined;
    const action =
      method === "POST" ? "create" : method === "DELETE" ? "delete" : "update";
    if (get().accessState !== "allowed" || !get().canWrite) {
      set({ error: "Your role has read-only access." });
      toast.error(
        `Could not ${action} ${label.toLowerCase()}`,
        "Your role has read-only access.",
      );
      return false;
    }
    if (entity === "deals" && get().projectPhaseSaves[String(input.id)]) {
      set({
        error: "This project's phase is still saving. Try again in a moment.",
      });
      return false;
    }
    if (get().saving) return false;
    const epoch = get().accessEpoch;
    set({ saving: true, error: null });
    try {
      const response = await fetch(`/api/crm/${entity}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (epoch !== get().accessEpoch) return false;
      if (!response.ok) {
        if (response.status === 401)
          get().blockAccess("denied", "Sign in to your workspace.");
        // A 403 may be a viewer role change or a revoked membership: check read access.
        if (response.status === 403) await get().checkAccess();
        throw new Error(result.error || "Could not save changes.");
      }
      await get().refresh();
      if (get().accessState !== "allowed") return false;
      if (get().error)
        set({
          error:
            "Changes saved, but the list could not refresh. Click Retry to reload.",
        });
      const outcome =
        (entity === "tasks" || entity === "projectDeliverables") &&
        method === "PATCH" &&
        typeof input.completed === "boolean"
          ? input.completed
            ? "completed"
            : "reopened"
          : method === "POST"
            ? "created"
            : method === "DELETE"
              ? "deleted"
              : "updated";
      toast.success(
        input.action === "applyTemplate"
          ? "Checklist applied"
          : `${label} ${outcome}`,
        context,
      );
      return true;
    } catch (error) {
      if (epoch === get().accessEpoch) {
        const message =
          error instanceof Error ? error.message : "Could not save changes.";
        set({ error: message });
        toast.error(
          `Could not ${action} ${label.toLowerCase()}${name ? ` “${displayName}”` : ""}`,
          message,
        );
      }
      return false;
    } finally {
      set({ saving: false });
    }
  },
  ...DEFAULT_FILTERS,
  selectedIds: [],
  detailId: null,
  projectId: null,
  detailOpen: false,
  profileName: null,
  profileOpen: false,
  newCompanyOpen: false,
  sidebarOpen: false,
  searchOpen: false,
  unreadNotificationIds: [],
  activeTab: "companies",
  setSortBy: (sortBy) => set({ sortBy }),
  setOwner: (owner) => set({ owner }),
  setStage: (stage) => set({ stage }),
  setActivityWindow: (activityWindow) => set({ activityWindow }),
  resetFilters: () => set({ ...DEFAULT_FILTERS }),
  toggleSelected: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((selected) => selected !== id)
        : [...state.selectedIds, id],
    })),
  setSelected: (selectedIds) => set({ selectedIds }),
  openProject: (projectId) =>
    set({ projectId, detailOpen: false, activeTab: "deals" }),
  closeProject: () => set({ projectId: null }),
  openDetail: (detailId) =>
    set({ detailId, detailOpen: true, profileOpen: false }),
  closeDetail: () => set({ detailOpen: false }),
  openProfile: (profileName) =>
    set({ profileName, profileOpen: true, detailOpen: false }),
  closeProfile: () => set({ profileOpen: false }),
  setNewCompanyOpen: (newCompanyOpen) =>
    set({ newCompanyOpen: newCompanyOpen && get().canWrite }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  markNotificationRead: (id) =>
    set((state) => ({
      unreadNotificationIds: state.unreadNotificationIds.filter(
        (unread) => unread !== id,
      ),
    })),
  markAllNotificationsRead: () => set({ unreadNotificationIds: [] }),
  setActiveTab: (activeTab) => set({ activeTab, projectId: null }),
  addCompany: async (company) => {
    const saved = await get().mutate("companies", "POST", company);
    if (saved) set({ newCompanyOpen: false });
    return saved;
  },
}));
