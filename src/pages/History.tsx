import { useEffect, useState } from "react";
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
  CircularProgress,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LogoutIcon from "@mui/icons-material/Logout";
import DashboardIcon from "@mui/icons-material/Dashboard";
import { getHistory } from "../services/api";
import type { HistoryItem } from "../services/api";

export default function History() {
  const { user, signOut } = useAuthenticator();
  const navigate = useNavigate();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = () => { signOut(); navigate("/login"); };

  useEffect(() => {
    getHistory()
      .then(setHistory)
      .catch(() => setError("Failed to load history."))
      .finally(() => setLoading(false));
  }, []);

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

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress sx={{ color: "#8b5cf6" }} />
          </Box>
        )}

        {error && (
          <Typography sx={{ color: "#ef4444", fontSize: 14 }}>{error}</Typography>
        )}

        {!loading && !error && (
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
                  {["Preview", "Date", "Prompt", "Caption"].map((h) => (
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
                {history.map((item) => (
                  <TableRow
                    key={item.action_id}
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
                          bgcolor: "#7c3aed",
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
                      {new Date(item.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography noWrap sx={{ color: "#cbd5e1", fontSize: 14 }}>
                        {item.input_value}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <Typography noWrap sx={{ color: "#94a3b8", fontSize: 13 }}>
                        {item.caption}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
                {history.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ textAlign: "center", color: "#475569", py: 6 }}>
                      No history yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
}