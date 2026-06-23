import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useNavigate } from "react-router-dom";
import {
  Box, Typography, Button, Paper,
  CircularProgress, Chip, Collapse, IconButton,
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
import "../styles/history.css";

const CONTENT_TYPE_ICONS: Record<string, ReactElement> = {
  flyer: <CampaignIcon sx={{ fontSize: 14 }} />,
  blog: <ArticleIcon sx={{ fontSize: 14 }} />,
  image: <ImageIcon sx={{ fontSize: 14 }} />,
  email: <EmailIcon sx={{ fontSize: 14 }} />,
  video: <VideoLibraryIcon sx={{ fontSize: 14 }} />,
};

const PLATFORM_INFO: Record<string, { icon: ReactElement; color: string; label: string }> = {
  facebook:  { icon: <FacebookIcon sx={{ fontSize: 14 }} />,  color: "#1877f2", label: "Facebook" },
  instagram: { icon: <InstagramIcon sx={{ fontSize: 14 }} />, color: "#e1306c", label: "Instagram" },
  youtube:   { icon: <YouTubeIcon sx={{ fontSize: 14 }} />,   color: "#ff0000", label: "YouTube" },
  linkedin:  { icon: <LinkedInIcon sx={{ fontSize: 14 }} />,  color: "#0a66c2", label: "LinkedIn" },
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  marketing: "Marketing", flyer: "Flyer", blog: "Blog", email: "Email",
  video_script: "Video Script", product_description: "Product Desc.",
  social_caption: "Social Caption", image: "Image",
  merchandise: "Merchandise", whatsapp_sms: "WhatsApp/SMS",
};

const getContentTypeLabel = (ct: string | undefined) => {
  if (!ct) return "—";
  const key = ct.toLowerCase();
  return CONTENT_TYPE_LABELS[key] ?? (ct.charAt(0).toUpperCase() + ct.slice(1));
};

const getDisplayPrompt = (item: HistoryItem): string => {
  const trunc = (s: string) => (s.length > 120 ? `${s.slice(0, 120)}...` : s);
  if (item.prompt) {
    if (!item.prompt.startsWith("Business:")) return trunc(item.prompt);
    const lastDot = item.prompt.lastIndexOf(". ");
    return trunc(lastDot !== -1 ? item.prompt.slice(lastDot + 2) : item.prompt);
  }
  if (item.input_value) {
    const v = item.input_value;
    if (!v.includes("/") && !v.endsWith(".png") && !v.endsWith(".jpg")) return trunc(v);
    return "Image upload";
  }
  return "—";
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const truncate = (text: string | undefined, max = 40) =>
  !text ? "—" : text.length > max ? `${text.slice(0, max).trimEnd()}...` : text;

function HistoryRow({ item }: { item: HistoryItem }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const statusConfig =
    item.status === "generated" || item.status === "published"
      ? { label: item.status === "generated" ? "Generated" : "Published", bgcolor: "#0f3d2a", color: "#4caf7d", border: "#1a5c3a" }
      : item.status === "draft"
      ? { label: "Draft", bgcolor: "#1a1a1a", color: "#888", border: "#333" }
      : null;

  const contentIcon =
    CONTENT_TYPE_ICONS[(item.content_type ?? "").toLowerCase()] ?? <TextSnippetIcon sx={{ fontSize: 14 }} />;

  return (
    <Paper
      elevation={0}
      sx={{
        bgcolor: "#161616", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 2.5, mb: 1.25, overflow: "hidden",
        transition: "border-color 0.2s, box-shadow 0.2s",
        "&:hover": { borderColor: "rgba(139,92,246,0.35)", boxShadow: "0 0 0 1px rgba(139,92,246,0.12)" },
      }}
    >
      <Box
        onClick={() => setExpanded((v) => !v)}
        sx={{ display: "flex", alignItems: "center", gap: 2, px: 2.5, py: 1.5, cursor: "pointer" }}
      >
        <Typography sx={{ color: "#64748b", fontSize: 13, width: 92, flexShrink: 0 }}>
          {formatDate(item.created_at)}
        </Typography>
        <Typography sx={{
          color: "#e2e8f0", fontSize: 14, fontWeight: 600,
          width: 140, flexShrink: 0, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap",
          display: { xs: "none", sm: "block" },
        }}>
          {item.business || "—"}
        </Typography>
        {item.content_type ? (
          <Chip
            size="small" icon={contentIcon} label={getContentTypeLabel(item.content_type)}
            sx={{
              bgcolor: "rgba(139,92,246,0.12)", color: "#a78bfa",
              border: "1px solid rgba(139,92,246,0.3)", fontSize: 12, fontWeight: 600,
              textTransform: "capitalize", flexShrink: 0,
              "& .MuiChip-icon": { color: "#a78bfa" },
            }}
          />
        ) : (
          <Typography sx={{ color: "#475569", fontSize: 12, width: 110, flexShrink: 0 }}>—</Typography>
        )}
        <Typography sx={{
          color: "#94a3b8", fontSize: 13.5, flex: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          display: { xs: "none", md: "block" },
        }}>
          {truncate(item.input_value, 40)}
        </Typography>
        {statusConfig && (
          <Chip
            size="small" label={statusConfig.label}
            sx={{
              background: statusConfig.bgcolor, color: statusConfig.color,
              border: `1px solid ${statusConfig.border}`, fontSize: 12, fontWeight: 600, flexShrink: 0,
            }}
          />
        )}
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          sx={{
            color: "#64748b", ml: 0.5,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            "&:hover": { color: "#a78bfa", bgcolor: "rgba(139,92,246,0.08)" },
          }}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      </Box>

      <Collapse in={expanded} timeout={180}>
        <Box sx={{
          px: 2.5, pb: 2.5, pt: 2,
          bgcolor: "rgba(0,0,0,0.18)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}>
          <Box sx={{
            display: "grid",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            gridTemplateColumns: { xs: "1fr", md: (item.image_url || (item as any).image_key || (item as any).s3_key) ? "1.3fr 1fr auto" : "1.3fr 1fr" },
            gap: 3, mb: 2,
          }}>
            <Box>
              <span className="detail-label">Prompt</span>
              <Typography sx={{ color: "#cbd5e1", fontSize: 13.5, lineHeight: 1.6, mb: 2 }}>
                {getDisplayPrompt(item)}
              </Typography>
              <span className="detail-label">Generated Caption</span>
              <Typography sx={{ color: "#cbd5e1", fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {item.caption || "—"}
              </Typography>
            </Box>

            <Box>
              <span className="detail-label">Hashtags</span>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 2 }}>
                {item.hashtags?.length ? (
                  item.hashtags.map((tag) => (
                    <Chip key={tag} label={tag} size="small" sx={{
                      bgcolor: "rgba(139,92,246,0.12)", color: "#a78bfa",
                      border: "1px solid rgba(139,92,246,0.25)", fontSize: 11.5,
                    }} />
                  ))
                ) : (
                  <Typography sx={{ color: "#475569", fontSize: 13 }}>None</Typography>
                )}
              </Box>
              <span className="detail-label">Platforms</span>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {item.platforms?.length ? (
                  item.platforms.map((p) => {
                    const info = PLATFORM_INFO[p.toLowerCase()];
                    return (
                      <Chip key={p} icon={info?.icon} label={info?.label ?? p} size="small" sx={{
                        bgcolor: info ? `${info.color}22` : "rgba(100,116,139,0.15)",
                        color: info?.color ?? "#94a3b8",
                        border: `1px solid ${info ? `${info.color}55` : "rgba(100,116,139,0.3)"}`,
                        fontSize: 12, "& .MuiChip-icon": { color: info?.color ?? "#94a3b8" },
                      }} />
                    );
                  })
                ) : (
                  <Typography sx={{ color: "#475569", fontSize: 13 }}>Not shared</Typography>
                )}
              </Box>
            </Box>

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(item.image_url || (item as any).image_key || (item as any).s3_key) && (
              <Box>
                <span className="detail-label">Generated Image</span>
                {item.image_url ? (
                  <Box component="img" src={item.image_url} alt="Generated"
                    sx={{ maxHeight: 180, maxWidth: 260, objectFit: "contain", borderRadius: "6px", display: "block" }} />
                ) : (
                  <Typography sx={{ color: "#64748b", fontSize: 12, fontStyle: "italic" }}>Image stored in S3</Typography>
                )}
              </Box>
            )}
          </Box>

          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="use-again-btn"
              onClick={() => navigate("/dashboard", {
                state: {
                  fromHistory: {
                    business: item.business, input_value: item.input_value,
                    prompt: item.prompt, content_type: item.content_type,
                    platforms: item.platforms, image_url: item.image_url,
                    caption: item.caption, hashtags: item.hashtags,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    title: (item as any).title, offer: (item as any).offer,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    call_to_action: (item as any).call_to_action,
                  },
                },
              })}
            >
              ↩ Use Again
            </button>
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
        setHistory([...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
      )
      .catch(() => setError("Failed to load history."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="history-page">
      <nav className="history-navbar">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AutoAwesomeIcon sx={{ color: "#8b5cf6" }} />
          <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>MarketingAI</Typography>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Button onClick={() => navigate("/dashboard")} startIcon={<DashboardIcon />}
            sx={{ color: "#64748b", textTransform: "none", fontSize: 14, "&:hover": { color: "#fff" } }}>
            Dashboard
          </Button>
          <Typography sx={{ color: "#475569", fontSize: 13 }}>{user?.username}</Typography>
          <Button onClick={handleSignOut} startIcon={<LogoutIcon />} size="small" variant="outlined"
            sx={{
              color: "#8b5cf6", borderColor: "#8b5cf6", textTransform: "none", fontSize: 13,
              "&:hover": { borderColor: "#a78bfa", color: "#a78bfa", bgcolor: "rgba(139,92,246,0.08)" },
            }}>
            Sign Out
          </Button>
        </div>
      </nav>

      <div className="history-content">
        <Typography variant="h4" sx={{ color: "#fff", fontWeight: 800, mb: 0.5 }}>History</Typography>
        <Typography sx={{ color: "#475569", mb: 5, fontSize: 15 }}>
          Your past AI-generated marketing content. Click a row to see full details.
        </Typography>

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress sx={{ color: "#8b5cf6" }} />
          </Box>
        )}

        {error && <Typography sx={{ color: "#ef4444", fontSize: 14 }}>{error}</Typography>}

        {!loading && !error && (
          <Box>
            {history.length > 0 && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 2.5, pb: 1.25 }}>
                <span className="col-head" style={{ width: 92, flexShrink: 0 }}>Date</span>
                <span className="col-head" style={{ width: 140, flexShrink: 0 }}>Business</span>
                <span className="col-head" style={{ width: 110, flexShrink: 0 }}>Type</span>
                <span className="col-head" style={{ flex: 1 }}>Prompt</span>
                <span className="col-head" style={{ width: 90, flexShrink: 0 }}>Status</span>
                <Box sx={{ width: 32, flexShrink: 0 }} />
              </Box>
            )}

            {history.map((item) => <HistoryRow key={item.action_id} item={item} />)}

            {history.length === 0 && (
              <Paper elevation={0} sx={{
                bgcolor: "#161616", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 3, textAlign: "center", color: "#475569", py: 6,
              }}>
                No history yet.
              </Paper>
            )}
          </Box>
        )}
      </div>
    </div>
  );
}
