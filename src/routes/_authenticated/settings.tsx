import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { updateProfileName, deleteMyAccount } from "@/lib/account.functions";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Account Settings — CareerLift AI" },
      { name: "description", content: "Update your CareerLift AI profile, manage your account, and control your job search preferences." },
      { property: "og:title", content: "Account Settings — CareerLift AI" },
      { property: "og:description", content: "Manage your CareerLift AI profile and account preferences." },
      { property: "og:url", content: "https://careerliftaiproj.lovable.app/settings" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://careerliftaiproj.lovable.app/settings" }],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const updateName = useServerFn(updateProfileName);
  const deleteAccount = useServerFn(deleteMyAccount);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const meta = (u.user_metadata ?? {}) as { full_name?: string; name?: string };
      const n = meta.full_name ?? meta.name ?? "";
      setEmail(u.email ?? "");
      setFullName(n);
      setInitialName(n);
      setLoading(false);
    });
  }, []);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || fullName === initialName) return;
    setSaving(true);
    try {
      await updateName({ data: { fullName: fullName.trim() } });
      await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });
      setInitialName(fullName.trim());
      toast.success("Name updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteAccount();
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      toast.success("Your account has been deleted");
      navigate({ to: "/", replace: true });
    } catch (err) {
      setDeleting(false);
      toast.error(err instanceof Error ? err.message : "Failed to delete account");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your account and personal data.</p>
      </header>

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">This is what we call you across the app.</p>
        {loading ? (
          <div className="mt-4 space-y-3">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-10 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-10 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <form onSubmit={handleSaveName} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled />
              <p className="text-xs text-muted-foreground">
                Email changes aren't supported yet — contact support if you need help.
              </p>
            </div>
            <Button type="submit" disabled={saving || !fullName.trim() || fullName === initialName}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving</> : "Save changes"}
            </Button>
          </form>
        )}
      </Card>

      <Card className="border-destructive/40 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="flex-1">
            <h2 className="font-display text-lg font-semibold text-destructive">Danger zone</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanently delete your account and all associated data — resumes, applications, and
              interview history. This cannot be undone.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="mt-4" disabled={deleting}>
                  {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting</> : "Delete my account"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All of your data will be permanently removed. This action is irreversible.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Yes, delete everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </Card>
    </div>
  );
}
