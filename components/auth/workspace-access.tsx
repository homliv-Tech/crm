"use client";
import { createContext, useContext, type ReactNode } from "react";
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
  return <Context.Provider value={user}>{children}</Context.Provider>;
}
export const useWorkspaceUser = () => useContext(Context);
