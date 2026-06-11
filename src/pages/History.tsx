import React from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LogoutIcon from "@mui/icons-material/Logout";
import DashboardIcon from "@mui/icons-material/Dashboard";

const DUMMY_HISTORY = [
  { id: 1, date: "2026-06-10", prompt: "Summer sneaker Facebook ad targeting 18–30 year olds", status: "Completed", color: "#7c3aed" },
  { id: 2, date: "2026-06-09", prompt: "Email campaign for new product launch with discount code", status: "Completed", color: "#0ea5e9" },
  { id: 3, date: "2026-06-08", prompt: "Instagram story for 24-hour flash sale", status: "Completed", color: "#ec4899" },
  { id: 4, date: "2026-06-07", prompt: "Google Ads copy for SaaS productivity tool", status: "Failed",    color: "#374151" },
  { id: 5, date: "2026-06-06", prompt: "LinkedIn post announcing product update v2.4", status: "Completed", color: "#10b981" },
];

export default function History() {
  const { user, signOut } = useAuthenticator();
  const navigate = useNavigate();

  const handleSignOut = () => { signOut(); navigate("/login"); };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#0f0f0f" }}>
      {/* Navbar */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: { xs: 2, sm: 4 },
          py: 2,
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          bgcolor: "#111",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AutoAwesomeIcon sx={{ color: "#8b5cf6" }} />
          <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>
            MarketingAI
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Button
            onClick={() => navigate("/dashboard")}
            startIcon={<DashboardIcon />}
            sx={{ color: "#64748b", textTransform: "none", fontSize: 14, "&:hover": { color: "#fff" } }}
          >
            Dashboard
          </Button>
          <Typography sx={{ color: "#475569", fontSize: 13 }}>{user?.username}</Typography>
          <Button
            onClick={handleSignOut}
            startIcon={<LogoutIcon />}
            size="small"
            variant="outlined"
            sx={{
              color: "#8b5cf6",
              borderColor: "#8b5cf6",
              textTransform: "none",
              fontSize: 13,
              "&:hover": { borderColor: "#a78bfa", color: "#a78bfa", bgcolor: "rgba(139,92,246,0.08)" },
            }}
          >
            Sign Out
          </Button>
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ maxWidth: 900, mx: "auto", px: { xs: 2, sm: 3 }, py: 6 }}>
        <Typography variant="h4" sx={{ color: "#fff", fontWeight: 800, mb: 0.5 }}>
          History
        </Typography>
        <Typography sx={{ color: "#475569", mb: 5, fontSize: 15 }}>
          Your past AI-generated marketing content.
        </Typography>

        <TableContainer
          component={Paper}
          elevation={0}
          sx={{
            bgcolor: "#161616",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <Table>
            <TableHead>
              <TableRow>
                {["Preview", "Date", "Prompt", "Status"].map((h) => (
                  <TableCell
                    key={h}
                    sx={{
                      color: "#475569",
                      borderColor: "rgba(255,255,255,0.06)",
                      fontWeight: 600,
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                      bgcolor: "#111",
                    }}
                  >
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {DUMMY_HISTORY.map((row) => (
                <TableRow
                  key={row.id}
                  sx={{
                    "&:hover": { bgcolor: "rgba(255,255,255,0.025)" },
                    "& td": { borderColor: "rgba(255,255,255,0.05)" },
                  }}
                >
                  <TableCell>
                    <Box
                      sx={{
                        width: 56,
                        height: 38,
                        borderRadius: 1.5,
                        bgcolor: row.color,
                        opacity: 0.85,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <AutoAwesomeIcon sx={{ color: "#fff", fontSize: 16 }} />
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: "#475569", fontSize: 13, whiteSpace: "nowrap" }}>
                    {row.date}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 420 }}>
                    <Typography noWrap sx={{ color: "#cbd5e1", fontSize: 14 }}>
                      {row.prompt}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={row.status}
                      size="small"
                      sx={{
                        bgcolor:
                          row.status === "Completed"
                            ? "rgba(34,197,94,0.12)"
                            : "rgba(239,68,68,0.12)",
                        color: row.status === "Completed" ? "#22c55e" : "#ef4444",
                        border: `1px solid ${row.status === "Completed" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}