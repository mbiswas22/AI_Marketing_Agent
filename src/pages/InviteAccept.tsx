import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
import BusinessCenterIcon from "@mui/icons-material/BusinessCenter";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import {
  getInvitation,
  createBusiness,
  createUser,
  updateUserCognitoId,
  updateInvitation,
} from "../services/api";
import type { InvitationResponse } from "../services/api";
import { getUserAttributes } from "../services/auth";

const INDUSTRIES = [
  "Retail",
  "Food & Beverage",
  "Technology",
  "Healthcare",
  "Education",
  "Finance",
  "Real Estate",
  "Entertainment",
  "Other",
];

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

type Status = "loading" | "invalid" | "ready" | "submitting" | "success";

export default function InviteAccept() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<Status>("loading");
  const [invitation, setInvitation] = useState<InvitationResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Form state
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("Retail");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPhone, setUserPhone] = useState("");

  // Field errors
  const [errors, setErrors] = useState({
    businessName: "",
    userName: "",
    userEmail: "",
  });

  useEffect(() => {
    if (!token) {
      setErrorMsg("Invalid or missing invitation token.");
      setStatus("invalid");
      return;
    }
    const load = async () => {
      try {
        const inv = await getInvitation(token);
        if (inv.status !== "Invited") {
          setErrorMsg(
            "This invitation is no longer valid or has already been used.",
          );
          setStatus("invalid");
          return;
        }
        if (inv.role !== "ADMIN") {
          try {
            const attrs = await getUserAttributes();
            const cognitoUserId = (attrs as any)?.sub;
            if (cognitoUserId) {
              await updateUserCognitoId(
                inv.userId,
                cognitoUserId,
                inv.businessId,
              );
            }
            await updateInvitation(token, { status: "Accepted" });
          } catch {
            // proceed to dashboard regardless
          }
          navigate("/dashboard", { replace: true });
          return;
        }
        setInvitation(inv);
        setBusinessName(inv.businessName ?? "");
        setUserName(inv.userName ?? "");
        setUserEmail(inv.userEmail ?? "");
        setUserPhone(inv.userPhoneNumber ?? "");
        setStatus("ready");
      } catch {
        setErrorMsg("Invitation not found or has expired.");
        setStatus("invalid");
      }
    };
    load();
  }, [token, navigate]);

  const validate = () => {
    const e = { businessName: "", userName: "", userEmail: "" };
    let ok = true;
    if (!businessName.trim()) {
      e.businessName = "Business name is required.";
      ok = false;
    }
    if (!userName.trim()) {
      e.userName = "User name is required.";
      ok = false;
    }
    if (!userEmail.trim()) {
      e.userEmail = "Email is required.";
      ok = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
      e.userEmail = "Enter a valid email address.";
      ok = false;
    }
    setErrors(e);
    return ok;
  };

  const handleSubmit = async () => {
    if (!validate() || !invitation) return;
    setStatus("submitting");
    try {
      const attrs = await getUserAttributes();
      const userId = (attrs as any)?.sub ?? invitation.userId;
      console.log("userId ==> InviteAccept", userId);
      await createBusiness({
        businessId: invitation.businessId,
        businessName: businessName.trim(),
        businessType,
        ownerName: userName.trim(),
        ownerEmail: userEmail.trim(),
      });
      await createUser({
        businessId: invitation.businessId,
        userId,
        email: userEmail.trim(),
        role: invitation.role,
        displayName: userName.trim(),
        phoneNumber: userPhone.trim() || undefined,
      });
      await updateInvitation(token, { status: "Accepted" });
      setStatus("success");
    } catch {
      setErrorMsg("Failed to complete setup. Please try again.");
      setStatus("ready");
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#080810",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Navbar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: { xs: 2, sm: 4 },
          py: 1.75,
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          bgcolor: "#111",
        }}
      >
        <AutoAwesomeIcon sx={{ color: "#8b5cf6" }} />
        <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>
          MarketingAI
        </Typography>
      </Box>

      {/* Body */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          p: { xs: 2, sm: 4 },
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 560 }}>
          {/* Loading */}
          {status === "loading" && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
              <CircularProgress sx={{ color: "#7c6df0" }} />
            </Box>
          )}

          {/* Invalid */}
          {status === "invalid" && (
            <Box
              sx={{
                bgcolor: "#1a1a24",
                border: "1px solid #32324a",
                borderRadius: "16px",
                p: 4,
                textAlign: "center",
                mt: 6,
              }}
            >
              <ErrorOutlineIcon
                sx={{ color: "#ef4444", fontSize: 48, mb: 2 }}
              />
              <Typography
                sx={{ color: "#f0eeff", fontSize: 17, fontWeight: 700, mb: 1 }}
              >
                Invalid Invitation
              </Typography>
              <Typography sx={{ color: "#a0a0c8", fontSize: 14 }}>
                {errorMsg}
              </Typography>
            </Box>
          )}

          {/* Success */}
          {status === "success" && (
            <Box
              sx={{
                bgcolor: "#1a1a24",
                border: "1px solid #32324a",
                borderRadius: "16px",
                p: 4,
                textAlign: "center",
                mt: 6,
              }}
            >
              <CheckCircleOutlineIcon
                sx={{ color: "#22c55e", fontSize: 52, mb: 2 }}
              />
              <Typography
                sx={{ color: "#f0eeff", fontSize: 17, fontWeight: 700, mb: 1 }}
              >
                Setup Complete!
              </Typography>
              <Typography sx={{ color: "#a0a0c8", fontSize: 14, mb: 3 }}>
                Your business and account have been created successfully.
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/dashboard")}
                sx={{
                  bgcolor: "#7c3aed",
                  textTransform: "none",
                  borderRadius: "10px",
                  fontWeight: 600,
                  "&:hover": { bgcolor: "#6d28d9" },
                }}
              >
                Go to Dashboard
              </Button>
            </Box>
          )}

          {/* Form */}
          {(status === "ready" || status === "submitting") && (
            <>
              {/* Header */}
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}
              >
                <Box
                  sx={{
                    bgcolor: "rgba(167,139,250,0.12)",
                    border: "1px solid rgba(167,139,250,0.25)",
                    borderRadius: "12px",
                    p: "10px",
                    display: "flex",
                  }}
                >
                  <BusinessCenterIcon sx={{ color: "#a78bfa", fontSize: 26 }} />
                </Box>
                <Box>
                  <Typography
                    sx={{ color: "#f0eeff", fontSize: 18, fontWeight: 700 }}
                  >
                    Complete Your Setup
                  </Typography>
                  <Typography sx={{ color: "#7070a0", fontSize: 13, mt: 0.3 }}>
                    Fill in the details below to activate your account.
                  </Typography>
                </Box>
              </Box>

              <Box
                sx={{
                  bgcolor: "#1a1a24",
                  border: "1px solid #2e2e45",
                  borderRadius: "16px",
                  overflow: "hidden",
                }}
              >
                {/* Business Details */}
                <Box sx={{ p: { xs: 2.5, sm: 3 } }}>
                  <Typography
                    sx={{
                      color: "#7070a0",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      mb: 2,
                    }}
                  >
                    Business Details
                  </Typography>

                  <Box sx={{ mb: 2 }}>
                    <Typography sx={labelSx}>Business Name</Typography>
                    <TextField
                      fullWidth
                      placeholder="e.g. Acme Corp"
                      value={businessName}
                      onChange={(e) => {
                        setBusinessName(e.target.value);
                        if (errors.businessName)
                          setErrors((p) => ({ ...p, businessName: "" }));
                      }}
                      error={!!errors.businessName}
                      helperText={errors.businessName}
                      slotProps={{
                        input: { sx: inputSx(!!errors.businessName) },
                      }}
                      sx={fieldSx}
                    />
                  </Box>

                  <Box>
                    <Typography sx={labelSx}>Business Type</Typography>
                    <Select
                      fullWidth
                      value={businessType}
                      onChange={(e) => setBusinessType(e.target.value)}
                      sx={inputSx(false)}
                      MenuProps={{
                        PaperProps: {
                          sx: {
                            bgcolor: "#13131e",
                            border: "1px solid #383850",
                            borderRadius: "10px",
                            color: "#f0eeff",
                            mt: 0.5,
                            "& .MuiMenuItem-root": {
                              fontSize: 14,
                              py: 1.2,
                              "&:hover": { bgcolor: "rgba(124,109,240,0.12)" },
                            },
                            "& .Mui-selected": {
                              bgcolor: "rgba(124,109,240,0.18) !important",
                            },
                          },
                        },
                      }}
                    >
                      {INDUSTRIES.map((ind) => (
                        <MenuItem key={ind} value={ind}>
                          {ind}
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>
                </Box>

                <Divider sx={{ borderColor: "#1e1e30" }} />

                {/* User Details */}
                <Box sx={{ p: { xs: 2.5, sm: 3 } }}>
                  <Typography
                    sx={{
                      color: "#7070a0",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      mb: 2,
                    }}
                  >
                    User Details
                  </Typography>

                  <Box sx={{ mb: 2 }}>
                    <Typography sx={labelSx}>Full Name</Typography>
                    <TextField
                      fullWidth
                      placeholder="e.g. Jane Smith"
                      value={userName}
                      onChange={(e) => {
                        setUserName(e.target.value);
                        if (errors.userName)
                          setErrors((p) => ({ ...p, userName: "" }));
                      }}
                      error={!!errors.userName}
                      helperText={errors.userName}
                      slotProps={{ input: { sx: inputSx(!!errors.userName) } }}
                      sx={fieldSx}
                    />
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography sx={labelSx}>Email Address</Typography>
                    <TextField
                      fullWidth
                      type="email"
                      placeholder="user@example.com"
                      value={userEmail}
                      onChange={(e) => {
                        setUserEmail(e.target.value);
                        if (errors.userEmail)
                          setErrors((p) => ({ ...p, userEmail: "" }));
                      }}
                      error={!!errors.userEmail}
                      helperText={errors.userEmail}
                      slotProps={{ input: { sx: inputSx(!!errors.userEmail) } }}
                      sx={fieldSx}
                    />
                  </Box>

                  <Box>
                    <Typography sx={labelSx}>
                      Phone Number{" "}
                      <span style={{ color: "#50507a", fontWeight: 400 }}>
                        (optional)
                      </span>
                    </Typography>
                    <TextField
                      fullWidth
                      placeholder="+1 555 000 0000"
                      value={userPhone}
                      onChange={(e) => setUserPhone(e.target.value)}
                      slotProps={{ input: { sx: inputSx(false) } }}
                      sx={fieldSx}
                    />
                  </Box>
                </Box>

                <Divider sx={{ borderColor: "#1e1e30" }} />

                {/* Error banner */}
                {errorMsg && status === "ready" && (
                  <Box
                    sx={{
                      mx: 3,
                      mt: 2,
                      bgcolor: "#1a0808",
                      border: "0.5px solid #5c1a1a",
                      borderRadius: "8px",
                      p: "10px 14px",
                    }}
                  >
                    <Typography sx={{ color: "#ef4444", fontSize: 13 }}>
                      {errorMsg}
                    </Typography>
                  </Box>
                )}

                {/* Actions */}
                <Box sx={{ p: { xs: 2.5, sm: 3 } }}>
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={status === "submitting"}
                    sx={{
                      bgcolor: "#7c3aed",
                      textTransform: "none",
                      fontSize: 15,
                      fontWeight: 600,
                      borderRadius: "10px",
                      py: 1.5,
                      "&:hover": { bgcolor: "#6d28d9" },
                      "&.Mui-disabled": {
                        bgcolor: "#3d2060",
                        color: "#7050a0",
                      },
                    }}
                  >
                    {status === "submitting" ? (
                      <CircularProgress size={18} sx={{ color: "#a89cf0" }} />
                    ) : (
                      "Complete Setup"
                    )}
                  </Button>
                </Box>
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
