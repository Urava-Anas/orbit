import type { Metadata } from "next";
import Link from "next/link";
import { deleteOrbitAccount } from "@/app/account/delete/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Delete Orbit account",
  robots: { index: true, follow: true },
};

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AccountDeletionPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="legal-page">
      <article className="legal-card">
        <span className="eyebrow">Urava Orbit</span>
        <h1>Delete your Orbit account</h1>
        <p>
          You can permanently delete your Orbit account here. Owned workspaces and their
          tenant data are deleted with the account. Records created while collaborating in
          another organisation keep the business record but remove your user attribution.
        </p>

        {!user?.email ? (
          <>
            <p>Sign in to verify ownership before deletion. This page remains publicly accessible as Orbit&apos;s account-deletion entry point.</p>
            <Link className="button button-primary" href="/login?next=/account/delete">
              Sign in to delete account
            </Link>
          </>
        ) : (
          <form action={deleteOrbitAccount} className="stack">
            {params.error ? <p role="alert">{params.error}</p> : null}
            <label>
              Account email
              <input name="email" type="email" required defaultValue={user.email} autoComplete="email" />
            </label>
            <label>
              Type DELETE MY ACCOUNT
              <input name="confirmation" required autoComplete="off" />
            </label>
            <p>This action cannot be undone.</p>
            <button className="button button-danger" type="submit">
              Permanently delete account
            </button>
          </form>
        )}

        <p>
          <Link href="/orbit/privacy">Read Orbit privacy information</Link>
        </p>
      </article>
    </main>
  );
}
