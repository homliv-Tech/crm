import { logout } from "@/app/actions";
export default function AccessDenied() {
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl">Workspace access required</h1>
      <p className="text-subtle my-4">
        Ask your administrator for an invitation or to restore your access to
        this CRM.
      </p>
      <form action={logout}>
        <button className="rounded-lg border px-4 py-2">
          Sign out and use another account
        </button>
      </form>
    </main>
  );
}
