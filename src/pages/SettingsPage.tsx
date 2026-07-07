import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Tabs,
  Tab,
  Snackbar,
  Alert,
  Chip,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SettingsIcon from "@mui/icons-material/Settings";
import PeopleIcon from "@mui/icons-material/People";
import LinkIcon from "@mui/icons-material/Link";
import BusinessIcon from "@mui/icons-material/Business";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import FacebookIcon from "@mui/icons-material/Facebook";
import {
  getSocialConnections,
  getLinkedInAuthUrl,
  disconnectSocialPlatform,
} from "../services/api";
import type { SocialConnection } from "../services/api";
import { UserManagementPanel } from "./UserManagement";
import { BusinessManagementPanel } from "./BusinessManagement";

export default function SettingsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>
    ({ open: false, message: "", severity: "success" });
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => { checkUrlParams(); }, []);
  useEffect(() => { if (activeTab === 2) fetchConnections(); }, [activeTab]);

  const checkUrlParams = () => {
    const params = new URLSearchParams(window.location.search);
    const linkedin = params.get("linkedin");
    if (linkedin === "success") {
      setSnackbar({ open: true, message: "LinkedIn connected successfully!", severity: "success" });
      setActiveTab(1);
    } else if (linkedin === "error") {
      const msg = params.get("message") ?? "Unknown error";
      setSnackbar({ open: true, message: `Failed to connect LinkedIn: ${msg}`, severity: "error" });
    }
    if (linkedin) window.history.replaceState({}, "", window.location.pathname);
  };

  const closeSnackbar = () => setSnackbar((p) => ({ ...p, open: false }));

  const fetchConnections = async () => {
    setConnectionsLoading(true);
    setConnectError(null);
    try {
      setConnections(await getSocialConnections());
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

  const linkedinConnection =
    connections.find((c) => c.platform === "linkedin" && c.status === "connected") ?? null;

  return (
    <Box sx={{ height: "100vh", bgcolor: "#0d0d0f", display: "flex", flexDirection: "column" }}>
      {/* Navbar */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: { xs: 2, sm: 3, md: 4 }, py: 1.75, borderBottom: "1px solid rgba(255,255,255,0.07)", bgcolor: "#111", flexShrink: 0 }}>
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
          <SettingsIcon sx={{ color: "#7c6df0", fontSize: 24 }} />
          <Typography sx={{ color: "#f0eeff", fontSize: 20, fontWeight: 600 }}>Account Settings</Typography>
        </Box>

        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}
          sx={{ mb: 3, borderBottom: "0.5px solid #2a2a35", "& .MuiTabs-indicator": { bgcolor: "#7c6df0" }, "& .MuiTab-root": { color: "#64748b", textTransform: "none", fontSize: 14, fontWeight: 500, minHeight: 42, px: 2, gap: 0.75 }, "& .Mui-selected": { color: "#e0dcf8" } }}>
          <Tab icon={<PeopleIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Team Members" />
          <Tab icon={<BusinessIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Businesses" />
          <Tab icon={<LinkIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Connected Services" />
        </Tabs>

        {/* Team Members Tab */}
        {activeTab === 0 && <UserManagementPanel />}

        {/* Businesses Tab */}
        {activeTab === 1 && <BusinessManagementPanel />}

        {/* Connected Services Tab */}
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
                <Box sx={{ border: `0.5px solid ${linkedinConnection ? "rgba(0,119,181,0.4)" : "#2a2a35"}`, borderRadius: "12px", p: { xs: 2, sm: 3 }, bgcolor: "#111118", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box sx={{ bgcolor: "rgba(0,119,181,0.1)", borderRadius: "10px", p: 1, border: "0.5px solid rgba(0,119,181,0.25)", display: "flex" }}>
                      <LinkedInIcon sx={{ color: "#0077b5", fontSize: 26 }} />
                    </Box>
                    <Box>
                      <Typography sx={{ color: "#e0dcf8", fontWeight: 600, fontSize: 15 }}>LinkedIn</Typography>
                      {linkedinConnection ? (
                        <>
                          <Typography sx={{ color: "#a0b0c8", fontSize: 12 }}>Connected as {linkedinConnection.displayName ?? "—"}</Typography>
                          {linkedinConnection.connectedAt && (
                            <Typography sx={{ color: "#64748b", fontSize: 11, mt: 0.2 }}>Since {new Date(linkedinConnection.connectedAt).toLocaleDateString()}</Typography>
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

                {/* Meta card — coming soon */}
                <Box sx={{ border: "0.5px solid #2a2a35", borderRadius: "12px", p: { xs: 2, sm: 3 }, bgcolor: "#111118", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap", opacity: 0.5, pointerEvents: "none" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box sx={{ bgcolor: "rgba(24,119,242,0.1)", borderRadius: "10px", p: 1, border: "0.5px solid rgba(24,119,242,0.2)", display: "flex" }}>
                      <FacebookIcon sx={{ color: "#1877f2", fontSize: 26 }} />
                    </Box>
                    <Box>
                      <Typography sx={{ color: "#e0dcf8", fontWeight: 600, fontSize: 15 }}>Meta (Facebook / Instagram)</Typography>
                      <Typography sx={{ color: "#64748b", fontSize: 12 }}>Not connected</Typography>
                    </Box>
                  </Box>
                  <Chip label="Coming soon" size="small" sx={{ bgcolor: "rgba(124,109,240,0.12)", color: "#7c6df0", border: "0.5px solid rgba(124,109,240,0.25)", fontSize: 11, height: 24 }} />
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>

      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={closeSnackbar} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={snackbar.severity} onClose={closeSnackbar}
          sx={{ bgcolor: snackbar.severity === "success" ? "#0d2010" : "#1a0808", color: snackbar.severity === "success" ? "#22c55e" : "#ef4444", border: `0.5px solid ${snackbar.severity === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, "& .MuiAlert-icon": { color: snackbar.severity === "success" ? "#22c55e" : "#ef4444" } }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
