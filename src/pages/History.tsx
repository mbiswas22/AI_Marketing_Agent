import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Paper,
  CircularProgress,
  Chip,
  Collapse,
  IconButton,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LogoutIcon from "@mui/icons-material/Logout";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CampaignIcon from "@mui/icons-material/Campaign";
import ArticleIcon from "@mui/icons-material/Article";
import ImageIcon from "@mui/icons-material/Image";
import EmailIcon from "@mui/icons-material/Email";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import TextSnippetIcon from "@mui/icons-material/TextSnippet";
import FacebookIcon from "@mui/icons-material/Facebook";
import InstagramIcon from "@mui/icons-material/Instagram";
import YouTubeIcon from "@mui/icons-material/YouTube";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import { getHistory } from "../services/api";
import type { HistoryItem } from "../services/api";

const CONTENT_TYPE_ICONS: Record<string, ReactElement> = {
  flyer: <CampaignIcon sx={{ fontSize: 14 }} />,
  blog: <ArticleIcon sx={{ fontSize: 14 }} />,
  image: <ImageIcon sx={{ fontSize: 14 }} />,
  email: <EmailIcon sx={{ fontSize: 14 }} />,
  video: <VideoLibraryIcon sx={{ fontSize: 14 }} />,
};

const PLATFORM_INFO: Record<string, { icon: ReactElement; color: string; label: string }> = {
  facebook: { icon: <FacebookIcon sx={{ fontSize: 14 }} />, color: "#1877f2", label: "Facebook" },
  instagram: { icon: <InstagramIcon sx={{ fontSize: 14 }} />, color: "#e1306c", label: "Instagram" },
  youtube: { icon: <YouTubeIcon sx={{ fontSize: 14 }} />, color: "#ff0000", label: "YouTube" },
  linkedin: { icon: <LinkedInIcon sx={{ fontSize: 14 }} />, color: "#0a66c2", label: "LinkedIn" },
};

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const truncate = (text: string, max = 40) =>
  text.length > max ? `${text.slice(0, max).trimEnd()}...` : text;

const colHeadSx = {
  color: "#475569",
  fontWeight: 600,
  fontSize: 12,
  textTransform: "uppercase" as const,
  letterSpacing: 0.8,
};

const detailLabelSx = {
  color: "#64748b",
  fontWeight: 700,
  fontSize: 11,
  textTransform: "uppercase" as const,
  letterSpacing: 0.8,
  mb: 0.75,
};

function HistoryRow({ item }: { item: HistoryItem }) {
  const [expanded, setExpanded] = useState(false);
  const isPublished = item.status === "published";
  const contentIcon =
    CONTENT_TYPE_ICONS[(item.content_type ?? "").toLowerCase()] ?? (
      <TextSnippetIcon sx={{ fontSize: 14 }} />
    );

  return (
    <Paper
      elevation={0}
      sx={{
        bgcolor: "#161616",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 2.5,
        mb: 1.25,
        overflow: "hidden",
        transition: "border-color 0.2s, box-shadow 0.2s",
        "&:hover": {
          borderColor: "rgba(139,92,246,0.35)",
          boxShadow: "0 0 0 1px rgba(139,92,246,0.12)",
        },
      }}
    >
      <Box
        onClick={() => setExpanded((v) => !v)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: { xs: 1.5, sm: 2 },
          px: { xs: 2, sm: 2.5 },
          py: 1.5,
          cursor: "pointer",
        }}
      >
        <Typography sx={{ color: "#64748b", fontSize: 13, width: 92, flexShrink: 0 }}>
          {formatDate(item.created_at)}
        </Typography>
        <Typography
          sx={{
            color: "#e2e8f0",
            fontSize: 14,
            fontWeight: 600,
            width: 140,
            flexShrink: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: { xs: "none", sm: "block" },
          }}
        >
          {item.business || "—"}
        </Typography>
        <Chip
          size="small"
          icon={contentIcon}
          label={item.content_type || "—"}
          sx={{
            bgcolor: "rgba(139,92,246,0.12)",
            color: "#a78bfa",
            border: "1px solid rgba(139,92,246,0.3)",
            fontSize: 12,
            fontWeight: 600,
            textTransform: "capitalize",
            flexShrink: 0,
            "& .MuiChip-icon": { color: "#a78bfa" },
          }}
        />
        <Typography
          sx={{
            color: "#94a3b8",
            fontSize: 13.5,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: { xs: "none", md: "block" },
          }}
        >
          {truncate(item.input_value, 40)}
        </Typography>
        <Chip
          size="small"
          label={isPublished ? "Published" : "Draft"}
          sx={{
            bgcolor: isPublished ? "rgba(34,197,94,0.12)" : "rgba(100,116,139,0.15)",
            color: isPublished ? "#22c55e" : "#94a3b8",
            border: `1px solid ${isPublished ? "rgba(34,197,94,0.3)" : "rgba(100,116,139,0.3)"}`,
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
          }}
        />
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          sx={{
            color: "#64748b",
            ml: { xs: 0, sm: 0.5 },
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            "&:hover": { color: "#a78bfa", bgcolor: "rgba(139,92,246,0.08)" },
          }}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      </Box>

      <Collapse in={expanded} timeout={180}>
        <Box
          sx={{
            px: { xs: 2, sm: 2.5 },
            pb: 2.5,
            pt: 2,
            bgcolor: "rgba(0,0,0,0.18)",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1.3fr 1fr" },
            gap: 3,
          }}
        >
          <Box>
            <Typography sx={detailLabelSx}>Prompt</Typography>
            <Typography sx={{ color: "#cbd5e1", fontSize: 13.5, lineHeight: 1.6, mb: 2 }}>
              {item.input_value}
            </Typography>
            <Typography sx={detailLabelSx}>Generated Caption</Typography>
            <Typography sx={{ color: "#cbd5e1", fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {item.caption || "—"}
            </Typography>
          </Box>
          <Box>
            <Typography sx={detailLabelSx}>Hashtags</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 2 }}>
              {item.hashtags?.length ? (
                item.hashtags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    sx={{
                      bgcolor: "rgba(139,92,246,0.12)",
                      color: "#a78bfa",
                      border: "1px solid rgba(139,92,246,0.25)",
                      fontSize: 11.5,
                    }}
                  />
                ))
              ) : (
                <Typography sx={{ color: "#475569", fontSize: 13 }}>None</Typography>
              )}
            </Box>
            <Typography sx={detailLabelSx}>Platforms</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {item.platforms?.length ? (
                item.platforms.map((p) => {
                  const info = PLATFORM_INFO[p.toLowerCase()];
                  return (
                    <Chip
                      key={p}
                      icon={info?.icon}
                      label={info?.label ?? p}
                      size="small"
                      sx={{
                        bgcolor: info ? `${info.color}22` : "rgba(100,116,139,0.15)",
                        color: info?.color ?? "#94a3b8",
                        border: `1px solid ${info ? `${info.color}55` : "rgba(100,116,139,0.3)"}`,
                        fontSize: 12,
                        "& .MuiChip-icon": { color: info?.color ?? "#94a3b8" },
                      }}
                    />
                  );
                })
              ) : (
                <Typography sx={{ color: "#475569", fontSize: 13 }}>Not shared</Typography>
              )}
            </Box>
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
}

export default function History() {
  const { user, signOut } = useAuthenticator();
  const navigate = useNavigate();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = () => { signOut(); navigate("/login"); };

  useEffect(() => {
    getHistory()
      .then((items) =>
        setHistory(
          [...items].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
        )
      )
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
      <Box sx={{ maxWidth: 1100, mx: "auto", px: { xs: 2, sm: 3 }, py: 6 }}>
        <Typography variant="h4" sx={{ color: "#fff", fontWeight: 800, mb: 0.5 }}>
          History
        </Typography>
        <Typography sx={{ color: "#475569", mb: 5, fontSize: 15 }}>
          Your past AI-generated marketing content. Click a row to see full details.
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
          <Box>
            {history.length > 0 && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: { xs: 1.5, sm: 2 },
                  px: { xs: 2, sm: 2.5 },
                  pb: 1.25,
                }}
              >
                <Typography sx={{ ...colHeadSx, width: 92, flexShrink: 0 }}>Date</Typography>
                <Typography
                  sx={{ ...colHeadSx, width: 140, flexShrink: 0, display: { xs: "none", sm: "block" } }}
                >
                  Business
                </Typography>
                <Typography sx={{ ...colHeadSx, width: 110, flexShrink: 0 }}>Type</Typography>
                <Typography sx={{ ...colHeadSx, flex: 1, display: { xs: "none", md: "block" } }}>
                  Prompt
                </Typography>
                <Typography sx={{ ...colHeadSx, width: 90, flexShrink: 0 }}>Status</Typography>
                <Box sx={{ width: 32, flexShrink: 0 }} />
              </Box>
            )}

            {history.map((item) => (
              <HistoryRow key={item.action_id} item={item} />
            ))}

            {history.length === 0 && (
              <Paper
                elevation={0}
                sx={{
                  bgcolor: "#161616",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 3,
                  textAlign: "center",
                  color: "#475569",
                  py: 6,
                }}
              >
                No history yet.
              </Paper>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
