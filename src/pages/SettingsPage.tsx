import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Dialog,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  CircularProgress,
  IconButton,
  Tooltip,
  Divider,
  useMediaQuery,
  useTheme,
  Tabs,
  Tab,
  Snackbar,
  Alert,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SettingsIcon from "@mui/icons-material/Settings";
import PeopleIcon from "@mui/icons-material/People";
import BusinessIcon from "@mui/icons-material/Business";
import LinkIcon from "@mui/icons-material/Link";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import AddBusinessIcon from "@mui/icons-material/AddBusiness";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import FacebookIcon from "@mui/icons-material/Facebook";
import {
  getUsers,
  createUser,
  deleteUser,
  updateUser,
  getSocialConnections,
  getLinkedInAuthUrl,
  getMetaAuthUrl,
  getMetaPages,
  disconnectSocialPlatform,
  api,
} from "../services/api";
import type { User, SocialConnection, MetaPageInfo } from "../services/api";

const HARDCODED_BUSINESS_ID = "BUS001";

export interface Business {
  businessId: string;
  businessName: string;
  businessType: string;
  status: string;
  createdAt: string;
  phone?: string;
  region?: string;
}

const INDUSTRIES = [
  "Retail", "Food & Beverage", "Technology", "Healthcare",
  "Education", "Finance", "Real Estate", "Entertainment", "Other",
];

// ── Styled input helpers ──
const userFieldInputSx = (hasError: boolean) => ({
  bgcolor: "#a78bfa",
  borderRadius: "10px",
  "& fieldset": { borderColor: hasError ? "#ef4444" : "#383850", borderWidth: "1px" },
  "&:hover fieldset": { borderColor: hasError ? "#f87171" : "#7c6df0" },
  "&.Mui-focused fieldset": { borderColor: hasError ? "#ef4444" : "#7c6df0", borderWidth: "1.5px" },
  "& input": { color: "#ffffff", fontSize: 14, py: "13px", px: "14px" },
  "& input::placeholder": { color: "#7070a0", opacity: 1 },
  "& .MuiSelect-select": { color: "#ffffff", fontSize: 14, py: "13px", px: "14px" },
  "& .MuiSvgIcon-root": { color: "#9090c0" },
});

const busFieldInputSx = (hasError: boolean) => ({
  bgcolor: "#1a1a28",
  borderRadius: "10px",
  "& fieldset": { borderColor: hasError ? "#ef4444" : "#383850", borderWidth: "1px" },
  "&:hover fieldset": { borderColor: hasError ? "#f87171" : "#7c6df0" },
  "&.Mui-focused fieldset": { borderColor: hasError ? "#ef4444" : "#7c6df0", borderWidth: "1.5px" },
  "& input": { color: "#ffffff", fontSize: 14, py: "13px", px: "14px" },
  "& input::placeholder": { color: "#7070a0", opacity: 1 },
  "& .MuiSelect-select": { color: "#ffffff", fontSize: 14, py: "13px", px: "14px" },
  "& .MuiSvgIcon-root": { color: "#9090c0" },
});

const menuProps = {
  PaperProps: {
    sx: {
      bgcolor: "#13131e",
      border: "1px solid #383850",
      borderRadius: "10px",
      color: "#f0eeff",
      mt: 0.5,
      "& .MuiMenuItem-root": { fontSize: 14, py: 1.2, "&:hover": { bgcolor: "rgba(124,109,240,0.12)" } },
      "& .Mui-selected": { bgcolor: "rgba(124,109,240,0.18) !important" },
    },
  },
} as any;

// ── User form defaults ──
const emptyUserForm = { email: "", displayName: "", role: "VIEWER", businessId: HARDCODED_BUSINESS_ID };
const emptyUserErrors = { email: "", displayName: "", businessId: "" };

// ── Business form defaults ──
const emptyBusForm = { businessName: "", businessType: "Retail", status: "ACTIVE", ownerEmail: "", ownerName: "" };
const emptyBusErrors = { businessName: "", ownerEmail: "", ownerName: "" };

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.between("sm", "md"));

  // ── Tab (0=Team Members, 1=Businesses, 2=Connected Services) ──
  const [activeTab, setActiveTab] = useState(0);

  // ── Snackbar ──
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  // ── Team Members state ──
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userSubmitting, setUserSubmitting] = useState(false);
  const [userDeletingId, setUserDeletingId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [userFieldErrors, setUserFieldErrors] = useState(emptyUserErrors);

  // ── Businesses state ──
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [busLoading, setBusLoading] = useState(false);
  const [busError, setBusError] = useState<string | null>(null);
  const [busDialogOpen, setBusDialogOpen] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [busSubmitting, setBusSubmitting] = useState(false);
  const [busDeletingId, setBusDeletingId] = useState<string | null>(null);
  const [busForm, setBusForm] = useState(emptyBusForm);
  const [busFieldErrors, setBusFieldErrors] = useState(emptyBusErrors);
  const [createdBusinessId, setCreatedBusinessId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Connected Services state ──
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // ── Facebook / Meta state ──
  const [facebookPage, setFacebookPage] = useState<MetaPageInfo | null>(null);
  const [fbConnecting, setFbConnecting] = useState(false);
  const [fbDisconnecting, setFbDisconnecting] = useState(false);

  useEffect(() => {
    fetchUsers();
    checkUrlParams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === 1) fetchBusinesses();
    if (activeTab === 2) fetchConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── URL param check (OAuth redirect back) ──
  const checkUrlParams = () => {
    const params = new URLSearchParams(window.location.search);

    const linkedin = params.get("linkedin");
    if (linkedin === "success") {
      setSnackbar({ open: true, message: "LinkedIn connected successfully!", severity: "success" });
      setActiveTab(2);
    } else if (linkedin === "error") {
      const msg = params.get("message") ?? "Unknown error";
      setSnackbar({ open: true, message: `Failed to connect LinkedIn: ${msg}`, severity: "error" });
    }

    const facebook = params.get("facebook");
    if (facebook === "success") {
      setSnackbar({ open: true, message: "Facebook Page connected successfully!", severity: "success" });
      setActiveTab(2);
    } else if (facebook === "error") {
      const msg = params.get("message") ?? "Unknown error";
      setSnackbar({ open: true, message: `Failed to connect Facebook: ${msg}`, severity: "error" });
    }

    if (linkedin || facebook) window.history.replaceState({}, "", window.location.pathname);
  };

  const closeSnackbar = () => setSnackbar((p) => ({ ...p, open: false }));

  // ── Team Members handlers ──
  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await getUsers(HARDCODED_BUSINESS_ID));
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  const openAddUserDialog = () => {
    setEditingUser(null);
    setUserForm(emptyUserForm);
    setUserFieldErrors(emptyUserErrors);
    setUserDialogOpen(true);
  };

  const openEditUserDialog = (user: User) => {
    setEditingUser(user);
    setUserForm({ email: user.email, displayName: user.displayName, role: user.role, businessId: user.businessId });
    setUserFieldErrors(emptyUserErrors);
    setUserDialogOpen(true);
  };

  const validateUser = () => {
    const errors = { email: "", displayName: "", businessId: "" };
    let valid = true;
    if (!userForm.email.trim()) { errors.email = "Email is required."; valid = false; }
    else if (!validateEmail(userForm.email)) { errors.email = "Enter a valid email address."; valid = false; }
    if (!userForm.displayName.trim()) { errors.displayName = "Display name is required."; valid = false; }
    if (!userForm.businessId.trim()) { errors.businessId = "Business ID is required."; valid = false; }
    setUserFieldErrors(errors);
    return valid;
  };

  const handleUserSubmit = async () => {
    if (!validateUser()) return;
    setUserSubmitting(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.userId, userForm);
      } else {
        await createUser(userForm);
      }
      setUserDialogOpen(false);
      await fetchUsers();
    } catch {
      setError(editingUser ? "Failed to update user." : "Failed to create user.");
    } finally {
      setUserSubmitting(false);
    }
  };

  const handleUserDelete = async (userId: string) => {
    setUserDeletingId(userId);
    try {
      await deleteUser(HARDCODED_BUSINESS_ID, userId);
      setUsers((prev) => prev.filter((u) => u.userId !== userId));
    } catch {
      setError("Failed to delete user.");
    } finally {
      setUserDeletingId(null);
    }
  };

  const handleUserFieldChange = (field: keyof typeof emptyUserForm, value: string) => {
    setUserForm((p) => ({ ...p, [field]: value }));
    if (userFieldErrors[field as keyof typeof userFieldErrors])
      setUserFieldErrors((p) => ({ ...p, [field]: "" }));
  };

  // ── Businesses handlers ──
  const fetchBusinesses = async () => {
    setBusLoading(true);
    setBusError(null);
    try {
      const res = await api.get("/business");
      const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      setBusinesses(Array.isArray(data) ? data : data?.businesses ?? []);
    } catch {
      setBusError("Failed to load businesses.");
    } finally {
      setBusLoading(false);
    }
  };

  const openAddBusDialog = () => {
    setEditingBusiness(null);
    setBusForm(emptyBusForm);
    setBusFieldErrors(emptyBusErrors);
    setBusDialogOpen(true);
  };

  const openEditBusDialog = (business: Business) => {
    setEditingBusiness(business);
    setBusForm({ businessName: business.businessName, businessType: business.businessType, status: business.status, ownerEmail: "", ownerName: "" });
    setBusFieldErrors(emptyBusErrors);
    setBusDialogOpen(true);
  };

  const validateBus = () => {
    const errors = { businessName: "", ownerEmail: "", ownerName: "" };
    let valid = true;
    if (!busForm.businessName.trim()) { errors.businessName = "Business name is required."; valid = false; }
    if (!editingBusiness && !busForm.ownerEmail.trim()) { errors.ownerEmail = "Owner email is required."; valid = false; }
    if (!editingBusiness && !busForm.ownerName.trim()) { errors.ownerName = "Owner name is required."; valid = false; }
    setBusFieldErrors(errors);
    return valid;
  };

  const handleBusSubmit = async () => {
    if (!validateBus()) return;
    setBusSubmitting(true);
    try {
      if (editingBusiness) {
        await api.put(`/business/${editingBusiness.businessId}`, {
          businessName: busForm.businessName,
          businessType: busForm.businessType,
          status: busForm.status,
        });
      } else {
        const res = await api.post("/business", busForm);
        const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        setCreatedBusinessId(data?.business?.businessId ?? null);
      }
      setBusDialogOpen(false);
      await fetchBusinesses();
    } catch {
      setBusError(editingBusiness ? "Failed to update business." : "Failed to create business.");
    } finally {
      setBusSubmitting(false);
    }
  };

  const handleBusDelete = async (businessId: string) => {
    setBusDeletingId(businessId);
    try {
      await api.delete(`/business/${businessId}`);
      setBusinesses((prev) => prev.filter((b) => b.businessId !== businessId));
    } catch {
      setBusError("Failed to delete business.");
    } finally {
      setBusDeletingId(null);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBusFieldChange = (field: keyof typeof emptyBusForm, value: string) => {
    setBusForm((p) => ({ ...p, [field]: value }));
    if (field in busFieldErrors) setBusFieldErrors((p) => ({ ...p, [field]: "" }));
  };

  const isBusFormValid =
    !!busForm.businessName.trim() &&
    (!!editingBusiness || (!!busForm.ownerName.trim() && !!busForm.ownerEmail.trim()));

  // ── Connected Services handlers ──
  const fetchConnections = async () => {
    setConnectionsLoading(true);
    setConnectError(null);
    try {
      const [conns, fbInfo] = await Promise.all([getSocialConnections(), getMetaPages()]);
      setConnections(conns);
      setFacebookPage(fbInfo);
    } catch {
      setConnectError("Failed to load connections.");
    } finally {
      setConnectionsLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const authUrl = await getLinkedInAuthUrl();
      window.location.href = authUrl;
    } catch {
      setSnackbar({ open: true, message: "Failed to initiate LinkedIn connection.", severity: "error" });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectSocialPlatform("linkedin");
      await fetchConnections();
      setSnackbar({ open: true, message: "LinkedIn disconnected.", severity: "success" });
    } catch {
      setSnackbar({ open: true, message: "Failed to disconnect LinkedIn.", severity: "error" });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleFbConnect = async () => {
    setFbConnecting(true);
    try {
      const authUrl = await getMetaAuthUrl();
      window.location.href = authUrl;
    } catch {
      setSnackbar({ open: true, message: "Failed to initiate Facebook connection.", severity: "error" });
      setFbConnecting(false);
    }
  };

  const handleFbDisconnect = async () => {
    setFbDisconnecting(true);
    try {
      await disconnectSocialPlatform("facebook");
      await fetchConnections();
      setSnackbar({ open: true, message: "Facebook Page disconnected.", severity: "success" });
    } catch {
      setSnackbar({ open: true, message: "Failed to disconnect Facebook.", severity: "error" });
    } finally {
      setFbDisconnecting(false);
    }
  };

  const linkedinConnection =
    connections.find((c) => c.platform === "linkedin" && c.status === "connected") ?? null;
  const facebookConnected = facebookPage?.status === "connected";

  return (
    <Box sx={{ height: "100vh", bgcolor: "#0d0d0f", display: "flex", flexDirection: "column" }}>
      {/* Navbar */}
      <Box sx={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        px: { xs: 2, sm: 3, md: 4 }, py: 1.75,
        borderBottom: "1px solid rgba(255,255,255,0.07)", bgcolor: "#111", flexShrink: 0,
      }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AutoAwesomeIcon sx={{ color: "#8b5cf6" }} />
          <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>MarketingAI</Typography>
        </Box>
        <Button onClick={() => navigate("/dashboard")} startIcon={<ArrowBackIcon />}
          sx={{ color: "#a0aec0", textTransform: "none", fontSize: 14, "&:hover": { color: "#fff" } }}>
          Dashboard
        </Button>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 2, sm: 3, md: 4 } }}>
        {/* Page heading */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
          <SettingsIcon sx={{ color: "#7c6df0", fontSize: 24 }} />
          <Typography sx={{ color: "#f0eeff", fontSize: 20, fontWeight: 600 }}>Account Settings</Typography>
        </Box>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            mb: 3,
            borderBottom: "0.5px solid #2a2a35",
            "& .MuiTabs-indicator": { bgcolor: "#7c6df0" },
            "& .MuiTab-root": {
              color: "#64748b", textTransform: "none", fontSize: 14,
              fontWeight: 500, minHeight: 42, px: 2, gap: 0.75,
            },
            "& .Mui-selected": { color: "#e0dcf8" },
          }}
        >
          <Tab icon={<PeopleIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Team Members" />
          <Tab icon={<BusinessIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Businesses" />
          <Tab icon={<LinkIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Connected Services" />
        </Tabs>

        {/* ── Team Members Tab ── */}
        {activeTab === 0 && (
          <Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
              <Button variant="contained" onClick={openAddUserDialog}
                startIcon={<PersonAddAltIcon sx={{ fontSize: 16 }} />}
                sx={{ bgcolor: "#5a4fd0", textTransform: "none", fontSize: 13, borderRadius: "8px", "&:hover": { bgcolor: "#6b5fe0" } }}>
                Add User
              </Button>
            </Box>

            {error && (
              <Box sx={{ bgcolor: "#1a0808", border: "0.5px solid #5c1a1a", borderRadius: "8px", p: "12px", mb: 2 }}>
                <Typography sx={{ color: "#ef4444", fontSize: 13 }}>{error}</Typography>
              </Box>
            )}

            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
                <CircularProgress sx={{ color: "#7c6df0" }} />
              </Box>
            ) : users.length === 0 ? (
              <Box sx={{ border: "0.5px solid #2a2a35", borderRadius: "10px", p: 4, textAlign: "center" }}>
                <Typography sx={{ color: "#555", fontSize: 13 }}>No users found.</Typography>
              </Box>
            ) : isMobile ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {users.map((user) => (
                  <Box key={user.userId} sx={{
                    border: "0.5px solid #2a2a35", borderRadius: "10px", bgcolor: "#111118", p: 2,
                    "&:hover": { borderColor: "rgba(124,109,240,0.4)" },
                  }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                      <Box>
                        <Typography sx={{ color: "#e0dcf8", fontSize: 14, fontWeight: 600 }}>{user.displayName}</Typography>
                        <Typography sx={{ color: "#8090a8", fontSize: 12, mt: 0.3 }}>{user.email}</Typography>
                      </Box>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        <IconButton size="small" onClick={() => openEditUserDialog(user)}
                          sx={{ color: "#7c6df0", "&:hover": { bgcolor: "rgba(124,109,240,0.12)" } }}>
                          <EditOutlinedIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleUserDelete(user.userId)} disabled={userDeletingId === user.userId}
                          sx={{ color: "#ef4444", "&:hover": { bgcolor: "rgba(239,68,68,0.1)" }, "&.Mui-disabled": { color: "#5a2020" } }}>
                          {userDeletingId === user.userId
                            ? <CircularProgress size={14} sx={{ color: "#ef4444" }} />
                            : <DeleteOutlineIcon sx={{ fontSize: 17 }} />}
                        </IconButton>
                      </Box>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      <Box sx={{
                        px: "8px", py: "2px", borderRadius: "20px", fontSize: 11, fontWeight: 600,
                        bgcolor: user.role === "ADMIN" ? "rgba(139,92,246,0.15)" : "rgba(124,109,240,0.1)",
                        color: user.role === "ADMIN" ? "#a78bfa" : "#7c6df0",
                        border: `0.5px solid ${user.role === "ADMIN" ? "rgba(139,92,246,0.3)" : "rgba(124,109,240,0.25)"}`,
                      }}>{user.role}</Box>
                      <Box sx={{
                        px: "8px", py: "2px", borderRadius: "20px", fontSize: 11, fontWeight: 600,
                        bgcolor: user.status === "ACTIVE" ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)",
                        color: user.status === "ACTIVE" ? "#22c55e" : "#64748b",
                        border: `0.5px solid ${user.status === "ACTIVE" ? "rgba(34,197,94,0.25)" : "rgba(100,116,139,0.25)"}`,
                      }}>{user.status}</Box>
                      <Typography sx={{ color: "#6070a0", fontSize: 11, ml: "auto" }}>
                        {new Date(user.createdAt).toLocaleDateString()}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Box sx={{ border: "0.5px solid #2a2a35", borderRadius: "10px", overflow: "hidden" }}>
                <Box sx={{ overflowX: "auto" }}>
                  <Table sx={{ minWidth: isTablet ? 500 : 650 }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: "#141418" }}>
                        {["Display Name", "Email", "Role", "Status", ...(!isTablet ? ["Created At"] : []), "Actions"].map((h) => (
                          <TableCell key={h} sx={{ color: "#c0c0d8", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "0.5px solid #2a2a35", py: 1.5, whiteSpace: "nowrap" }}>
                            {h}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.userId}
                          sx={{ "&:hover": { bgcolor: "rgba(124,109,240,0.04)" }, "&:last-child td": { borderBottom: "none" } }}>
                          <TableCell sx={{ color: "#e0dcf8", fontSize: 13, borderBottom: "0.5px solid #1e1e2e", whiteSpace: "nowrap" }}>
                            {user.displayName}
                          </TableCell>
                          <TableCell sx={{ color: "#c8d0e0", fontSize: 13, borderBottom: "0.5px solid #1e1e2e", maxWidth: isTablet ? 140 : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {user.email}
                          </TableCell>
                          <TableCell sx={{ borderBottom: "0.5px solid #1e1e2e" }}>
                            <Box sx={{
                              display: "inline-block", px: "10px", py: "2px", borderRadius: "20px", fontSize: 11, fontWeight: 600,
                              bgcolor: user.role === "ADMIN" ? "rgba(139,92,246,0.15)" : "rgba(124,109,240,0.1)",
                              color: user.role === "ADMIN" ? "#a78bfa" : "#7c6df0",
                              border: `0.5px solid ${user.role === "ADMIN" ? "rgba(139,92,246,0.3)" : "rgba(124,109,240,0.25)"}`,
                            }}>{user.role}</Box>
                          </TableCell>
                          <TableCell sx={{ borderBottom: "0.5px solid #1e1e2e" }}>
                            <Box sx={{
                              display: "inline-block", px: "10px", py: "2px", borderRadius: "20px", fontSize: 11, fontWeight: 600,
                              bgcolor: user.status === "ACTIVE" ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)",
                              color: user.status === "ACTIVE" ? "#22c55e" : "#64748b",
                              border: `0.5px solid ${user.status === "ACTIVE" ? "rgba(34,197,94,0.25)" : "rgba(100,116,139,0.25)"}`,
                            }}>{user.status}</Box>
                          </TableCell>
                          {!isTablet && (
                            <TableCell sx={{ color: "#a0b0c8", fontSize: 12, borderBottom: "0.5px solid #1e1e2e", whiteSpace: "nowrap" }}>
                              {new Date(user.createdAt).toLocaleDateString()}
                            </TableCell>
                          )}
                          <TableCell sx={{ borderBottom: "0.5px solid #1e1e2e" }}>
                            <Box sx={{ display: "flex", gap: 0.5 }}>
                              <Tooltip title="Edit user" placement="top">
                                <IconButton size="small" onClick={() => openEditUserDialog(user)}
                                  sx={{ color: "#7c6df0", "&:hover": { bgcolor: "rgba(124,109,240,0.12)", color: "#a89cf0" } }}>
                                  <EditOutlinedIcon sx={{ fontSize: 17 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete user" placement="top">
                                <IconButton size="small" onClick={() => handleUserDelete(user.userId)} disabled={userDeletingId === user.userId}
                                  sx={{ color: "#ef4444", "&:hover": { bgcolor: "rgba(239,68,68,0.1)", color: "#f87171" }, "&.Mui-disabled": { color: "#5a2020" } }}>
                                  {userDeletingId === user.userId
                                    ? <CircularProgress size={14} sx={{ color: "#ef4444" }} />
                                    : <DeleteOutlineIcon sx={{ fontSize: 17 }} />}
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </Box>
            )}
          </Box>
        )}

        {/* ── Businesses Tab ── */}
        {activeTab === 1 && (
          <Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
              <Button variant="contained" onClick={openAddBusDialog}
                startIcon={<AddBusinessIcon sx={{ fontSize: 16 }} />}
                sx={{ bgcolor: "#5a4fd0", textTransform: "none", fontSize: 13, borderRadius: "8px", "&:hover": { bgcolor: "#6b5fe0" } }}>
                Add Business
              </Button>
            </Box>

            {busError && (
              <Box sx={{ bgcolor: "#1a0808", border: "0.5px solid #5c1a1a", borderRadius: "8px", p: "12px", mb: 2 }}>
                <Typography sx={{ color: "#ef4444", fontSize: 13 }}>{busError}</Typography>
              </Box>
            )}

            {busLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
                <CircularProgress sx={{ color: "#7c6df0" }} />
              </Box>
            ) : businesses.length === 0 ? (
              <Box sx={{ border: "0.5px solid #2a2a35", borderRadius: "10px", p: 4, textAlign: "center" }}>
                <Typography sx={{ color: "#555", fontSize: 13 }}>No businesses found.</Typography>
              </Box>
            ) : isMobile ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {businesses.map((b) => (
                  <Box key={b.businessId} sx={{
                    border: "0.5px solid #2a2a35", borderRadius: "10px", bgcolor: "#111118", p: 2,
                    "&:hover": { borderColor: "rgba(124,109,240,0.4)" },
                  }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                      <Box>
                        <Typography sx={{ color: "#e0dcf8", fontSize: 14, fontWeight: 600 }}>{b.businessName}</Typography>
                        <Typography sx={{ color: "#8090a8", fontSize: 12, mt: 0.3 }}>ID: {b.businessId}</Typography>
                      </Box>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        <IconButton size="small" onClick={() => openEditBusDialog(b)}
                          sx={{ color: "#7c6df0", "&:hover": { bgcolor: "rgba(124,109,240,0.12)" } }}>
                          <EditOutlinedIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleBusDelete(b.businessId)} disabled={busDeletingId === b.businessId}
                          sx={{ color: "#ef4444", "&:hover": { bgcolor: "rgba(239,68,68,0.1)" }, "&.Mui-disabled": { color: "#5a2020" } }}>
                          {busDeletingId === b.businessId
                            ? <CircularProgress size={14} sx={{ color: "#ef4444" }} />
                            : <DeleteOutlineIcon sx={{ fontSize: 17 }} />}
                        </IconButton>
                      </Box>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      <Box sx={{
                        px: "8px", py: "2px", borderRadius: "20px", fontSize: 11, fontWeight: 600,
                        bgcolor: "rgba(124,109,240,0.1)", color: "#7c6df0",
                        border: "0.5px solid rgba(124,109,240,0.25)",
                      }}>{b.businessType}</Box>
                      <Box sx={{
                        px: "8px", py: "2px", borderRadius: "20px", fontSize: 11, fontWeight: 600,
                        bgcolor: b.status === "ACTIVE" ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)",
                        color: b.status === "ACTIVE" ? "#22c55e" : "#64748b",
                        border: `0.5px solid ${b.status === "ACTIVE" ? "rgba(34,197,94,0.25)" : "rgba(100,116,139,0.25)"}`,
                      }}>{b.status}</Box>
                      <Typography sx={{ color: "#6070a0", fontSize: 11, ml: "auto" }}>
                        {new Date(b.createdAt).toLocaleDateString()}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Box sx={{ border: "0.5px solid #2a2a35", borderRadius: "10px", overflow: "hidden" }}>
                <Box sx={{ overflowX: "auto" }}>
                  <Table sx={{ minWidth: isTablet ? 500 : 650 }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: "#141418" }}>
                        {["Business ID", "Name", "Business Type", "Status", ...(!isTablet ? ["Created At"] : []), "Actions"].map((h) => (
                          <TableCell key={h} sx={{ color: "#c0c0d8", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "0.5px solid #2a2a35", py: 1.5, whiteSpace: "nowrap" }}>
                            {h}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {businesses.map((b) => (
                        <TableRow key={b.businessId}
                          sx={{ "&:hover": { bgcolor: "rgba(124,109,240,0.04)" }, "&:last-child td": { borderBottom: "none" } }}>
                          <TableCell sx={{ color: "#a89cf0", fontSize: 13, borderBottom: "0.5px solid #1e1e2e", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                            {b.businessId}
                          </TableCell>
                          <TableCell sx={{ color: "#e0dcf8", fontSize: 13, borderBottom: "0.5px solid #1e1e2e", whiteSpace: "nowrap" }}>
                            {b.businessName}
                          </TableCell>
                          <TableCell sx={{ color: "#c8d0e0", fontSize: 13, borderBottom: "0.5px solid #1e1e2e" }}>
                            {b.businessType}
                          </TableCell>
                          <TableCell sx={{ borderBottom: "0.5px solid #1e1e2e" }}>
                            <Box sx={{
                              display: "inline-block", px: "10px", py: "2px", borderRadius: "20px", fontSize: 11, fontWeight: 600,
                              bgcolor: b.status === "ACTIVE" ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)",
                              color: b.status === "ACTIVE" ? "#22c55e" : "#64748b",
                              border: `0.5px solid ${b.status === "ACTIVE" ? "rgba(34,197,94,0.25)" : "rgba(100,116,139,0.25)"}`,
                            }}>{b.status}</Box>
                          </TableCell>
                          {!isTablet && (
                            <TableCell sx={{ color: "#a0b0c8", fontSize: 12, borderBottom: "0.5px solid #1e1e2e", whiteSpace: "nowrap" }}>
                              {new Date(b.createdAt).toLocaleDateString()}
                            </TableCell>
                          )}
                          <TableCell sx={{ borderBottom: "0.5px solid #1e1e2e" }}>
                            <Box sx={{ display: "flex", gap: 0.5 }}>
                              <Tooltip title="Edit business" placement="top">
                                <IconButton size="small" onClick={() => openEditBusDialog(b)}
                                  sx={{ color: "#7c6df0", "&:hover": { bgcolor: "rgba(124,109,240,0.12)", color: "#a89cf0" } }}>
                                  <EditOutlinedIcon sx={{ fontSize: 17 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete business" placement="top">
                                <IconButton size="small" onClick={() => handleBusDelete(b.businessId)} disabled={busDeletingId === b.businessId}
                                  sx={{ color: "#ef4444", "&:hover": { bgcolor: "rgba(239,68,68,0.1)", color: "#f87171" }, "&.Mui-disabled": { color: "#5a2020" } }}>
                                  {busDeletingId === b.businessId
                                    ? <CircularProgress size={14} sx={{ color: "#ef4444" }} />
                                    : <DeleteOutlineIcon sx={{ fontSize: 17 }} />}
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </Box>
            )}
          </Box>
        )}

        {/* ── Connected Services Tab ── */}
        {activeTab === 2 && (
          <Box>
            {connectError && (
              <Box sx={{ bgcolor: "#1a0808", border: "0.5px solid #5c1a1a", borderRadius: "8px", p: "12px", mb: 2 }}>
                <Typography sx={{ color: "#ef4444", fontSize: 13 }}>{connectError}</Typography>
              </Box>
            )}

            {connectionsLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
                <CircularProgress sx={{ color: "#7c6df0" }} />
              </Box>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 640 }}>
                {/* LinkedIn card */}
                <Box sx={{
                  border: `0.5px solid ${linkedinConnection ? "rgba(0,119,181,0.4)" : "#2a2a35"}`,
                  borderRadius: "12px", p: { xs: 2, sm: 3 }, bgcolor: "#111118",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap",
                }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box sx={{ bgcolor: "rgba(0,119,181,0.1)", borderRadius: "10px", p: 1, border: "0.5px solid rgba(0,119,181,0.25)", display: "flex" }}>
                      <LinkedInIcon sx={{ color: "#0077b5", fontSize: 26 }} />
                    </Box>
                    <Box>
                      <Typography sx={{ color: "#e0dcf8", fontWeight: 600, fontSize: 15 }}>LinkedIn</Typography>
                      {linkedinConnection ? (
                        <>
                          <Typography sx={{ color: "#a0b0c8", fontSize: 12 }}>
                            Connected as {linkedinConnection.displayName ?? "—"}
                          </Typography>
                          {linkedinConnection.connectedAt && (
                            <Typography sx={{ color: "#64748b", fontSize: 11, mt: 0.2 }}>
                              Since {new Date(linkedinConnection.connectedAt).toLocaleDateString()}
                            </Typography>
                          )}
                        </>
                      ) : (
                        <Typography sx={{ color: "#64748b", fontSize: 12 }}>Not connected</Typography>
                      )}
                    </Box>
                  </Box>
                  {linkedinConnection ? (
                    <Button onClick={handleDisconnect} disabled={disconnecting} variant="outlined" size="small"
                      sx={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.4)", textTransform: "none", fontSize: 13, borderRadius: "8px", minWidth: 100, "&:hover": { bgcolor: "rgba(239,68,68,0.08)", borderColor: "#ef4444" } }}>
                      {disconnecting ? <CircularProgress size={14} sx={{ color: "#ef4444" }} /> : "Disconnect"}
                    </Button>
                  ) : (
                    <Button onClick={handleConnect} disabled={connecting} variant="contained" size="small"
                      sx={{ bgcolor: "#0077b5", textTransform: "none", fontSize: 13, borderRadius: "8px", minWidth: 100, "&:hover": { bgcolor: "#005f8f" }, "&.Mui-disabled": { bgcolor: "#003850", color: "#335870" } }}>
                      {connecting ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : "Connect"}
                    </Button>
                  )}
                </Box>

                {/* Meta / Facebook card */}
                <Box sx={{
                  border: `0.5px solid ${facebookConnected ? "rgba(24,119,242,0.4)" : "#2a2a35"}`,
                  borderRadius: "12px", p: { xs: 2, sm: 3 }, bgcolor: "#111118",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap",
                }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box sx={{ bgcolor: "rgba(24,119,242,0.1)", borderRadius: "10px", p: 1, border: "0.5px solid rgba(24,119,242,0.2)", display: "flex" }}>
                      <FacebookIcon sx={{ color: "#1877f2", fontSize: 26 }} />
                    </Box>
                    <Box>
                      <Typography sx={{ color: "#e0dcf8", fontWeight: 600, fontSize: 15 }}>Meta (Facebook / Instagram)</Typography>
                      {facebookConnected ? (
                        <>
                          <Typography sx={{ color: "#a0b0c8", fontSize: 12 }}>
                            Connected as {facebookPage?.pageName ?? "—"}
                          </Typography>
                          {facebookPage?.connectedAt && (
                            <Typography sx={{ color: "#64748b", fontSize: 11, mt: 0.2 }}>
                              Since {new Date(facebookPage.connectedAt).toLocaleDateString()}
                            </Typography>
                          )}
                        </>
                      ) : (
                        <Typography sx={{ color: "#64748b", fontSize: 12 }}>Not connected</Typography>
                      )}
                    </Box>
                  </Box>
                  {facebookConnected ? (
                    <Button onClick={handleFbDisconnect} disabled={fbDisconnecting} variant="outlined" size="small"
                      sx={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.4)", textTransform: "none", fontSize: 13, borderRadius: "8px", minWidth: 100, "&:hover": { bgcolor: "rgba(239,68,68,0.08)", borderColor: "#ef4444" } }}>
                      {fbDisconnecting ? <CircularProgress size={14} sx={{ color: "#ef4444" }} /> : "Disconnect"}
                    </Button>
                  ) : (
                    <Button onClick={handleFbConnect} disabled={fbConnecting} variant="contained" size="small"
                      sx={{ bgcolor: "#1877f2", textTransform: "none", fontSize: 13, borderRadius: "8px", minWidth: 100, "&:hover": { bgcolor: "#1462cc" }, "&.Mui-disabled": { bgcolor: "#0c2f60", color: "#2a5090" } }}>
                      {fbConnecting ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : "Connect"}
                    </Button>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* ── Add / Edit User Dialog ── */}
      <Dialog open={userDialogOpen} onClose={() => setUserDialogOpen(false)} fullWidth maxWidth="sm"
        PaperProps={{ sx: { bgcolor: "#1a1a24", border: "1px solid #32324a", borderRadius: "16px", boxShadow: "0 32px 80px rgba(0,0,0,0.7)", mx: { xs: 2, sm: 3 }, width: { xs: "calc(100% - 32px)", sm: "100%" } } }}>
        <Box sx={{ px: { xs: 3, sm: 4 }, pt: 3.5, pb: 2, display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ bgcolor: "rgba(124,109,240,0.18)", borderRadius: "12px", p: "10px", display: "flex", border: "1px solid rgba(124,109,240,0.25)" }}>
            {editingUser ? <EditOutlinedIcon sx={{ color: "#5140d0", fontSize: 22 }} /> : <PersonAddAltIcon sx={{ color: "#5140d0", fontSize: 22 }} />}
          </Box>
          <Box>
            <Typography sx={{ color: "#5140d0", fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>
              {editingUser ? "Edit User" : "Add New User"}
            </Typography>
            <Typography sx={{ color: "#a0a0c8", fontSize: 12.5, mt: 0.3 }}>
              {editingUser ? `Editing: ${editingUser.email}` : "Enter the details for the new team member."}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ borderColor: "#2e2e42" }} />

        <DialogContent sx={{ px: { xs: 3, sm: 4 }, pt: "24px !important", pb: 2 }}>
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Email Address</Typography>
            <TextField type="email" fullWidth placeholder="user@example.com"
              value={userForm.email} onChange={(e) => handleUserFieldChange("email", e.target.value)}
              error={!!userFieldErrors.email} InputProps={{ sx: userFieldInputSx(!!userFieldErrors.email) }}
              InputLabelProps={{ shrink: false }}
              sx={{ "& .MuiInputLabel-root": { display: "none" }, "& .MuiFormHelperText-root": { color: "#ef4444", fontSize: 12, mx: 0, mt: 0.6 } }}
              helperText={userFieldErrors.email} />
          </Box>
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Display Name</Typography>
            <TextField fullWidth placeholder="e.g. Jane Smith"
              value={userForm.displayName} onChange={(e) => handleUserFieldChange("displayName", e.target.value)}
              error={!!userFieldErrors.displayName} InputProps={{ sx: userFieldInputSx(!!userFieldErrors.displayName) }}
              InputLabelProps={{ shrink: false }}
              sx={{ "& .MuiInputLabel-root": { display: "none" }, "& .MuiFormHelperText-root": { color: "#ef4444", fontSize: 12, mx: 0, mt: 0.6 } }}
              helperText={userFieldErrors.displayName} />
          </Box>
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Role</Typography>
            <Select fullWidth value={userForm.role} onChange={(e) => handleUserFieldChange("role", e.target.value)}
              displayEmpty sx={userFieldInputSx(false)} MenuProps={menuProps}>
              <MenuItem value="VIEWER">VIEWER</MenuItem>
              <MenuItem value="EDITOR">EDITOR</MenuItem>
              <MenuItem value="ADMIN" disabled sx={{ color: "#4a4a6a" }}>ADMIN (restricted)</MenuItem>
            </Select>
          </Box>
          <Box sx={{ mb: 1 }}>
            <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Business ID</Typography>
            <TextField fullWidth placeholder="e.g. BUS001"
              value={userForm.businessId} onChange={(e) => handleUserFieldChange("businessId", e.target.value)}
              error={!!userFieldErrors.businessId} InputProps={{ sx: userFieldInputSx(!!userFieldErrors.businessId) }}
              InputLabelProps={{ shrink: false }}
              sx={{ "& .MuiInputLabel-root": { display: "none" }, "& .MuiFormHelperText-root": { color: "#ef4444", fontSize: 12, mx: 0, mt: 0.6 } }}
              helperText={userFieldErrors.businessId} />
          </Box>
        </DialogContent>

        <Divider sx={{ borderColor: "#2e2e42" }} />

        <DialogActions sx={{ px: { xs: 3, sm: 4 }, py: 2.5, gap: 1.5 }}>
          <Button onClick={() => setUserDialogOpen(false)}
            sx={{ color: "#7070a0", textTransform: "none", fontSize: 14, borderRadius: "10px", px: 2.5, border: "1px solid #44445a", "&:hover": { bgcolor: "rgba(255,255,255,0.06)", borderColor: "#7070a0", color: "#070707" } }}>
            Cancel
          </Button>
          <Button onClick={handleUserSubmit}
            disabled={userSubmitting || (!editingUser && (!userForm.email.trim() || !userForm.displayName.trim() || !userForm.businessId.trim()))}
            variant="contained"
            sx={{ bgcolor: "#a78bfa", textTransform: "none", fontSize: 14, fontWeight: 600, borderRadius: "10px", px: 3, flexGrow: 1, "&:hover": { bgcolor: "#b89ffb" }, "&.Mui-disabled": { bgcolor: "#3d2d60", color: "#f0eef3" } }}>
            {userSubmitting ? <CircularProgress size={16} sx={{ color: "#a89cf0" }} /> : editingUser ? "Save Changes" : "Create User"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Business Created Success Dialog ── */}
      <Dialog open={!!createdBusinessId} onClose={() => setCreatedBusinessId(null)} fullWidth maxWidth="xs"
        PaperProps={{ sx: { bgcolor: "#1a1a24", border: "1px solid #32324a", borderRadius: "16px", boxShadow: "0 32px 80px rgba(0,0,0,0.7)", mx: { xs: 2, sm: 3 } } }}>
        <Box sx={{ p: { xs: 3, sm: 4 }, textAlign: "center" }}>
          <CheckCircleOutlineIcon sx={{ color: "#22c55e", fontSize: 48, mb: 1.5 }} />
          <Typography sx={{ color: "#f0eeff", fontSize: 17, fontWeight: 700, mb: 0.5 }}>Business Created!</Typography>
          <Typography sx={{ color: "#a0a0c8", fontSize: 13, mb: 3 }}>Save this Business ID — it's used to link users to this business.</Typography>
          <Box sx={{ bgcolor: "#0d0d0f", border: "1px solid #2a2a35", borderRadius: "10px", p: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 3 }}>
            <Typography sx={{ color: "#a89cf0", fontFamily: "monospace", fontSize: 16, fontWeight: 700, letterSpacing: "0.05em" }}>
              {createdBusinessId}
            </Typography>
            <Tooltip title={copied ? "Copied!" : "Copy ID"}>
              <IconButton size="small" onClick={() => handleCopyId(createdBusinessId!)}
                sx={{ color: copied ? "#22c55e" : "#7c6df0", "&:hover": { bgcolor: "rgba(124,109,240,0.12)" } }}>
                {copied ? <CheckIcon sx={{ fontSize: 18 }} /> : <ContentCopyIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </Tooltip>
          </Box>
          <Button fullWidth variant="contained" onClick={() => setCreatedBusinessId(null)}
            sx={{ bgcolor: "#5a4fd0", textTransform: "none", fontSize: 14, fontWeight: 600, borderRadius: "10px", "&:hover": { bgcolor: "#6b5fe0" } }}>
            Done
          </Button>
        </Box>
      </Dialog>

      {/* ── Add / Edit Business Dialog ── */}
      <Dialog open={busDialogOpen} onClose={() => setBusDialogOpen(false)} fullWidth maxWidth="sm"
        PaperProps={{ sx: { bgcolor: "#1a1a24", border: "1px solid #32324a", borderRadius: "16px", boxShadow: "0 32px 80px rgba(0,0,0,0.7)", mx: { xs: 2, sm: 3 }, width: { xs: "calc(100% - 32px)", sm: "100%" } } }}>
        <Box sx={{ px: { xs: 3, sm: 4 }, pt: 3.5, pb: 2, display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ bgcolor: "rgba(124,109,240,0.18)", borderRadius: "12px", p: "10px", display: "flex", border: "1px solid rgba(124,109,240,0.25)" }}>
            {editingBusiness ? <EditOutlinedIcon sx={{ color: "#5140d0", fontSize: 22 }} /> : <AddBusinessIcon sx={{ color: "#5140d0", fontSize: 22 }} />}
          </Box>
          <Box>
            <Typography sx={{ color: "#5140d0", fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>
              {editingBusiness ? "Edit Business" : "Add New Business"}
            </Typography>
            <Typography sx={{ color: "#a0a0c8", fontSize: 12.5, mt: 0.3 }}>
              {editingBusiness ? `Editing: ${editingBusiness.businessName}` : "Enter the details for the new business."}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ borderColor: "#2e2e42" }} />

        <DialogContent sx={{ px: { xs: 3, sm: 4 }, pt: "24px !important", pb: 2 }}>
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Business Name</Typography>
            <TextField fullWidth placeholder="e.g. Acme Corp"
              value={busForm.businessName} onChange={(e) => handleBusFieldChange("businessName", e.target.value)}
              error={!!busFieldErrors.businessName} InputProps={{ sx: busFieldInputSx(!!busFieldErrors.businessName) }}
              InputLabelProps={{ shrink: false }}
              sx={{ "& .MuiInputLabel-root": { display: "none" }, "& .MuiFormHelperText-root": { color: "#ef4444", fontSize: 12, mx: 0, mt: 0.6 } }}
              helperText={busFieldErrors.businessName} />
          </Box>
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Business Type</Typography>
            <Select fullWidth value={busForm.businessType} onChange={(e) => handleBusFieldChange("businessType", e.target.value)}
              sx={busFieldInputSx(false)} MenuProps={menuProps}>
              {INDUSTRIES.map((ind) => <MenuItem key={ind} value={ind}>{ind}</MenuItem>)}
            </Select>
          </Box>
          {!editingBusiness && (
            <>
              <Box sx={{ mb: 2.5 }}>
                <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Owner Name</Typography>
                <TextField fullWidth placeholder="e.g. Jane Smith"
                  value={busForm.ownerName} onChange={(e) => handleBusFieldChange("ownerName", e.target.value)}
                  error={!!busFieldErrors.ownerName} InputProps={{ sx: busFieldInputSx(!!busFieldErrors.ownerName) }}
                  InputLabelProps={{ shrink: false }}
                  sx={{ "& .MuiInputLabel-root": { display: "none" }, "& .MuiFormHelperText-root": { color: "#ef4444", fontSize: 12, mx: 0, mt: 0.6 } }}
                  helperText={busFieldErrors.ownerName} />
              </Box>
              <Box sx={{ mb: 2.5 }}>
                <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Owner Email</Typography>
                <TextField fullWidth placeholder="e.g. jane@acme.com"
                  value={busForm.ownerEmail} onChange={(e) => handleBusFieldChange("ownerEmail", e.target.value)}
                  error={!!busFieldErrors.ownerEmail} InputProps={{ sx: busFieldInputSx(!!busFieldErrors.ownerEmail) }}
                  InputLabelProps={{ shrink: false }}
                  sx={{ "& .MuiInputLabel-root": { display: "none" }, "& .MuiFormHelperText-root": { color: "#ef4444", fontSize: 12, mx: 0, mt: 0.6 } }}
                  helperText={busFieldErrors.ownerEmail} />
              </Box>
            </>
          )}
          <Box sx={{ mb: 1 }}>
            <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Status</Typography>
            <Select fullWidth value={busForm.status} onChange={(e) => handleBusFieldChange("status", e.target.value)}
              sx={busFieldInputSx(false)} MenuProps={menuProps}>
              <MenuItem value="ACTIVE">ACTIVE</MenuItem>
              <MenuItem value="INACTIVE">INACTIVE</MenuItem>
            </Select>
          </Box>
        </DialogContent>

        <Divider sx={{ borderColor: "#2e2e42" }} />

        <DialogActions sx={{ px: { xs: 3, sm: 4 }, py: 2.5, gap: 1.5 }}>
          <Button onClick={() => setBusDialogOpen(false)}
            sx={{ color: "#7070a0", textTransform: "none", fontSize: 14, borderRadius: "10px", px: 2.5, border: "1px solid #44445a", "&:hover": { bgcolor: "rgba(255,255,255,0.06)", borderColor: "#7070a0" } }}>
            Cancel
          </Button>
          <Button onClick={handleBusSubmit} disabled={busSubmitting || !isBusFormValid} variant="contained"
            sx={{ bgcolor: "#a78bfa", textTransform: "none", fontSize: 14, fontWeight: 600, borderRadius: "10px", px: 3, flexGrow: 1, "&:hover": { bgcolor: "#b89ffb" }, "&.Mui-disabled": { bgcolor: "#3d2d60", color: "#f0eef3" } }}>
            {busSubmitting ? <CircularProgress size={16} sx={{ color: "#a89cf0" }} /> : editingBusiness ? "Save Changes" : "Create Business"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast notifications */}
      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={closeSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={snackbar.severity} onClose={closeSnackbar}
          sx={{
            bgcolor: snackbar.severity === "success" ? "#0d2010" : "#1a0808",
            color: snackbar.severity === "success" ? "#22c55e" : "#ef4444",
            border: `0.5px solid ${snackbar.severity === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            "& .MuiAlert-icon": { color: snackbar.severity === "success" ? "#22c55e" : "#ef4444" },
          }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
