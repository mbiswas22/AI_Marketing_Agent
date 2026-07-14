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
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SettingsIcon from "@mui/icons-material/Settings";
import PeopleIcon from "@mui/icons-material/People";
import BusinessIcon from "@mui/icons-material/Business";
import LinkIcon from "@mui/icons-material/Link";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import FacebookIcon from "@mui/icons-material/Facebook";
import InstagramIcon from "@mui/icons-material/Instagram";
import {
  getSocialConnections,
  getLinkedInAuthUrl,
  getMetaAuthUrl,
  getMetaPages,
  getInstagramStatus,
  disconnectSocialPlatform,
  getBusinesses,
} from "../services/api";
import type {
  SocialConnection,
  Business,
  MetaPageInfo,
  InstagramInfo,
} from "../services/api";
import { getUserAttributes } from "../services/auth";
import { UserManagementPanel } from "./UserManagement";
import { BusinessManagementPanel } from "./BusinessManagement";

export default function SettingsPage() {
  const navigate = useNavigate();
  // ── Tab (0=Team Members, 1=Businesses, 2=Connected Services) ──
  const [activeTab, setActiveTab] = useState(0);
  const [business, setBusiness] = useState<Business | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // ── Facebook / Meta state ──
  const [facebookPage, setFacebookPage] = useState<MetaPageInfo | null>(null);
  const [fbConnecting, setFbConnecting] = useState(false);
  const [fbDisconnecting, setFbDisconnecting] = useState(false);

  // ── Instagram state (reuses the Facebook connection, no separate connect flow) ──
  const [instagramInfo, setInstagramInfo] = useState<InstagramInfo | null>(null);

  useEffect(() => {
    checkUrlParams();
    (async () => {
      try {
        const [attrs, businesses] = await Promise.all([
          getUserAttributes(),
          getBusinesses(),
        ]);
        const email = (attrs as { email?: string })?.email;
        // GET /business currently returns every business in the system, not just
        // the caller's own — match by owner email instead of trusting businesses[0].
        const ownBusiness = businesses.find((b: Business) => b.ownerEmail === email);
        setBusiness(ownBusiness ?? businesses[0] ?? null);
      } catch {
        // keep business null
      }
    })();
  }, []);
  useEffect(() => {
    if (activeTab === 2 && business?.businessId) fetchConnections();
  }, [activeTab, business]);

  const checkUrlParams = () => {
    const params = new URLSearchParams(window.location.search);

    const linkedin = params.get("linkedin");
    if (linkedin === "success") {
      setSnackbar({
        open: true,
        message: "LinkedIn connected successfully!",
        severity: "success",
      });
      setActiveTab(2);
    } else if (linkedin === "error") {
      const msg = params.get("message") ?? "Unknown error";
      setSnackbar({
        open: true,
        message: `Failed to connect LinkedIn: ${msg}`,
        severity: "error",
      });
    }
    if (linkedin) window.history.replaceState({}, "", window.location.pathname);

    const facebook = params.get("facebook");
    if (facebook === "success") {
      setSnackbar({
        open: true,
        message: "Facebook Page connected successfully!",
        severity: "success",
      });
      setActiveTab(2);
    } else if (facebook === "error") {
      const msg = params.get("message") ?? "Unknown error";
      setSnackbar({
        open: true,
        message: `Failed to connect Facebook: ${msg}`,
        severity: "error",
      });
    }

    if (linkedin || facebook)
      window.history.replaceState({}, "", window.location.pathname);
  };

  const closeSnackbar = () => setSnackbar((p) => ({ ...p, open: false }));

  const fetchConnections = async () => {
    if (!business?.businessId) return;
    setConnectionsLoading(true);
    setConnectError(null);
    try {
      const [conns, fbInfo, igInfo] = await Promise.all([
        getSocialConnections(business.businessId),
        getMetaPages(business.businessId),
        getInstagramStatus(business.businessId),
      ]);
      setConnections(conns);
      setFacebookPage(fbInfo);
      setInstagramInfo(igInfo);
    } catch {
      setConnectError("Failed to load connections.");
    } finally {
      setConnectionsLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!business?.businessId) return;
    setConnecting(true);
    try {
      const authUrl = await getLinkedInAuthUrl(business.businessId);
      window.location.href = authUrl;
    } catch {
      setSnackbar({
        open: true,
        message: "Failed to initiate LinkedIn connection.",
        severity: "error",
      });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!business?.businessId) return;
    setDisconnecting(true);
    try {
      await disconnectSocialPlatform("linkedin", business.businessId);
      await fetchConnections();
      setSnackbar({
        open: true,
        message: "LinkedIn disconnected.",
        severity: "success",
      });
    } catch {
      setSnackbar({
        open: true,
        message: "Failed to disconnect LinkedIn.",
        severity: "error",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleFbConnect = async () => {
    if (!business?.businessId) return;
    setFbConnecting(true);
    try {
      const authUrl = await getMetaAuthUrl(business.businessId);
      window.location.href = authUrl;
    } catch {
      setSnackbar({
        open: true,
        message: "Failed to initiate Facebook connection.",
        severity: "error",
      });
      setFbConnecting(false);
    }
  };

  const handleFbDisconnect = async () => {
    if (!business?.businessId) return;
    setFbDisconnecting(true);
    try {
      await disconnectSocialPlatform("facebook", business.businessId);
      await fetchConnections();
      setSnackbar({
        open: true,
        message: "Facebook Page disconnected.",
        severity: "success",
      });
    } catch {
      setSnackbar({
        open: true,
        message: "Failed to disconnect Facebook.",
        severity: "error",
      });
    } finally {
      setFbDisconnecting(false);
    }
  };

  const linkedinConnection =
    connections.find(
      (c) => c.platform === "linkedin" && c.status === "connected",
    ) ?? null;
  const facebookConnected = facebookPage?.status === "connected";
  const instagramConnected = instagramInfo?.status === "connected";

  return (
    <Box
      sx={{
        height: "100vh",
        bgcolor: "#0d0d0f",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Navbar */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: { xs: 2, sm: 3, md: 4 },
          py: 1.75,
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          bgcolor: "#111",
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AutoAwesomeIcon sx={{ color: "#8b5cf6" }} />
          <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>
            MarketingAI
          </Typography>
        </Box>
        <Button
          onClick={() => navigate("/dashboard")}
          startIcon={<ArrowBackIcon />}
          sx={{
            color: "#a0aec0",
            textTransform: "none",
            fontSize: 14,
            "&:hover": { color: "#fff" },
          }}
        >
          Dashboard
        </Button>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 2, sm: 3, md: 4 } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
          <SettingsIcon sx={{ color: "#7c6df0", fontSize: 24 }} />
          <Typography sx={{ color: "#f0eeff", fontSize: 20, fontWeight: 600 }}>
            Account Settings
          </Typography>
        </Box>

        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            mb: 3,
            borderBottom: "0.5px solid #2a2a35",
            "& .MuiTabs-indicator": { bgcolor: "#7c6df0" },
            "& .MuiTab-root": {
              color: "#64748b",
              textTransform: "none",
              fontSize: 14,
              fontWeight: 500,
              minHeight: 42,
              px: 2,
              gap: 0.75,
            },
            "& .Mui-selected": { color: "#e0dcf8" },
          }}
        >
          <Tab
            icon={<PeopleIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Team Members"
          />
          <Tab
            icon={<BusinessIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Businesses"
          />
          <Tab
            icon={<LinkIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Connected Services"
          />
        </Tabs>

        {/* Team Members Tab */}
        {activeTab === 0 && (
          <UserManagementPanel
            businessId={business?.businessId}
            businessName={business?.businessName}
          />
        )}

        {/* Businesses Tab */}
        {activeTab === 1 && <BusinessManagementPanel />}

        {/* Connected Services Tab */}
        {activeTab === 2 && (
          <Box>
            {connectError && (
              <Box
                sx={{
                  bgcolor: "#1a0808",
                  border: "0.5px solid #5c1a1a",
                  borderRadius: "8px",
                  p: "12px",
                  mb: 2,
                }}
              >
                <Typography sx={{ color: "#ef4444", fontSize: 13 }}>
                  {connectError}
                </Typography>
              </Box>
            )}

            {connectionsLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
                <CircularProgress sx={{ color: "#7c6df0" }} />
              </Box>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  maxWidth: 640,
                }}
              >
                {/* LinkedIn card */}
                <Box
                  sx={{
                    border: `0.5px solid ${linkedinConnection ? "rgba(0,119,181,0.4)" : "#2a2a35"}`,
                    borderRadius: "12px",
                    p: { xs: 2, sm: 3 },
                    bgcolor: "#111118",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 2,
                    flexWrap: "wrap",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box
                      sx={{
                        bgcolor: "rgba(0,119,181,0.1)",
                        borderRadius: "10px",
                        p: 1,
                        border: "0.5px solid rgba(0,119,181,0.25)",
                        display: "flex",
                      }}
                    >
                      <LinkedInIcon sx={{ color: "#0077b5", fontSize: 26 }} />
                    </Box>
                    <Box>
                      <Typography
                        sx={{ color: "#e0dcf8", fontWeight: 600, fontSize: 15 }}
                      >
                        LinkedIn
                      </Typography>
                      {linkedinConnection ? (
                        <>
                          <Typography sx={{ color: "#a0b0c8", fontSize: 12 }}>
                            Connected as {linkedinConnection.displayName ?? "—"}
                          </Typography>
                          {linkedinConnection.connectedAt && (
                            <Typography
                              sx={{ color: "#64748b", fontSize: 11, mt: 0.2 }}
                            >
                              Since{" "}
                              {new Date(
                                linkedinConnection.connectedAt,
                              ).toLocaleDateString()}
                            </Typography>
                          )}
                        </>
                      ) : (
                        <Typography sx={{ color: "#64748b", fontSize: 12 }}>
                          Not connected
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  {linkedinConnection ? (
                    <Button
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      variant="outlined"
                      size="small"
                      sx={{
                        color: "#ef4444",
                        borderColor: "rgba(239,68,68,0.4)",
                        textTransform: "none",
                        fontSize: 13,
                        borderRadius: "8px",
                        minWidth: 100,
                        "&:hover": {
                          bgcolor: "rgba(239,68,68,0.08)",
                          borderColor: "#ef4444",
                        },
                      }}
                    >
                      {disconnecting ? (
                        <CircularProgress size={14} sx={{ color: "#ef4444" }} />
                      ) : (
                        "Disconnect"
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleConnect}
                      disabled={connecting || !business?.businessId}
                      variant="contained"
                      size="small"
                      sx={{
                        bgcolor: "#0077b5",
                        textTransform: "none",
                        fontSize: 13,
                        borderRadius: "8px",
                        minWidth: 100,
                        "&:hover": { bgcolor: "#005f8f" },
                        "&.Mui-disabled": {
                          bgcolor: "#003850",
                          color: "#335870",
                        },
                      }}
                    >
                      {connecting ? (
                        <CircularProgress size={14} sx={{ color: "#fff" }} />
                      ) : (
                        "Connect"
                      )}
                    </Button>
                  )}
                </Box>

                {/* Meta / Facebook card */}
                <Box
                  sx={{
                    border: `0.5px solid ${facebookConnected ? "rgba(24,119,242,0.4)" : "#2a2a35"}`,
                    borderRadius: "12px",
                    p: { xs: 2, sm: 3 },
                    bgcolor: "#111118",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 2,
                    flexWrap: "wrap",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box
                      sx={{
                        bgcolor: "rgba(24,119,242,0.1)",
                        borderRadius: "10px",
                        p: 1,
                        border: "0.5px solid rgba(24,119,242,0.2)",
                        display: "flex",
                      }}
                    >
                      <FacebookIcon sx={{ color: "#1877f2", fontSize: 26 }} />
                    </Box>
                    <Box>
                      <Typography
                        sx={{ color: "#e0dcf8", fontWeight: 600, fontSize: 15 }}
                      >
                        Meta (Facebook / Instagram)
                      </Typography>
                      {facebookConnected ? (
                        <>
                          <Typography sx={{ color: "#a0b0c8", fontSize: 12 }}>
                            Connected as {facebookPage?.pageName ?? "—"}
                          </Typography>
                          {facebookPage?.connectedAt && (
                            <Typography
                              sx={{ color: "#64748b", fontSize: 11, mt: 0.2 }}
                            >
                              Since{" "}
                              {new Date(
                                facebookPage.connectedAt,
                              ).toLocaleDateString()}
                            </Typography>
                          )}
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                              mt: 0.5,
                            }}
                          >
                            <InstagramIcon
                              sx={{
                                fontSize: 14,
                                color: instagramConnected
                                  ? "#e1306c"
                                  : "#475569",
                              }}
                            />
                            <Typography
                              sx={{
                                color: instagramConnected
                                  ? "#e1306c"
                                  : "#64748b",
                                fontSize: 11.5,
                              }}
                            >
                              {instagramConnected
                                ? "Instagram linked"
                                : "No Instagram Business account linked to this Page"}
                            </Typography>
                          </Box>
                        </>
                      ) : (
                        <Typography sx={{ color: "#64748b", fontSize: 12 }}>
                          Not connected
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  {facebookConnected ? (
                    <Button
                      onClick={handleFbDisconnect}
                      disabled={fbDisconnecting}
                      variant="outlined"
                      size="small"
                      sx={{
                        color: "#ef4444",
                        borderColor: "rgba(239,68,68,0.4)",
                        textTransform: "none",
                        fontSize: 13,
                        borderRadius: "8px",
                        minWidth: 100,
                        "&:hover": {
                          bgcolor: "rgba(239,68,68,0.08)",
                          borderColor: "#ef4444",
                        },
                      }}
                    >
                      {fbDisconnecting ? (
                        <CircularProgress size={14} sx={{ color: "#ef4444" }} />
                      ) : (
                        "Disconnect"
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleFbConnect}
                      disabled={fbConnecting || !business?.businessId}
                      variant="contained"
                      size="small"
                      sx={{
                        bgcolor: "#1877f2",
                        textTransform: "none",
                        fontSize: 13,
                        borderRadius: "8px",
                        minWidth: 100,
                        "&:hover": { bgcolor: "#1462cc" },
                        "&.Mui-disabled": {
                          bgcolor: "#0c2f60",
                          color: "#2a5090",
                        },
                      }}
                    >
                      {fbConnecting ? (
                        <CircularProgress size={14} sx={{ color: "#fff" }} />
                      ) : (
                        "Connect"
                      )}
                    </Button>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>
      {/* Toast notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={closeSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={closeSnackbar}
          sx={{
            bgcolor: snackbar.severity === "success" ? "#0d2010" : "#1a0808",
            color: snackbar.severity === "success" ? "#22c55e" : "#ef4444",
            border: `0.5px solid ${snackbar.severity === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            "& .MuiAlert-icon": {
              color: snackbar.severity === "success" ? "#22c55e" : "#ef4444",
            },
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
