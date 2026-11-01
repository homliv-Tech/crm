"use client";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useCompaniesStore } from "@/stores/companies-store";
import { logout } from "@/app/actions";
import type { Role } from "@/lib/access-policy";
export type WorkspaceUser = { name: string; email: string; role: Role };
const Context = createContext<WorkspaceUser>({
  name: "",
  email: "",
  role: "viewer",
});
export function WorkspaceAccess({
  user,
  children,
}: {
  user: WorkspaceUser;
  children: ReactNode;
}) {
  const accessState = useCompaniesStore((state) => state.accessState);
  const error = useCompaniesStore((state) => state.error);
  const checkAccess = useCompaniesStore((state) => state.checkAccess);
  useEffect(() => {
    let active = true;
    let pending = false;
    const check = async (hide = false) => {
      if (!active || (pending && !hide)) return;
      pending = true;
      try {
        await checkAccess(hide);
      } finally {
        pending = false;
      }
    };
    void check(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, 5000);
    const focus = () => {
      void check();
    };
    const visible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const pageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void check(true);
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pageshow", pageShow);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pageshow", pageShow);
    };
  }, [checkAccess]);
  if (accessState !== "allowed")
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-2xl">
          {accessState === "checking"
            ? "Checking workspace access…"
            : accessState === "denied"
              ? "Workspace access revoked"
              : "Workspace access unavailable"}
        </h1>
        {accessState !== "checking" && (
          <>
            <p role="alert" className="text-subtle my-4 text-sm">
              {error}
            </p>
            {accessState === "unavailable" && (
              <button
                className="mr-3 rounded-lg border px-4 py-2"
                onClick={() => void checkAccess(true)}
              >
                Retry
              </button>
            )}
            <form action={logout} className="mt-4">
              <button className="rounded-lg border px-4 py-2">Sign out</button>
            </form>
          </>
        )}
      </main>
    );
  return <Context.Provider value={user}>{children}</Context.Provider>;
}
export const useWorkspaceUser = () => useContext(Context);
