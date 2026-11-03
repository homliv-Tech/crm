"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ROLES } from "@/lib/access-policy";
import type { AdminData } from "@/lib/admin-handlers";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { selectClass } from "@/components/companies/crm-editor";
export default function UserManagement() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result as AdminData;
  }, []);
  useEffect(() => {
    void load()
      .then(setData)
      .catch((e) => setError(e.message));
  }, [load]);
  async function save(method: "POST" | "PATCH", body: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(
        method === "POST"
          ? "Invitation sent. It expires in 7 days."
          : "Access updated.",
      );
      try {
        setData(await load());
      } catch {
        setError("Changes saved. Reload to see the latest users.");
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await save("POST", Object.fromEntries(new FormData(form))))
      form.reset();
  }
  return (
    <div className="space-y-8">
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        {[
          ["Admin", "Manage users, roles, and all CRM records."],
          ["Member", "Create, edit, and delete CRM records."],
          ["Viewer", "View CRM records and export client data."],
        ].map(([role, description]) => (
          <div key={role} className="border-border rounded-xl border p-4">
            <h2 className="font-medium">{role}</h2>
            <p className="text-subtle mt-2">{description}</p>
          </div>
        ))}
      </div>
      <section
        aria-labelledby="invite-title"
        className="border-border rounded-xl border p-4"
      >
        <h2 id="invite-title" className="mb-4 text-base">
          Invite a teammate
        </h2>
        <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
          <label className="min-w-48 flex-1 text-sm">
            Email
            <Input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              className="mt-2"
              disabled={busy}
            />
          </label>
          <label className="text-sm">
            Role
            <select
              name="role"
              defaultValue="member"
              className={`${selectClass} mt-2`}
              disabled={busy}
            >
              {ROLES.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="primary" disabled={busy}>
            Send invitation
          </Button>
        </form>
      </section>
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p>{error}</p>
          <Button
            disabled={busy}
            onClick={() => {
              setError("");
              void load()
                .then(setData)
                .catch((e) => setError(e.message));
            }}
          >
            Reload users
          </Button>
        </div>
      )}
      <p role="status" className="text-subtle text-sm">
        {busy ? "Saving…" : message}
      </p>
      {!data ? (
        <p role="status">
          {error ? "Users could not be loaded." : "Loading users…"}
        </p>
      ) : (
        <>
          <section aria-labelledby="users-title">
            <h2 id="users-title" className="mb-4 text-lg">
              Workspace users
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-border border-b">
                    <th scope="col" className="p-3">
                      User
                    </th>
                    <th scope="col" className="p-3">
                      Role
                    </th>
                    <th scope="col" className="p-3">
                      Status
                    </th>
                    <th scope="col" className="p-3">
                      Access
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr key={user.id} className="border-border border-b">
                      <td className="p-3">
                        <p>
                          {user.name}
                          {user.userId === data.currentUserId ? " (you)" : ""}
                        </p>
                        <p className="text-subtle mt-1">{user.email}</p>
                      </td>
                      <td className="p-3">
                        <select
                          aria-label={`Role for ${user.email}`}
                          value={user.role}
                          disabled={busy || user.userId === data.currentUserId}
                          className={selectClass}
                          onChange={(e) =>
                            void save("PATCH", {
                              action: "role",
                              id: user.id,
                              role: e.target.value,
                            })
                          }
                        >
                          {!ROLES.some((r) => r === user.role) && (
                            <option>{user.role}</option>
                          )}
                          {ROLES.map((role) => (
                            <option key={role}>{role}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3">{user.status}</td>
                      <td className="p-3">
                        <Button
                          disabled={
                            busy ||
                            user.userId === data.currentUserId ||
                            user.status === "pending"
                          }
                          onClick={() =>
                            void save("PATCH", {
                              action:
                                user.status === "active"
                                  ? "suspend"
                                  : "restore",
                              id: user.id,
                            })
                          }
                          aria-label={`${user.status === "active" ? "Suspend" : "Restore"} access for ${user.email}`}
                        >
                          {user.status === "active" ? "Suspend" : "Restore"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-subtle mt-3 text-xs">
              Another administrator must change your own role or access.
              Suspending a user blocks their next CRM request.
            </p>
          </section>
          <section aria-labelledby="invitations-title">
            <h2 id="invitations-title" className="mb-4 text-lg">
              Pending invitations
            </h2>
            {data.invitations.length ? (
              <ul className="space-y-2">
                {data.invitations.map((invite) => (
                  <li
                    key={invite.id}
                    className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                  >
                    <span>{invite.email}</span>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void save("PATCH", {
                          action: "revoke-invitation",
                          id: invite.id,
                        })
                      }
                      aria-label={`Revoke invitation for ${invite.email}`}
                    >
                      Revoke invitation
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-subtle text-sm">No pending invitations.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
