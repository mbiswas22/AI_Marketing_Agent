import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  CircularProgress,
  Divider,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import BusinessCenterIcon from "@mui/icons-material/BusinessCenter";
import SendIcon from "@mui/icons-material/Send";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import { inviteUser, sendInviteEmail } from "../services/api";
import type { InviteUserPayload } from "../services/api";
import "../styles/onboard.css";

const generateUserId = () =>
  "USR-" + Math.random().toString(36).slice(2, 8).toUpperCase();
const generateBusinessId = () =>
  "BIZ-" + Math.random().toString(36).slice(2, 8).toUpperCase();

// ── Dynamic input sx (depends on error state) ─────────────────────────────────
const inputSx = (hasError: boolean) => ({
  bgcolor: "#0e0e18",
  borderRadius: "10px",
  "& fieldset": {
    borderColor: hasError ? "#ef4444" : "#2e2e45",
    borderWidth: "1px",
  },
  "&:hover fieldset": { borderColor: hasError ? "#f87171" : "#7c6df0" },
  "&.Mui-focused fieldset": {
    borderColor: hasError ? "#ef4444" : "#a78bfa",
    borderWidth: "1.5px",
  },
  "& input": { color: "#f0eeff", fontSize: 14, py: "13px", px: "14px" },
  "& input::placeholder": { color: "#50507a", opacity: 1 },
  "& .MuiSelect-select": {
    color: "#f0eeff",
    fontSize: 14,
    py: "13px",
    px: "14px",
  },
  "& .MuiSvgIcon-root": { color: "#7070a0" },
});

const labelSx = { color: "#a78bfa", fontSize: 13, fontWeight: 600, mb: 0.8 };
const fieldSx = {
  "& .MuiInputLabel-root": { display: "none" },
  "& .MuiFormHelperText-root": { color: "#ef4444", fontSize: 12, mt: 0.5 },
};

// ── Initial state ─────────────────────────────────────────────────────────────
const emptyForm: InviteUserPayload = {
  businessName: "",
  businessId: "",
  userName: "",
  userId: generateUserId(),
  role: "ADMIN",
  userEmail: "",
  userPhoneNumber: "",
  invitationLink: "",
  expirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  invitationId: "",
};
const emptyErrors = { businessName: "", userName: "", email: "", phone: "" };

function validateEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function validatePhone(v: string) {
  return /^\+?[\d\s\-().]{7,20}$/.test(v);
}

export default function Onboard() {
  const navigate = useNavigate();
  const [form, setForm] = useState<InviteUserPayload>(emptyForm);
  const [errors, setErrors] = useState(emptyErrors);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const set = (field: keyof InviteUserPayload, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field as keyof typeof errors])
      setErrors((p) => ({ ...p, [field]: "" }));
  };

  const validate = () => {
    const e = { ...emptyErrors };
    let ok = true;
    if (!form.businessName.trim()) {
      e.businessName = "Business name is required.";
      ok = false;
    }
    if (!form.userName.trim()) {
      e.userName = "User name is required.";
      ok = false;
    }
    if (!form.userEmail.trim()) {
      e.email = "Email is required.";
      ok = false;
    } else if (!validateEmail(form.userEmail)) {
      e.email = "Enter a valid email address.";
      ok = false;
    }
    if (form.userPhoneNumber && !validatePhone(form.userPhoneNumber)) {
      e.phone = "Enter a valid phone number.";
      ok = false;
    }
    setErrors(e);
    return ok;
  };

  const handleSend = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setApiError(null);
    const token = crypto.randomUUID();
    const invitationLink = `${window.location.origin}/invite?token=${token}`;
    const invitationId = token;
    const businessId = generateBusinessId();
    const businessName = form.businessName.trim()
      ? form.businessName
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "")
      : form.businessName.trim();
    try {
      await inviteUser({
        ...form,
        invitationLink,
        businessId,
        businessName,
        invitationId,
      });
      await sendInviteEmail({
        toEmail: form.userEmail,
        subject: "You're invited to MarketingAI",
        message: `Hi ${form.userName},\n\nYou've been invited to join MarketingAI as ${form.role}.\n\nAccept your invitation here: ${invitationLink}\n\nThis link expires in 24 hours.`,
      });
      setSuccess(true);
    } catch {
      setApiError("Failed to send invite. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm({ ...emptyForm, userId: generateUserId() });
    setErrors(emptyErrors);
    setSuccess(false);
    setApiError(null);
  };

  const isDisabled =
    !form.businessName.trim() ||
    !form.userName.trim() ||
    !form.userEmail.trim();

  return (
    <div className="onboard-page">
      {/* Navbar */}
      <div className="onboard-navbar">
        <div className="onboard-navbar-brand">
          <AutoAwesomeIcon sx={{ color: "#8b5cf6" }} />
          <span className="onboard-navbar-title">MarketingAI</span>
        </div>
        <Button
          onClick={() => navigate("/welcome")}
          startIcon={<ArrowBackIcon />}
          sx={{
            color: "#a0aec0",
            textTransform: "none",
            fontSize: 14,
            "&:hover": { color: "#fff" },
          }}
        >
          Back
        </Button>
      </div>

      {/* Content */}
      <div className="onboard-content">
        <div className="onboard-inner">
          {/* Page header */}
          <div className="onboard-header">
            <div className="onboard-header-icon">
              <BusinessCenterIcon sx={{ color: "#a78bfa", fontSize: 26 }} />
            </div>
            <div>
              <p className="onboard-header-title">Onboard Business</p>
              <p className="onboard-header-subtitle">
                Fill in the details below to send an invitation to your new
                user.
              </p>
            </div>
          </div>

          {/* Success state */}
          {success ? (
            <div className="onboard-success">
              <CheckCircleOutlineIcon
                sx={{ color: "#22c55e", fontSize: 52, mb: 2 }}
              />
              <p className="onboard-success-title">Invitation Sent!</p>
              <p className="onboard-success-body">
                An invitation email has been sent to{" "}
                <span className="onboard-success-email">{form.userEmail}</span>.
              </p>
              <div className="onboard-success-actions">
                <Button
                  onClick={handleReset}
                  variant="outlined"
                  sx={{
                    borderColor: "rgba(34,197,94,0.4)",
                    color: "#22c55e",
                    textTransform: "none",
                    borderRadius: "10px",
                    "&:hover": { bgcolor: "rgba(34,197,94,0.08)" },
                  }}
                >
                  Invite Another
                </Button>
                <Button
                  onClick={() => navigate("/dashboard")}
                  variant="contained"
                  sx={{
                    bgcolor: "#7c3aed",
                    textTransform: "none",
                    borderRadius: "10px",
                    "&:hover": { bgcolor: "#6d28d9" },
                  }}
                >
                  Go to Dashboard
                </Button>
              </div>
            </div>
          ) : (
            <div className="onboard-card">
              {/* Business Details */}
              <div className="onboard-section">
                <p className="onboard-section-label">Business Details</p>
                <div className="onboard-field">
                  <Typography sx={labelSx}>Business Name</Typography>
                  <TextField
                    fullWidth
                    placeholder="e.g. Acme Corp"
                    value={form.businessName}
                    onChange={(e) => set("businessName", e.target.value)}
                    error={!!errors.businessName}
                    helperText={errors.businessName}
                    slotProps={{
                      input: { sx: inputSx(!!errors.businessName) },
                    }}
                    sx={fieldSx}
                  />
                </div>
              </div>

              <Divider sx={{ borderColor: "#1e1e30" }} />

              {/* User Details */}
              <div className="onboard-section-user">
                <p className="onboard-section-label">User Details</p>

                {/* Row 1: User Name */}
                <div className="onboard-field">
                  <Typography sx={labelSx}>User Name</Typography>
                  <TextField
                    fullWidth
                    placeholder="e.g. Jane Smith"
                    value={form.userName}
                    onChange={(e) => set("userName", e.target.value)}
                    error={!!errors.userName}
                    helperText={errors.userName}
                    slotProps={{ input: { sx: inputSx(!!errors.userName) } }}
                    sx={fieldSx}
                  />
                </div>

                {/* Row 2: Role + Phone */}
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    gap: 2.5,
                    mb: 2.5,
                  }}
                >
                  <div className="onboard-field" style={{ marginBottom: 0 }}>
                    <Typography sx={labelSx}>Role</Typography>
                    <Select
                      fullWidth
                      value={form.role}
                      onChange={(e) => set("role", e.target.value)}
                      displayEmpty
                      sx={inputSx(false)}
                      MenuProps={
                        {
                          PaperProps: {
                            sx: {
                              bgcolor: "#13131e",
                              border: "1px solid #2e2e45",
                              borderRadius: "10px",
                              color: "#f0eeff",
                              mt: 0.5,
                              "& .MuiMenuItem-root": {
                                fontSize: 14,
                                py: 1.2,
                                "&:hover": {
                                  bgcolor: "rgba(124,109,240,0.12)",
                                },
                              },
                              "& .Mui-selected": {
                                bgcolor: "rgba(167,139,250,0.18) !important",
                              },
                            },
                          },
                        } as any
                      }
                    >
                      <MenuItem value="ADMIN">ADMIN</MenuItem>
                      <MenuItem value="VIEWER">VIEWER</MenuItem>
                      <MenuItem value="EDITOR">EDITOR</MenuItem>
                    </Select>
                  </div>
                  <div className="onboard-field" style={{ marginBottom: 0 }}>
                    <Typography sx={labelSx}>
                      Phone Number{" "}
                      <span className="onboard-optional">(optional)</span>
                    </Typography>
                    <TextField
                      fullWidth
                      placeholder="+1 555 000 0000"
                      value={form.userPhoneNumber}
                      onChange={(e) => set("userPhoneNumber", e.target.value)}
                      error={!!errors.phone}
                      helperText={errors.phone}
                      slotProps={{ input: { sx: inputSx(!!errors.phone) } }}
                      sx={fieldSx}
                    />
                  </div>
                </Box>

                {/* Email */}
                <div className="onboard-field">
                  <Typography sx={labelSx}>User Email</Typography>
                  <TextField
                    fullWidth
                    placeholder="user@company.com"
                    type="email"
                    value={form.userEmail}
                    onChange={(e) => set("userEmail", e.target.value)}
                    error={!!errors.email}
                    helperText={errors.email}
                    slotProps={{ input: { sx: inputSx(!!errors.email) } }}
                    sx={fieldSx}
                  />
                </div>
              </div>

              <Divider sx={{ borderColor: "#1e1e30" }} />

              {/* API error */}
              {apiError && (
                <div className="onboard-error-box">
                  <p className="onboard-error-text">{apiError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="onboard-actions">
                <Button
                  onClick={() => navigate("/welcome")}
                  sx={{
                    color: "#c0c0e0",
                    textTransform: "none",
                    fontSize: 14,
                    borderRadius: "10px",
                    px: 3,
                    border: "1px solid #2e2e45",
                    "&:hover": {
                      bgcolor: "rgba(255,255,255,0.05)",
                      borderColor: "#5050a0",
                    },
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSend}
                  disabled={submitting || isDisabled}
                  variant="contained"
                  endIcon={
                    submitting ? (
                      <CircularProgress size={16} sx={{ color: "#e0d0ff" }} />
                    ) : (
                      <SendIcon sx={{ fontSize: 17 }} />
                    )
                  }
                  sx={{
                    flex: 1,
                    bgcolor: "#7c3aed",
                    textTransform: "none",
                    fontSize: 15,
                    fontWeight: 700,
                    borderRadius: "10px",
                    py: 1.4,
                    boxShadow: "0 0 24px rgba(124,58,237,0.35)",
                    "&:hover": {
                      bgcolor: "#6d28d9",
                      boxShadow: "0 0 32px rgba(124,58,237,0.5)",
                    },
                    "&.Mui-disabled": { bgcolor: "#2a1a50", color: "#5a4080" },
                  }}
                >
                  {submitting ? "Sending..." : "Send Invite"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
