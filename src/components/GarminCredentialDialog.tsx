import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Lang } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const credentialSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
});
const mfaSchema = z.object({
  code: z.string().trim().min(4).max(10),
});

interface Props {
  open: boolean;
  lang: Lang;
  onOpenChange: (open: boolean) => void;
  onSuccess: (displayName: string) => void;
}

type Step = "credentials" | "mfa";

const GarminCredentialDialog = ({ open, lang, onOpenChange, onSuccess }: Props) => {
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaState, setMfaState] = useState("");
  const [emailEncrypted, setEmailEncrypted] = useState("");
  const [passwordEncrypted, setPasswordEncrypted] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep("credentials");
    setEmail("");
    setPassword("");
    setMfaCode("");
    setMfaState("");
    setEmailEncrypted("");
    setPasswordEncrypted("");
    setSubmitting(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = credentialSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(lang === "zh" ? "請輸入有效的電郵及密碼" : "Please enter a valid email and password");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("garmin-credential-login", {
        body: { email: parsed.data.email, password: parsed.data.password },
      });

      if (error || !data?.success) {
        const msg = (data as any)?.error || error?.message || (lang === "zh" ? "登入失敗" : "Login failed");
        toast.error(msg);
        return;
      }

      if (data.mfa_required) {
        setMfaState(data.mfa_state);
        setEmailEncrypted(data.email_encrypted);
        setPasswordEncrypted(data.password_encrypted);
        setPassword(""); // wipe plaintext password from memory
        setStep("mfa");
        toast.info(lang === "zh" ? "請輸入 Garmin 寄送的驗證碼" : "Enter the verification code Garmin sent you");
        return;
      }

      toast.success(lang === "zh" ? "Garmin 已連結!" : "Garmin connected!");
      onSuccess(data.display_name || email);
      handleClose(false);
    } catch (err) {
      console.error("Garmin credential login error:", err);
      toast.error(lang === "zh" ? "登入失敗,請稍後再試" : "Login failed — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = mfaSchema.safeParse({ code: mfaCode });
    if (!parsed.success) {
      toast.error(lang === "zh" ? "請輸入有效的驗證碼" : "Please enter a valid code");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("garmin-credential-mfa", {
        body: {
          mfa_state: mfaState,
          mfa_code: parsed.data.code,
          email_encrypted: emailEncrypted,
          password_encrypted: passwordEncrypted,
        },
      });

      if (error || !data?.success) {
        const msg = (data as any)?.error || error?.message || (lang === "zh" ? "驗證失敗" : "Verification failed");
        toast.error(msg);
        return;
      }

      toast.success(lang === "zh" ? "Garmin 已連結!" : "Garmin connected!");
      onSuccess(data.display_name || email);
      handleClose(false);
    } catch (err) {
      console.error("Garmin MFA error:", err);
      toast.error(lang === "zh" ? "驗證失敗,請稍後再試" : "Verification failed — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock size={18} className="text-primary" />
            {lang === "zh" ? "登入 Garmin Connect" : "Sign in to Garmin Connect"}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {lang === "zh"
              ? "你的密碼會直接傳送到我們的 Garmin 認證服務以取得登入權杖,我們不會儲存密碼。"
              : "Your password is sent directly to our Garmin authentication service to obtain a session token. We do not store your password."}
          </DialogDescription>
        </DialogHeader>

        {step === "credentials" ? (
          <form onSubmit={handleCredentialSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="garmin-email">{lang === "zh" ? "Garmin 電郵" : "Garmin email"}</Label>
              <Input
                id="garmin-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                required
                maxLength={254}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="garmin-password">{lang === "zh" ? "Garmin 密碼" : "Garmin password"}</Label>
              <Input
                id="garmin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
                maxLength={256}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 size={16} className="mr-2 animate-spin" />}
              {lang === "zh" ? "繼續" : "Continue"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="garmin-mfa">{lang === "zh" ? "驗證碼" : "Verification code"}</Label>
              <Input
                id="garmin-mfa"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                disabled={submitting}
                placeholder="123456"
                required
                maxLength={10}
              />
              <p className="text-xs text-muted-foreground">
                {lang === "zh"
                  ? "請輸入 Garmin 透過電郵或驗證器應用程式傳送的代碼。"
                  : "Enter the code Garmin sent via email or your authenticator app."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStep("credentials")}
                disabled={submitting}
              >
                {lang === "zh" ? "返回" : "Back"}
              </Button>
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting && <Loader2 size={16} className="mr-2 animate-spin" />}
                {lang === "zh" ? "驗證" : "Verify"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default GarminCredentialDialog;
