import { create } from "zustand";
import { type Company, type SortKey } from "@/data/companies";
import type { CrmSnapshot } from "@/lib/crm/types";
import type { Entity } from "@/lib/crm/validation";
import { isRole } from "@/lib/access-policy";
import { DEFAULT_FILTERS } from "@/lib/companies";

type CompaniesState = {
  companies: CrmSnapshot["companies"];
  contacts: CrmSnapshot["contacts"];
  deals: CrmSnapshot["deals"];
  tasks: CrmSnapshot["tasks"];
  activities: CrmSnapshot["activities"];
  accessState: "checking" | "allowed" | "denied" | "unavailable";
  accessEpoch: number;
  checkAccess: (hide?: boolean) => Promise<boolean>;
  blockAccess: (state: "denied" | "unavailable", error: string) => void;
  exportCompanies: () => Promise<Blob | null>;
  canWrite: boolean;
  loading: boolean;
  saving: boolean;
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

export const useCompaniesStore = create<CompaniesState>((set, get) => ({
  companies: [],
  contacts: [],
  deals: [],
  tasks: [],
  activities: [],
  accessState: "checking",
  accessEpoch: 0,
  canWrite: false,
  loading: true,
  saving: false,
  error: null,
  blockAccess: (accessState, error) =>
    set((state) => ({
      accessState,
      accessEpoch: state.accessEpoch + 1,
      error,
      companies: [],
      contacts: [],
      deals: [],
      tasks: [],
      activities: [],
      canWrite: false,
      loading: false,
      saving: false,
      selectedIds: [],
      detailId: null,
      detailOpen: false,
      profileName: null,
      profileOpen: false,
      newCompanyOpen: false,
      searchOpen: false,
      unreadNotificationIds: [],
    })),
  checkAccess: async (hide = false) => {
    if (hide)
      set((state) => ({
        accessState: "checking",
        accessEpoch: state.accessEpoch + 1,
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
      set({
        ...data,
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
  mutate: async (entity, method, data) => {
    if (get().accessState !== "allowed" || !get().canWrite) {
      set({ error: "Your role has read-only access." });
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
        throw new Error(result.error);
      }
      await get().refresh();
      if (get().accessState !== "allowed") return false;
      if (get().error)
        set({
          error:
            "Changes saved, but the list could not refresh. Click Retry to reload.",
        });
      return true;
    } catch (error) {
      if (epoch === get().accessEpoch)
        set({
          error:
            error instanceof Error ? error.message : "Could not save changes.",
        });
      return false;
    } finally {
      set({ saving: false });
    }
  },
  ...DEFAULT_FILTERS,
  selectedIds: [],
  detailId: null,
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
  setActiveTab: (activeTab) => set({ activeTab }),
  addCompany: async (company) => {
    const saved = await get().mutate("companies", "POST", company);
    if (saved) set({ newCompanyOpen: false });
    return saved;
  },
}));
