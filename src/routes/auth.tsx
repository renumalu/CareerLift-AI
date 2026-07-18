import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in or sign up — CareerLift AI" },
      { name: "description", content: "Sign in to CareerLift AI or create a free account to analyze resumes, track applications, and practice mock interviews." },
      { property: "og:title", content: "Sign in or sign up — CareerLift AI" },
      { property: "og:description", content: "Access your CareerLift AI dashboard, resume analyzer, and mock interview coach." },
      { property: "og:url", content: "https://careerliftaiproj.lovable.app/auth" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://careerliftaiproj.lovable.app/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/dashboard", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Clear any stale session first so we never accidentally keep the previous account.
    await supabase.auth.signOut().catch(() => {});
    const { data, error } = await supabase.auth.signInWithPassword({ email: signInEmail, password: signInPassword });
    setLoading(false);
    if (error || !data.session || !data.user) return toast.error(error?.message ?? "Invalid email or password.");
    if (data.user.email?.toLowerCase() !== signInEmail.trim().toLowerCase()) {
      await supabase.auth.signOut();
      return toast.error("Credentials do not match this account. Please try again.");
    }
    toast.success("Welcome back!");
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Ensure no previous session lingers before creating a brand-new account.
    await supabase.auth.signOut().catch(() => {});
    const { data, error } = await supabase.auth.signUp({
      email: signUpEmail,
      password: signUpPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName },
      },
    });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    // Supabase returns a fake obfuscated user when the email is already registered
    // (identities array is empty). Block that case so we never sign into the wrong account.
    const identities = (data.user as { identities?: unknown[] } | null)?.identities;
    if (data.user && Array.isArray(identities) && identities.length === 0) {
      setLoading(false);
      return toast.error("This email is already registered. Please sign in instead.");
    }
    if (!data.session) {
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email: signUpEmail, password: signUpPassword });
      if (signInErr || !signInData.session || signInData.user?.email?.toLowerCase() !== signUpEmail.trim().toLowerCase()) {
        setLoading(false);
        await supabase.auth.signOut().catch(() => {});
        return toast.error(signInErr?.message ?? "Could not sign you in after signup.");
      }
    }
    setLoading(false);
    toast.success("Account created! Welcome to CareerLift AI");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="min-h-screen bg-[var(--surface-dark)] text-[var(--surface-dark-foreground)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          <span className="font-display text-xl font-semibold">CareerLift AI</span>
        </Link>

        <div className="rounded-2xl bg-card text-card-foreground shadow-elevated p-6 sm:p-8">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v as "signin" | "signup");
              setSignInEmail("");
              setSignInPassword("");
              setSignUpEmail("");
              setSignUpPassword("");
              setFullName("");
            }}
          >
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <h1 className="font-display text-2xl font-semibold mb-1">Welcome back</h1>
              <p className="text-sm text-muted-foreground mb-6">Sign in to continue your job search.</p>
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" type="email" autoComplete="email" required value={signInEmail} onChange={(e) => setSignInEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="si-password">Password</Label>
                  <Input id="si-password" type="password" autoComplete="current-password" required value={signInPassword} onChange={(e) => setSignInPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Sign In
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <h1 className="font-display text-2xl font-semibold mb-1">Create your account</h1>
              <p className="text-sm text-muted-foreground mb-6">Start landing interviews faster.</p>
              <form onSubmit={handleSignUp} className="space-y-4" autoComplete="off">
                <div className="space-y-2">
                  <Label htmlFor="su-name">Full name</Label>
                  <Input id="su-name" type="text" autoComplete="off" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" type="email" autoComplete="off" required value={signUpEmail} onChange={(e) => setSignUpEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-password">Password</Label>
                  <Input id="su-password" type="password" autoComplete="new-password" required minLength={6} value={signUpPassword} onChange={(e) => setSignUpPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Account
                </Button>
              </form>
            </TabsContent>
          </Tabs>

        </div>

        <p className="mt-6 text-center text-sm text-[var(--surface-dark-muted)]">
          <Link to="/" className="hover:text-primary transition-colors">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
