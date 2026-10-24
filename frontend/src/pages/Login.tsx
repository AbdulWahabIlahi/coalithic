import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import type { LoginResponse } from "@/lib/types";

const DEMO_EMAIL = "director@coalsmart.gov";
const DEMO_PASSWORD = "CoalSmart2025!";

// Split hero login — pale-mint brand panel with pinstripes beside the sign-in card.
export default function Login() {
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost<LoginResponse>("/auth/login", { email, password });
      await beginSession();
      toast.success("Signed in · control room is live");
      navigate("/");
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401
          ? "Invalid demo credentials"
          : "Sign-in failed — try again shortly";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-12">
      <div className="cs-pinstripes relative flex flex-col justify-between overflow-hidden border-b border-border bg-accent p-10 lg:col-span-7 lg:p-16">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded font-mono text-[13px] font-bold text-primary-foreground" style={{ backgroundColor: "var(--primary)" }}>
            CS
          </div>
          <div className="text-[14px] font-semibold tracking-[0.18em] text-foreground">
            COALSMART <span className="font-mono text-[12px] font-medium tracking-[0.14em] text-primary">/ GOVERNANCE</span>
          </div>
        </div>

        <div className="py-16">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
            National mine safety control room
          </p>
          <h1 className="mt-5 text-[44px] leading-[1.08] font-light tracking-tight text-foreground lg:text-[54px]">
            Clarity at
            <br />
            <span className="text-primary">every seam.</span>
          </h1>
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            One operating picture for safer mines, faster action, and accountable governance.
          </p>
        </div>

        <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.14em] text-muted-foreground">
          <span>SECURE PROTOTYPE</span>
          <span>v0.9.4 / INDIA REGION</span>
        </div>
      </div>

      <div className="flex items-center justify-center bg-card p-8 lg:col-span-5 lg:p-14">
        <div className="w-full max-w-[400px]">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
            Official access
          </p>
          <h2 className="mt-3 text-[28px] font-normal tracking-tight text-foreground">
            Sign in to CoalSmart
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">Use an approved demo account to enter.</p>

          <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="login-email" className="text-[13px] text-muted-foreground">
                Email
              </Label>
              <Input
                id="login-email"
                data-testid="login-email-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 border-border bg-card text-[14px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password" className="text-[13px] text-muted-foreground">
                Password
              </Label>
              <Input
                id="login-password"
                data-testid="login-password-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 border-border bg-card text-[14px]"
              />
            </div>

            <Button
              type="submit"
              data-testid="login-submit-button"
              disabled={busy}
              className="h-11 w-full text-[14px] font-medium active:scale-[0.99]"
            >
              {busy ? "Signing in…" : "Enter command center"}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>

            {error && (
              <p className="text-[13px] text-destructive" data-testid="login-error-text">
                {error}
              </p>
            )}
          </form>

          <div className="mt-8 border-t border-border pt-6">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
              Demo access
            </p>
            <p className="mt-2.5 font-mono text-[12px] text-muted-foreground">{DEMO_EMAIL}</p>
            <p className="mt-1 font-mono text-[13px] font-semibold text-foreground">{DEMO_PASSWORD}</p>
            <p className="mt-2.5 text-[12px] text-muted-foreground">
              Switch roles after sign-in from the top bar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
