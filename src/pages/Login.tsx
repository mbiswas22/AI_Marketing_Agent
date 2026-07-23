import { useEffect, useState } from "react";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import { signUp, confirmSignUp, signIn } from "aws-amplify/auth";
import { useNavigate } from "react-router-dom";
import {
  Typography,
  Box,
  TextField,
  Button,
  CircularProgress,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { getInvitation } from "../services/api";
import "../styles/login.css";

const inputSx = (hasError = false) => ({
  "& .MuiOutlinedInput-root": {
    bgcolor: "#13132a",
    borderRadius: "10px",
    "& fieldset": {
      borderColor: hasError ? "#ef4444" : "#4a4a7a",
      borderWidth: "1.5px",
    },
    "&:hover fieldset": { borderColor: hasError ? "#f87171" : "#a78bfa" },
    "&.Mui-focused fieldset": {
      borderColor: hasError ? "#ef4444" : "#c4b5fd",
      borderWidth: "2px",
    },
    "&.Mui-disabled fieldset": { borderColor: "#3a3a5a" },
  },
  "& input": { color: "#ffffff", fontSize: 15, fontWeight: 500 },
  "& input::placeholder": { color: "#7070aa", opacity: 1 },
  "& input.Mui-disabled": { color: "#c0b8f0", WebkitTextFillColor: "#c0b8f0" },
  "& .MuiFormHelperText-root": { color: "#ef4444", fontSize: 12 },
});

const rules = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
];

function PasswordRule({ label, met }: { label: string; met: boolean }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
      {met ? (
        <CheckCircleIcon sx={{ fontSize: 14, color: "#22c55e" }} />
      ) : (
        <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: "#5050a0" }} />
      )}
      <Typography sx={{ fontSize: 12, color: met ? "#86efac" : "#7070aa" }}>
        {label}
      </Typography>
    </Box>
  );
}

function InviteSignUp({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"signup" | "confirm">("signup");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ password: false, confirm: false });

  const rulesMet = rules.every((r) => r.test(password));
  const matchError = touched.confirm && confirm !== password;
  const canSubmit = rulesMet && confirm === password && confirm.length > 0;

  const handleSignUp = async () => {
    setError("");
    setLoading(true);
    try {
      await signUp({
        username: email,
        password,
        options: { userAttributes: { email } },
      });
      setStep("confirm");
    } catch (e: any) {
      setError(e.message ?? "Sign up failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setError("");
    setLoading(true);
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      await signIn({ username: email, password });
    } catch (e: any) {
      setError(e.message ?? "Confirmation failed.");
    } finally {
      setLoading(false);
    }
  };

  const btnSx = {
    bgcolor: "#7c3aed",
    textTransform: "none",
    fontWeight: 700,
    fontSize: 15,
    borderRadius: "10px",
    py: 1.4,
    mt: 0.5,
    "&:hover": { bgcolor: "#6d28d9" },
    "&.Mui-disabled": { bgcolor: "#2d1a5a", color: "#6050a0" },
  };

  const label = (text: string) => (
    <Typography
      sx={{ color: "#c4b5fd", fontSize: 13, fontWeight: 600, mb: 0.6 }}
    >
      {text}
    </Typography>
  );

  return (
    <Box
      sx={{
        width: 360,
        mx: "auto",
        bgcolor: "#0f0f1e",
        border: "1.5px solid #2e2e55",
        borderRadius: "16px",
        p: 3.5,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <Typography
        sx={{ color: "#ffffff", fontWeight: 700, fontSize: 22, mb: 0.5 }}
      >
        Create your account
      </Typography>
      <Typography sx={{ color: "#8080c0", fontSize: 13, mt: -1.5 }}>
        You've been invited — set a password to get started.
      </Typography>

      {/* Email (locked) */}
      <Box>
        {label("Email")}
        <TextField fullWidth value={email} disabled sx={inputSx()} />
      </Box>

      {step === "signup" && (
        <>
          {/* Password */}
          <Box>
            {label("Password")}
            <TextField
              fullWidth
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              sx={inputSx(touched.password && !rulesMet)}
            />
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 1 }}
            >
              {rules.map((r) => (
                <PasswordRule
                  key={r.label}
                  label={r.label}
                  met={r.test(password)}
                />
              ))}
            </Box>
          </Box>

          {/* Confirm Password */}
          <Box>
            {label("Confirm Password")}
            <TextField
              fullWidth
              type="password"
              placeholder="Re-enter your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
              error={matchError}
              helperText={matchError ? "Passwords do not match" : ""}
              sx={inputSx(matchError)}
            />
          </Box>

          {error && (
            <Typography sx={{ color: "#f87171", fontSize: 13 }}>
              {error}
            </Typography>
          )}

          <Button
            fullWidth
            variant="contained"
            onClick={handleSignUp}
            disabled={loading || !canSubmit}
            sx={btnSx}
          >
            {loading ? (
              <CircularProgress size={18} sx={{ color: "#c4b5fd" }} />
            ) : (
              "Create Account"
            )}
          </Button>
        </>
      )}

      {step === "confirm" && (
        <>
          <Typography sx={{ color: "#a0a0d0", fontSize: 13 }}>
            Enter the verification code sent to{" "}
            <strong style={{ color: "#c4b5fd" }}>{email}</strong>
          </Typography>
          <Box>
            {label("Verification Code")}
            <TextField
              fullWidth
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              sx={inputSx()}
            />
          </Box>
          {error && (
            <Typography sx={{ color: "#f87171", fontSize: 13 }}>
              {error}
            </Typography>
          )}
          <Button
            fullWidth
            variant="contained"
            onClick={handleConfirm}
            disabled={loading || !code}
            sx={btnSx}
          >
            {loading ? (
              <CircularProgress size={18} sx={{ color: "#c4b5fd" }} />
            ) : (
              "Verify & Sign In"
            )}
          </Button>
        </>
      )}
    </Box>
  );
}

export default function Login() {
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  const navigate = useNavigate();
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem("inviteToken");
    if (!token) {
      setInviteEmail("");
      return;
    }
    getInvitation(token)
      .then((inv) => setInviteEmail(inv?.userEmail ?? ""))
      .catch(() => setInviteEmail(""));
  }, []);

  useEffect(() => {
    if (authStatus === "authenticated") {
      sessionStorage.removeItem("inviteToken");
      const redirect =
        sessionStorage.getItem("redirectAfterLogin") || "/welcome";
      sessionStorage.removeItem("redirectAfterLogin");
      navigate(redirect, { replace: true });
    }
  }, [authStatus, navigate]);

  if (inviteEmail === null) return null;

  return (
    <div className="login-page">
      <div className="login-brand">
        <AutoAwesomeIcon sx={{ color: "#8b5cf6", fontSize: 30 }} />
        <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 22 }}>
          MarketingAI
        </Typography>
      </div>
      {inviteEmail ? (
        <InviteSignUp email={inviteEmail} />
      ) : (
        <Authenticator hideSignUp />
      )}
    </div>
  );
}
