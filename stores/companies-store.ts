import { create } from "zustand";
import { type Company, type SortKey } from "@/data/companies";
import type { CrmSnapshot } from "@/lib/crm/types";
import type { Entity } from "@/lib/crm/validation";
import { DEFAULT_FILTERS } from "@/lib/companies";

type CompaniesState = {
  companies: CrmSnapshot["companies"];
  contacts: CrmSnapshot["contacts"];
  deals: CrmSnapshot["deals"];
  tasks: CrmSnapshot["tasks"];
  activities: CrmSnapshot["activities"];
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
  canWrite: false,
  loading: true,
  saving: false,
  error: null,
  refresh: async () => {
    try {
      const response = await fetch("/api/crm", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        if ([401, 403].includes(response.status))
          set({
            companies: [],
            contacts: [],
            deals: [],
            tasks: [],
            activities: [],
            canWrite: false,
            detailOpen: false,
            newCompanyOpen: false,
          });
        throw new Error(data.error);
      }
      set({
        ...data,
        canWrite: data.role === "admin" || data.role === "member",
        loading: false,
        error: null,
      });
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error ? error.message : "Could not load the CRM.",
      });
    }
  },
  mutate: async (entity, method, data) => {
    if (!get().canWrite) {
      set({ error: "Your role has read-only access." });
      return false;
    }
    if (get().saving) return false;
    set({ saving: true, error: null });
    try {
      const response = await fetch(`/api/crm/${entity}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await get().refresh();
      if (get().error)
        set({
          error:
            "Changes saved, but the list could not refresh. Click Retry to reload.",
        });
      return true;
    } catch (error) {
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
