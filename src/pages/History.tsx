import React, { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useNavigate } from "react-router-dom";
import {
  Box, Typography, Button, Paper,
  CircularProgress, Chip, Collapse, IconButton,
  Tooltip, Snackbar, Alert, Dialog, DialogContent,
  DialogActions, TextField, Divider,
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
import ScheduleIcon from "@mui/icons-material/Schedule";
import EditCalendarIcon from "@mui/icons-material/EditCalendar";
import { getHistory, getSocialConnections, publishToLinkedIn, getMetaPages, publishToFacebook, getInstagramStatus, publishToInstagram, createSchedule, updateSchedule, getBusinesses } from "../services/api";
import type { HistoryItem, Business } from "../services/api";
import { getUserAttributes } from "../services/auth";
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

function HistoryRow({
  item,
  linkedinConnected,
  facebookConnected,
  instagramConnected,
  onPublishResult,
  userId,
}: {
  item: HistoryItem;
  linkedinConnected: boolean;
  facebookConnected: boolean;
  instagramConnected: boolean;
  onPublishResult: (success: boolean, msg: string) => void;
  userId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishingFacebook, setPublishingFacebook] = useState(false);
  const [publishingInstagram, setPublishingInstagram] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleBusinessId, setScheduleBusinessId] = useState("");
  const [schedulePlatform, setSchedulePlatform] = useState("linkedin");
  const [scheduling, setScheduling] = useState(false);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editAt, setEditAt] = useState("");
  const [editPlatform, setEditPlatform] = useState("linkedin");
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();
  const [localStatus, setLocalStatus] = useState<string | undefined>(item.status);

  const handleLinkedInPublish = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = item.caption || getDisplayPrompt(item);
    const image_key = item.image_key || item.s3_key;
    setPublishing(true);
    try {
      await publishToLinkedIn({ text: text || undefined, image_key: image_key || undefined });
      onPublishResult(true, "Posted to LinkedIn successfully");
    } catch (err) {
      const msg = (err as any)?.response?.data?.error || "Failed to post to LinkedIn";
      onPublishResult(false, msg);
    } finally {
      setPublishing(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduleAt || !scheduleBusinessId.trim()) return;
    setScheduling(true);
    try {
      const result = await createSchedule({
        user_id: userId,
        businessId: scheduleBusinessId.trim(),
        platform: schedulePlatform,
        content_type: item.content_type || "social_caption",
        schedule_expression: `at(${new Date(scheduleAt).toISOString().slice(0, 19)})`,
        input_type: "text",
        input_value: item.prompt || item.input_value || item.caption || "marketing post",
        business: item.business || "My Business",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        createdByUserId: userId,
      });
      setScheduleId(result.schedule_id);
      setScheduleOpen(false);
      setLocalStatus("scheduled");
      onPublishResult(true, `Scheduled for ${new Date(scheduleAt).toLocaleString()}`);
    } catch (err) {
      onPublishResult(false, (err as Error).message || "Failed to schedule post.");
    } finally {
      setScheduling(false);
    }
  };

  const handleEdit = async () => {
    if (!editAt || !scheduleId) return;
    setEditing(true);
    try {
      await updateSchedule({
        schedule_id: scheduleId,
        schedule_expression: `at(${new Date(editAt).toISOString().slice(0, 19)})`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setEditOpen(false);
      onPublishResult(true, `Schedule updated to ${new Date(editAt).toLocaleString()}`);
    } catch (err) {
      onPublishResult(false, (err as Error).message || "Failed to update schedule.");
    } finally {
      setEditing(false);
    }
  };

  const handleFacebookPublish = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = item.caption || getDisplayPrompt(item);
    const image_key = item.image_key || item.s3_key;
    setPublishingFacebook(true);
    try {
      await publishToFacebook({ text: text || undefined, image_key: image_key || undefined });
      onPublishResult(true, "Posted to Facebook successfully");
    } catch (err) {
      const msg = (err as any)?.response?.data?.error || "Failed to post to Facebook";
      onPublishResult(false, msg);
    } finally {
      setPublishingFacebook(false);
    }
  };

  const handleInstagramPublish = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = item.caption || getDisplayPrompt(item);
    const image_key = item.image_key || item.s3_key;
    if (!image_key) {
      onPublishResult(false, "Instagram requires an image");
      return;
    }
    setPublishingInstagram(true);
    try {
      const result = await publishToInstagram({ text: text || undefined, image_key });
      if (result.processing) {
        onPublishResult(false, result.error || "Instagram is still processing — try again shortly");
      } else {
        onPublishResult(true, "Posted to Instagram successfully");
      }
    } catch (err) {
      const msg = (err as any)?.response?.data?.error || "Failed to post to Instagram";
      onPublishResult(false, msg);
    } finally {
      setPublishingInstagram(false);
    }
  };

  const statusConfig =
    localStatus === "generated" || localStatus === "published"
      ? { label: localStatus === "generated" ? "Generated" : "Published", bgcolor: "#0f3d2a", color: "#4caf7d", border: "#1a5c3a" }
      : localStatus === "scheduled"
      ? { label: "Scheduled", bgcolor: "#1a1530", color: "#a78bfa", border: "#4c3a8a" }
      : localStatus === "publish_failed"
      ? { label: "Failed", bgcolor: "#1a0808", color: "#ef4444", border: "#5c1a1a" }
      : localStatus === "draft"
      ? { label: "Draft", bgcolor: "#1a1a1a", color: "#888", border: "#333" }
      : null;

  const contentIcon =
    CONTENT_TYPE_ICONS[(item.content_type ?? "").toLowerCase()] ?? <TextSnippetIcon sx={{ fontSize: 14 }} />;

  return (
    <>
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

          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Tooltip
                title={linkedinConnected ? "Post to LinkedIn" : "Connect LinkedIn in Account Settings"}
                placement="top"
              >
                <span>
                  <IconButton
                    size="small"
                    onClick={handleLinkedInPublish}
                    disabled={!linkedinConnected || publishing}
                    sx={{
                      color: linkedinConnected ? "#0077b5" : "#334455",
                      p: "6px",
                      "&:hover": { bgcolor: "rgba(0,119,181,0.12)" },
                      "&.Mui-disabled": { color: "#2a3a4a" },
                    }}
                  >
                    {publishing
                      ? <CircularProgress size={16} sx={{ color: "#0077b5" }} />
                      : <LinkedInIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Schedule post" placement="top">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); setScheduleOpen(true); }}
                  sx={{ color: "#a78bfa", p: "6px", "&:hover": { bgcolor: "rgba(139,92,246,0.1)" } }}
                >
                  <ScheduleIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              {localStatus === "scheduled" && scheduleId && (
                <Tooltip title="Edit schedule" placement="top">
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); setEditAt(""); setEditPlatform(schedulePlatform); setEditOpen(true); }}
                    sx={{ color: "#34d399", p: "6px", "&:hover": { bgcolor: "rgba(52,211,153,0.1)" } }}
                  >
                    <EditCalendarIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip
                title={facebookConnected ? "Post to Facebook" : "Connect Facebook in Account Settings"}
                placement="top"
              >
                <span>
                  <IconButton
                    size="small"
                    onClick={handleFacebookPublish}
                    disabled={!facebookConnected || publishingFacebook}
                    sx={{
                      color: facebookConnected ? "#1877f2" : "#334455",
                      p: "6px",
                      "&:hover": { bgcolor: "rgba(24,119,242,0.12)" },
                      "&.Mui-disabled": { color: "#2a3a4a" },
                    }}
                  >
                    {publishingFacebook
                      ? <CircularProgress size={16} sx={{ color: "#1877f2" }} />
                      : <FacebookIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip
                title={instagramConnected ? "Post to Instagram" : "Connect Facebook (with linked Instagram) in Account Settings"}
                placement="top"
              >
                <span>
                  <IconButton
                    size="small"
                    onClick={handleInstagramPublish}
                    disabled={!instagramConnected || publishingInstagram}
                    sx={{
                      color: instagramConnected ? "#e1306c" : "#334455",
                      p: "6px",
                      "&:hover": { bgcolor: "rgba(225,48,108,0.12)" },
                      "&.Mui-disabled": { color: "#2a3a4a" },
                    }}
                  >
                    {publishingInstagram
                      ? <CircularProgress size={16} sx={{ color: "#e1306c" }} />
                      : <InstagramIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
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

    <Dialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} fullWidth maxWidth="xs"
      PaperProps={{ sx: { bgcolor: "#1a1a24", border: "1px solid #32324a", borderRadius: "16px", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" } }}>
      <Box sx={{ px: 3, pt: 3, pb: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
        <ScheduleIcon sx={{ color: "#a78bfa", fontSize: 22 }} />
        <Box>
          <Typography sx={{ color: "#e0dcf8", fontWeight: 700, fontSize: 16 }}>Schedule Post</Typography>
          <Typography sx={{ color: "#64748b", fontSize: 12, mt: 0.3 }}>Choose when to publish this content</Typography>
        </Box>
      </Box>
      <Divider sx={{ borderColor: "#2e2e42" }} />
      <DialogContent sx={{ px: 3, pt: "20px !important", pb: 2 }}>
        <Typography sx={{ color: "#a78bfa", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Business ID</Typography>
        <TextField
          fullWidth
          placeholder="e.g. BIZ-ABC123"
          value={scheduleBusinessId}
          onChange={(e) => setScheduleBusinessId(e.target.value)}
          sx={{
            mb: 2.5,
            "& .MuiOutlinedInput-root": {
              color: "#e0dcf8", bgcolor: "#0d0d0f", borderRadius: "10px",
              "& fieldset": { borderColor: "#383850" },
              "&:hover fieldset": { borderColor: "#7c6df0" },
              "&.Mui-focused fieldset": { borderColor: "#7c6df0" },
            },
            "& .MuiInputBase-input::placeholder": { color: "#555", opacity: 1 },
          }}
        />
        <Typography sx={{ color: "#a78bfa", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Schedule Date & Time</Typography>
        <TextField
          type="datetime-local"
          fullWidth
          value={scheduleAt}
          onChange={(e) => setScheduleAt(e.target.value)}
          inputProps={{ min: new Date().toISOString().slice(0, 16) }}
          sx={{
            mb: 2.5,
            "& .MuiOutlinedInput-root": {
              color: "#e0dcf8", bgcolor: "#0d0d0f", borderRadius: "10px",
              "& fieldset": { borderColor: "#383850" },
              "&:hover fieldset": { borderColor: "#7c6df0" },
              "&.Mui-focused fieldset": { borderColor: "#7c6df0" },
            },
            "& ::-webkit-calendar-picker-indicator": { filter: "invert(1)" },
          }}
        />
        <Typography sx={{ color: "#a78bfa", fontSize: 13, fontWeight: 600, mb: 1 }}>Platform</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {Object.entries(PLATFORM_INFO).map(([key, info]) => (
            <Button key={key} onClick={() => setSchedulePlatform(key)}
              startIcon={info.icon}
              variant={schedulePlatform === key ? "contained" : "outlined"}
              size="small"
              sx={{
                textTransform: "none", fontSize: 12, borderRadius: "8px",
                borderColor: schedulePlatform === key ? info.color : "rgba(255,255,255,0.12)",
                color: schedulePlatform === key ? "#fff" : "#64748b",
                bgcolor: schedulePlatform === key ? info.color : "transparent",
                "&:hover": { bgcolor: info.color, color: "#fff", borderColor: info.color },
              }}
            >
              {info.label}
            </Button>
          ))}
        </Box>
      </DialogContent>
      <Divider sx={{ borderColor: "#2e2e42" }} />
      <DialogActions sx={{ px: 3, py: 2, gap: 1.5 }}>
        <Button onClick={() => setScheduleOpen(false)}
          sx={{ color: "#7070a0", textTransform: "none", border: "1px solid #44445a", borderRadius: "10px", px: 2.5,
            "&:hover": { bgcolor: "rgba(255,255,255,0.06)" } }}>
          Cancel
        </Button>
        <Button onClick={handleSchedule}
          disabled={scheduling || !scheduleAt || !scheduleBusinessId.trim()}
          variant="contained"
          sx={{ bgcolor: "#7c3aed", textTransform: "none", fontWeight: 600, borderRadius: "10px", px: 3, flexGrow: 1,
            "&:hover": { bgcolor: "#6d28d9" }, "&.Mui-disabled": { bgcolor: "#3d2d60", color: "#7c5cbf" } }}>
          {scheduling ? <CircularProgress size={16} sx={{ color: "#a89cf0" }} /> : "Schedule"}
        </Button>
      </DialogActions>
    </Dialog>

    <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="xs"
      PaperProps={{ sx: { bgcolor: "#1a1a24", border: "1px solid #32324a", borderRadius: "16px", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" } }}>
      <Box sx={{ px: 3, pt: 3, pb: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
        <EditCalendarIcon sx={{ color: "#34d399", fontSize: 22 }} />
        <Box>
          <Typography sx={{ color: "#e0dcf8", fontWeight: 700, fontSize: 16 }}>Edit Schedule</Typography>
          <Typography sx={{ color: "#64748b", fontSize: 12, mt: 0.3 }}>Update the scheduled publish time</Typography>
        </Box>
      </Box>
      <Divider sx={{ borderColor: "#2e2e42" }} />
      <DialogContent sx={{ px: 3, pt: "20px !important", pb: 2 }}>
        <Typography sx={{ color: "#34d399", fontSize: 13, fontWeight: 600, mb: 0.8 }}>New Date & Time</Typography>
        <TextField
          type="datetime-local"
          fullWidth
          value={editAt}
          onChange={(e) => setEditAt(e.target.value)}
          inputProps={{ min: new Date().toISOString().slice(0, 16) }}
          sx={{
            mb: 2.5,
            "& .MuiOutlinedInput-root": {
              color: "#e0dcf8", bgcolor: "#0d0d0f", borderRadius: "10px",
              "& fieldset": { borderColor: "#383850" },
              "&:hover fieldset": { borderColor: "#34d399" },
              "&.Mui-focused fieldset": { borderColor: "#34d399" },
            },
            "& ::-webkit-calendar-picker-indicator": { filter: "invert(1)" },
          }}
        />
        <Typography sx={{ color: "#34d399", fontSize: 13, fontWeight: 600, mb: 1 }}>Platform</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {Object.entries(PLATFORM_INFO).map(([key, info]) => (
            <Button key={key} onClick={() => setEditPlatform(key)}
              startIcon={info.icon}
              variant={editPlatform === key ? "contained" : "outlined"}
              size="small"
              sx={{
                textTransform: "none", fontSize: 12, borderRadius: "8px",
                borderColor: editPlatform === key ? info.color : "rgba(255,255,255,0.12)",
                color: editPlatform === key ? "#fff" : "#64748b",
                bgcolor: editPlatform === key ? info.color : "transparent",
                "&:hover": { bgcolor: info.color, color: "#fff", borderColor: info.color },
              }}
            >
              {info.label}
            </Button>
          ))}
        </Box>
      </DialogContent>
      <Divider sx={{ borderColor: "#2e2e42" }} />
      <DialogActions sx={{ px: 3, py: 2, gap: 1.5 }}>
        <Button onClick={() => setEditOpen(false)}
          sx={{ color: "#7070a0", textTransform: "none", border: "1px solid #44445a", borderRadius: "10px", px: 2.5,
            "&:hover": { bgcolor: "rgba(255,255,255,0.06)" } }}>
          Cancel
        </Button>
        <Button onClick={handleEdit}
          disabled={editing || !editAt}
          variant="contained"
          sx={{ bgcolor: "#059669", textTransform: "none", fontWeight: 600, borderRadius: "10px", px: 3, flexGrow: 1,
            "&:hover": { bgcolor: "#047857" }, "&.Mui-disabled": { bgcolor: "#1a3d2e", color: "#34d399" } }}>
          {editing ? <CircularProgress size={16} sx={{ color: "#34d399" }} /> : "Update Schedule"}
        </Button>
      </DialogActions>
    </Dialog>
  </>
  );
}

export default function History() {
  const { user, signOut } = useAuthenticator();
  const navigate = useNavigate();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const [facebookConnected, setFacebookConnected] = useState(false);
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({ open: false, message: "", severity: "success" });

  const handleSignOut = () => { signOut(); navigate("/login"); };

  const handlePublishResult = (success: boolean, msg: string) => {
    setSnackbar({ open: true, message: msg, severity: success ? "success" : "error" });
  };

  useEffect(() => {
    const userId = user?.userId ?? user?.username ?? "unknown";
    getHistory(userId)
      .then((items) =>
        setHistory([...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
      )
      .catch(() => setError("Failed to load history."))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
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
        setBusinessId(ownBusiness?.businessId ?? businesses[0]?.businessId ?? null);
      } catch {
        // keep businessId null
      }
    })();
  }, []);

  useEffect(() => {
    if (!businessId) return;
    getSocialConnections(businessId)
      .then((conns) => setLinkedinConnected(conns.some((c) => c.platform === "linkedin" && c.status === "connected")))
      .catch(() => {});
    getMetaPages(businessId)
      .then((info) => setFacebookConnected(info.status === "connected"))
      .catch(() => {});
    getInstagramStatus(businessId)
      .then((info) => setInstagramConnected(info.status === "connected"))
      .catch(() => {});
  }, [businessId]);

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
          <Button onClick={() => navigate("/schedules")} startIcon={<ScheduleIcon />}
            sx={{ color: "#64748b", textTransform: "none", fontSize: 14, "&:hover": { color: "#fff" } }}>
            Schedules
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

            {history.map((item) => (
              <HistoryRow
                key={item.action_id}
                item={item}
                linkedinConnected={linkedinConnected}
                facebookConnected={facebookConnected}
                instagramConnected={instagramConnected}
                onPublishResult={handlePublishResult}
                userId={user?.userId ?? user?.username ?? "unknown"}
              />
            ))}

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

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
          sx={{
            bgcolor: snackbar.severity === "success" ? "#0d2010" : "#1a0808",
            color: snackbar.severity === "success" ? "#22c55e" : "#ef4444",
            border: `0.5px solid ${snackbar.severity === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            "& .MuiAlert-icon": { color: snackbar.severity === "success" ? "#22c55e" : "#ef4444" },
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
