import { useEffect, useState } from "react";
import type { JSX } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useNavigate } from "react-router-dom";
import {
  Box, Typography, Button, Paper, CircularProgress,
  Chip, IconButton, Tooltip, Snackbar, Alert, Dialog,
  DialogContent, DialogActions, TextField, Divider, Select, MenuItem,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LogoutIcon from "@mui/icons-material/Logout";
import DashboardIcon from "@mui/icons-material/Dashboard";
import HistoryIcon from "@mui/icons-material/History";
import EditCalendarIcon from "@mui/icons-material/EditCalendar";
import DeleteIcon from "@mui/icons-material/Delete";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import ScheduleIcon from "@mui/icons-material/Schedule";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import FacebookIcon from "@mui/icons-material/Facebook";
import InstagramIcon from "@mui/icons-material/Instagram";
import YouTubeIcon from "@mui/icons-material/YouTube";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import { api, updateSchedule, deleteSchedule, inactiveSchedule, reactivateSchedule } from "../services/api";

interface Schedule {
  schedule_id: string;
  schedule_name: string;
  user_id: string;
  platform: string;
  content_type: string;
  topic: string;
  schedule_expression: string;
  timezone: string;
  status: string;
  last_run_status: string;
  created_at: string;
  updated_at: string;
  last_run_at?: string;
}

interface ScheduleLog {
  log_id: string;
  schedule_id: string;
  user_id: string;
  platform: string;
  status: string;
  message: string;
  response_data?: Record<string, unknown>;
  created_at: string;
}

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Vancouver",
  "America/Sao_Paulo", "America/Argentina/Buenos_Aires", "Europe/London", "Europe/Paris",
  "Europe/Berlin", "Europe/Moscow", "Africa/Lagos", "Africa/Nairobi", "Africa/Johannesburg",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok", "Asia/Singapore",
  "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul", "Australia/Sydney", "Pacific/Auckland", "UTC",
];

const tzSelectSx = {
  color: "#e0dcf8", bgcolor: "#0d0d0f", borderRadius: "10px", fontSize: 13,
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "#383850" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#7c6df0" },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#7c6df0" },
  "& .MuiSelect-select": { py: "10px", px: "12px" },
};

const PLATFORM_INFO: Record<string, { icon: JSX.Element; color: string; label: string }> = {
  facebook:  { icon: <FacebookIcon sx={{ fontSize: 14 }} />,  color: "#1877f2", label: "Facebook" },
  instagram: { icon: <InstagramIcon sx={{ fontSize: 14 }} />, color: "#e1306c", label: "Instagram" },
  youtube:   { icon: <YouTubeIcon sx={{ fontSize: 14 }} />,   color: "#ff0000", label: "YouTube" },
  linkedin:  { icon: <LinkedInIcon sx={{ fontSize: 14 }} />,  color: "#0a66c2", label: "LinkedIn" },
};

const scheduleStatusStyle = (status: string) => {
  if (status === "active")   return { color: "#4caf7d", bgcolor: "#0f3d2a", border: "#1a5c3a" };
  if (status === "inactive") return { color: "#888",    bgcolor: "#1a1a1a", border: "#333" };
  return                            { color: "#a78bfa", bgcolor: "#1a1530", border: "#4c3a8a" };
};

const logStatusStyle = (status: string) => {
  if (status === "success") return { color: "#4caf7d", bgcolor: "#0f3d2a", border: "#1a5c3a", icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> };
  if (status === "failed")  return { color: "#ef4444", bgcolor: "#1a0808", border: "#5c1a1a", icon: <ErrorIcon sx={{ fontSize: 14 }} /> };
  if (status === "skipped") return { color: "#f59e0b", bgcolor: "#1a1200", border: "#5c3a00", icon: <SkipNextIcon sx={{ fontSize: 14 }} /> };
  return                           { color: "#64748b", bgcolor: "#1a1a1a", border: "#333",    icon: null };
};

const formatExpression = (expr: string) =>
  expr.replace("at(", "").replace(")", "").replace("T", " ");

export default function Schedules() {
  const { user, signOut } = useAuthenticator();
  const navigate = useNavigate();

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs] = useState<ScheduleLog[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>
    ({ open: false, message: "", severity: "success" });

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Schedule | null>(null);
  const [editAt, setEditAt] = useState("");
  const [editTimezone, setEditTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [editing, setEditing] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [businessId, setBusinessId] = useState<string | null>(null);

  useEffect(() => {
    const fetchBusinessId = async () => {
      try {
        const { getUserAttributes } = await import("../services/auth");
        const { getBusinesses } = await import("../services/api");
        const attrs = await getUserAttributes();
        const email = (attrs as { email?: string })?.email;
        const businesses = await getBusinesses();
        const own = businesses.find((b: any) => b.ownerEmail === email);
        setBusinessId(own?.businessId ?? businesses[0]?.businessId ?? null);
      } catch {
        // keep null
      }
    };
    fetchBusinessId();
  }, []);

  const notify = (success: boolean, msg: string) =>
    setSnackbar({ open: true, message: msg, severity: success ? "success" : "error" });

  const loadSchedules = async () => {
    if (!businessId) return;
    setLoadingSchedules(true);
    try {
      const res = await api.post("/schedule", { action: "list_schedules", body: { businessId } });
      const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      const body = typeof data.body === "string" ? JSON.parse(data.body) : data.body ?? data;
      setSchedules(Array.isArray(body) ? body : body.schedules ?? []);
    } catch {
      setError("Failed to load schedules.");
    } finally {
      setLoadingSchedules(false);
    }
  };

  const loadLogs = async () => {
    if (!businessId) return;
    setLoadingLogs(true);
    try {
      const res = await api.post("/schedule", { action: "list_logs", body: { businessId } });
      const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      const body = typeof data.body === "string" ? JSON.parse(data.body) : data.body ?? data;
      setLogs(Array.isArray(body) ? body : []);
    } catch {
      // logs section fails silently
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (businessId) {
      loadSchedules();
      loadLogs();
    }
  }, [businessId]);

  const handleEdit = async () => {
    if (!editAt || !editTarget) return;
    setEditing(true);
    try {
      await updateSchedule({
        schedule_id: editTarget.schedule_id,
        schedule_expression: `at(${editAt.slice(0, 16)}:00)`,
        timezone: editTimezone,
      });
      setEditOpen(false);
      notify(true, "Schedule updated successfully");
      loadSchedules();
    } catch (err) {
      notify(false, (err as Error).message || "Failed to update schedule.");
    } finally {
      setEditing(false);
    }
  };

  const handleInactive = async (schedule: Schedule) => {
    try {
      await inactiveSchedule(schedule.schedule_id);
      notify(true, "Schedule set to inactive");
      loadSchedules();
    } catch (err) {
      notify(false, (err as Error).message || "Failed to inactivate schedule.");
    }
  };

  const handleReactivate = async (schedule: Schedule) => {
    try {
      await reactivateSchedule(schedule.schedule_id);
      notify(true, "Schedule reactivated");
      loadSchedules();
    } catch (err) {
      notify(false, (err as Error).message || "Failed to reactivate schedule.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSchedule(deleteTarget.schedule_id);
      setDeleteTarget(null);
      notify(true, "Schedule deleted");
      loadSchedules();
    } catch (err) {
      notify(false, (err as Error).message || "Failed to delete schedule.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a" }}>
      {/* Navbar */}
      <nav style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 32px", height: 64, borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "#0d0d0d", position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AutoAwesomeIcon sx={{ color: "#8b5cf6" }} />
          <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>MarketingAI</Typography>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Button onClick={() => navigate("/dashboard")} startIcon={<DashboardIcon />}
            sx={{ color: "#64748b", textTransform: "none", fontSize: 14, "&:hover": { color: "#fff" } }}>
            Dashboard
          </Button>
          <Button onClick={() => navigate("/history")} startIcon={<HistoryIcon />}
            sx={{ color: "#64748b", textTransform: "none", fontSize: 14, "&:hover": { color: "#fff" } }}>
            History
          </Button>
          <Typography sx={{ color: "#475569", fontSize: 13 }}>{user?.username}</Typography>
          <Button onClick={() => { signOut(); navigate("/login"); }} startIcon={<LogoutIcon />}
            size="small" variant="outlined"
            sx={{
              color: "#8b5cf6", borderColor: "#8b5cf6", textTransform: "none", fontSize: 13,
              "&:hover": { borderColor: "#a78bfa", color: "#a78bfa", bgcolor: "rgba(139,92,246,0.08)" },
            }}>
            Sign Out
          </Button>
        </div>
      </nav>

      <Box sx={{ maxWidth: 1100, mx: "auto", px: 4, py: 5 }}>

        {/* ── SECTION 1: Schedules ── */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
          <ScheduleIcon sx={{ color: "#a78bfa", fontSize: 28 }} />
          <Typography variant="h4" sx={{ color: "#fff", fontWeight: 800 }}>Schedule Manager</Typography>
        </Box>
        <Typography sx={{ color: "#475569", mb: 4, fontSize: 15 }}>
          View and manage all your scheduled posts.
        </Typography>

        {error && <Typography sx={{ color: "#ef4444", fontSize: 14, mb: 2 }}>{error}</Typography>}

        {loadingSchedules ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress sx={{ color: "#8b5cf6" }} />
          </Box>
        ) : schedules.length === 0 ? (
          <Paper elevation={0} sx={{
            bgcolor: "#161616", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 3, textAlign: "center", color: "#475569", py: 6, mb: 6,
          }}>
            <ScheduleIcon sx={{ fontSize: 40, color: "#2a2a3a", mb: 1 }} />
            <Typography>No schedules yet. Create one from the History page.</Typography>
          </Paper>
        ) : (
          <Box sx={{ mb: 6 }}>
            {/* Table header */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 2.5, pb: 1.25 }}>
              <span style={{ color: "#475569", fontSize: 12, fontWeight: 600, width: 110, flexShrink: 0 }}>PLATFORM</span>
              <span style={{ color: "#475569", fontSize: 12, fontWeight: 600, flex: 1 }}>TOPIC</span>
              <span style={{ color: "#475569", fontSize: 12, fontWeight: 600, width: 160, flexShrink: 0 }}>SCHEDULED FOR</span>
              <span style={{ color: "#475569", fontSize: 12, fontWeight: 600, width: 80, flexShrink: 0 }}>STATUS</span>
              <span style={{ color: "#475569", fontSize: 12, fontWeight: 600, width: 90, flexShrink: 0 }}>LAST RUN</span>
              <Box sx={{ width: 100, flexShrink: 0 }} />
            </Box>

            {schedules.map((s) => {
              const pInfo = PLATFORM_INFO[s.platform?.toLowerCase()] ?? null;
              const sc = scheduleStatusStyle(s.status);
              return (
                <Paper key={s.schedule_id} elevation={0} sx={{
                  bgcolor: "#161616", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 2.5, mb: 1.25, overflow: "hidden",
                  transition: "border-color 0.2s",
                  "&:hover": { borderColor: "rgba(139,92,246,0.35)" },
                }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 2.5, py: 1.75 }}>
                    <Box sx={{ width: 110, flexShrink: 0 }}>
                      {pInfo ? (
                        <Chip size="small" icon={pInfo.icon} label={pInfo.label} sx={{
                          bgcolor: `${pInfo.color}22`, color: pInfo.color,
                          border: `1px solid ${pInfo.color}55`, fontSize: 12,
                          "& .MuiChip-icon": { color: pInfo.color },
                        }} />
                      ) : (
                        <Typography sx={{ color: "#64748b", fontSize: 13 }}>{s.platform}</Typography>
                      )}
                    </Box>

                    <Typography sx={{
                      color: "#cbd5e1", fontSize: 13.5, flex: 1, minWidth: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {s.topic}
                    </Typography>

                    <Typography sx={{ color: "#94a3b8", fontSize: 13, width: 160, flexShrink: 0 }}>
                      {formatExpression(s.schedule_expression)}
                    </Typography>

                    <Box sx={{ width: 80, flexShrink: 0 }}>
                      <Chip size="small" label={s.status} sx={{
                        bgcolor: sc.bgcolor, color: sc.color,
                        border: `1px solid ${sc.border}`, fontSize: 11, fontWeight: 600,
                      }} />
                    </Box>

                    <Typography sx={{
                      color: logStatusStyle(s.last_run_status).color,
                      fontSize: 12, width: 90, flexShrink: 0, fontWeight: 600,
                    }}>
                      {s.last_run_status}
                    </Typography>

                    <Box sx={{ display: "flex", gap: 0.5, width: 100, flexShrink: 0, justifyContent: "flex-end" }}>
                      <Tooltip title="Edit schedule" placement="top">
                        <span>
                          <IconButton size="small"
                            disabled={s.status === "inactive"}
                            onClick={() => { setEditTarget(s); setEditAt(""); setEditTimezone(s.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone); setEditOpen(true); }}
                            sx={{ color: "#a78bfa", p: "6px", "&:hover": { bgcolor: "rgba(139,92,246,0.1)" }, "&.Mui-disabled": { color: "#2a2a3a" } }}>
                            <EditCalendarIcon sx={{ fontSize: 17 }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Set inactive" placement="top">
                        <span>
                          <IconButton size="small"
                            disabled={s.status === "inactive"}
                            onClick={() => handleInactive(s)}
                            sx={{ color: "#f59e0b", p: "6px", "&:hover": { bgcolor: "rgba(245,158,11,0.1)" }, "&.Mui-disabled": { color: "#2a2a3a" } }}>
                            <PauseCircleIcon sx={{ fontSize: 17 }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      {s.status === "inactive" && (
                        <Tooltip title="Reactivate schedule" placement="top">
                          <IconButton size="small"
                            onClick={() => handleReactivate(s)}
                            sx={{ color: "#4caf7d", p: "6px", "&:hover": { bgcolor: "rgba(76,175,125,0.1)" } }}>
                            <PlayCircleIcon sx={{ fontSize: 17 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Delete schedule" placement="top">
                        <IconButton size="small"
                          onClick={() => setDeleteTarget(s)}
                          sx={{ color: "#ef4444", p: "6px", "&:hover": { bgcolor: "rgba(239,68,68,0.1)" } }}>
                          <DeleteIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>

                  <Box sx={{ px: 2.5, pb: 1.25, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <Typography sx={{ color: "#475569", fontSize: 11.5 }}>
                      ID: {s.schedule_id}&nbsp;·&nbsp;Type: {s.content_type}&nbsp;·&nbsp;Created: {new Date(s.created_at).toLocaleDateString()}
                      {s.last_run_at && `  ·  Last run: ${new Date(s.last_run_at).toLocaleString()}`}
                    </Typography>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        )}

        {/* ── SECTION 2: Run History ── */}
        <Divider sx={{ borderColor: "rgba(255,255,255,0.07)", mb: 4 }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
          <HistoryIcon sx={{ color: "#64748b", fontSize: 24 }} />
          <Typography variant="h5" sx={{ color: "#fff", fontWeight: 700 }}>Run History</Typography>
        </Box>
        <Typography sx={{ color: "#475569", mb: 3, fontSize: 14 }}>
          Log of every time a schedule was executed by EventBridge.
        </Typography>

        {loadingLogs ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress sx={{ color: "#8b5cf6" }} size={28} />
          </Box>
        ) : logs.length === 0 ? (
          <Paper elevation={0} sx={{
            bgcolor: "#161616", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 3, textAlign: "center", color: "#475569", py: 5,
          }}>
            <Typography>No run history yet. Schedules will log here after they fire.</Typography>
          </Paper>
        ) : (
          <Box>
            {/* Log header */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 2.5, pb: 1.25 }}>
              <span style={{ color: "#475569", fontSize: 12, fontWeight: 600, width: 110, flexShrink: 0 }}>PLATFORM</span>
              <span style={{ color: "#475569", fontSize: 12, fontWeight: 600, width: 80, flexShrink: 0 }}>STATUS</span>
              <span style={{ color: "#475569", fontSize: 12, fontWeight: 600, flex: 1 }}>MESSAGE</span>
              <span style={{ color: "#475569", fontSize: 12, fontWeight: 600, width: 160, flexShrink: 0 }}>RAN AT</span>
            </Box>

            {logs.map((log) => {
              const pInfo = PLATFORM_INFO[log.platform?.toLowerCase()] ?? null;
              const ls = logStatusStyle(log.status);
              return (
                <Paper key={log.log_id} elevation={0} sx={{
                  bgcolor: "#161616", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 2.5, mb: 1, overflow: "hidden",
                }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 2.5, py: 1.5 }}>
                    <Box sx={{ width: 110, flexShrink: 0 }}>
                      {pInfo ? (
                        <Chip size="small" icon={pInfo.icon} label={pInfo.label} sx={{
                          bgcolor: `${pInfo.color}22`, color: pInfo.color,
                          border: `1px solid ${pInfo.color}55`, fontSize: 12,
                          "& .MuiChip-icon": { color: pInfo.color },
                        }} />
                      ) : (
                        <Typography sx={{ color: "#64748b", fontSize: 13 }}>{log.platform}</Typography>
                      )}
                    </Box>

                    <Box sx={{ width: 80, flexShrink: 0 }}>
                      <Chip size="small" icon={ls.icon ?? undefined} label={log.status} sx={{
                        bgcolor: ls.bgcolor, color: ls.color,
                        border: `1px solid ${ls.border}`, fontSize: 11, fontWeight: 600,
                        "& .MuiChip-icon": { color: ls.color },
                      }} />
                    </Box>

                    <Typography sx={{
                      color: "#94a3b8", fontSize: 13, flex: 1, minWidth: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {log.message}
                    </Typography>

                    <Typography sx={{ color: "#64748b", fontSize: 12, width: 160, flexShrink: 0 }}>
                      {new Date(log.created_at).toLocaleString()}
                    </Typography>
                  </Box>

                  <Box sx={{ px: 2.5, pb: 1, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <Typography sx={{ color: "#334155", fontSize: 11.5 }}>
                      Schedule ID: {log.schedule_id}
                    </Typography>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="xs"
        slotProps={{ paper: { sx: { bgcolor: "#1a1a24", border: "1px solid #32324a", borderRadius: "16px", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" } } }}>
        <Box sx={{ px: 3, pt: 3, pb: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
          <EditCalendarIcon sx={{ color: "#a78bfa", fontSize: 22 }} />
          <Box>
            <Typography sx={{ color: "#e0dcf8", fontWeight: 700, fontSize: 16 }}>Edit Schedule</Typography>
            <Typography sx={{ color: "#64748b", fontSize: 12, mt: 0.3 }}>Update the scheduled publish time</Typography>
          </Box>
        </Box>
        <Divider sx={{ borderColor: "#2e2e42" }} />
        <DialogContent sx={{ px: 3, pt: "20px !important", pb: 2 }}>
          <Typography sx={{ color: "#a78bfa", fontSize: 13, fontWeight: 600, mb: 0.8 }}>New Date & Time</Typography>
          <TextField
            type="datetime-local"
            fullWidth
            value={editAt}
            onChange={(e) => setEditAt(e.target.value)}
            slotProps={{ htmlInput: { min: new Date().toISOString().slice(0, 16) } }}
            sx={{
              "& .MuiOutlinedInput-root": {
                color: "#e0dcf8", bgcolor: "#0d0d0f", borderRadius: "10px",
                "& fieldset": { borderColor: "#383850" },
                "&:hover fieldset": { borderColor: "#7c6df0" },
                "&.Mui-focused fieldset": { borderColor: "#7c6df0" },
              },
              "& ::-webkit-calendar-picker-indicator": { filter: "invert(1)" },
            }}
          />
          <Typography sx={{ color: "#a78bfa", fontSize: 13, fontWeight: 600, mt: 2, mb: 0.8 }}>Timezone</Typography>
          <Select
            fullWidth
            value={editTimezone}
            onChange={(e) => setEditTimezone(e.target.value)}
            sx={tzSelectSx}
            MenuProps={{ PaperProps: { sx: { bgcolor: "#141418", border: "0.5px solid #2a2a35", color: "#e0dcf8", maxHeight: 260 } } } as any}
          >
            {TIMEZONES.map((tz) => (
              <MenuItem key={tz} value={tz} sx={{ fontSize: 13, "&:hover": { bgcolor: "rgba(124,109,240,0.1)" }, "&.Mui-selected": { bgcolor: "rgba(124,109,240,0.15)" } }}>
                {tz}
              </MenuItem>
            ))}
          </Select>
        </DialogContent>
        <Divider sx={{ borderColor: "#2e2e42" }} />
        <DialogActions sx={{ px: 3, py: 2, gap: 1.5 }}>
          <Button onClick={() => setEditOpen(false)}
            sx={{ color: "#7070a0", textTransform: "none", border: "1px solid #44445a", borderRadius: "10px", px: 2.5,
              "&:hover": { bgcolor: "rgba(255,255,255,0.06)" } }}>
            Cancel
          </Button>
          <Button onClick={handleEdit} disabled={editing || !editAt} variant="contained"
            sx={{ bgcolor: "#7c3aed", textTransform: "none", fontWeight: 600, borderRadius: "10px", px: 3, flexGrow: 1,
              "&:hover": { bgcolor: "#6d28d9" }, "&.Mui-disabled": { bgcolor: "#3d2d60", color: "#7c5cbf" } }}>
            {editing ? <CircularProgress size={16} sx={{ color: "#a89cf0" }} /> : "Update"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} fullWidth maxWidth="xs"
        slotProps={{ paper: { sx: { bgcolor: "#1a1a24", border: "1px solid #32324a", borderRadius: "16px", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" } } }}>
        <Box sx={{ px: 3, pt: 3, pb: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
          <DeleteIcon sx={{ color: "#ef4444", fontSize: 22 }} />
          <Box>
            <Typography sx={{ color: "#e0dcf8", fontWeight: 700, fontSize: 16 }}>Delete Schedule</Typography>
            <Typography sx={{ color: "#64748b", fontSize: 12, mt: 0.3 }}>This cannot be undone</Typography>
          </Box>
        </Box>
        <Divider sx={{ borderColor: "#2e2e42" }} />
        <DialogContent sx={{ px: 3, pt: "20px !important", pb: 2 }}>
          <Typography sx={{ color: "#94a3b8", fontSize: 14 }}>
            Are you sure you want to delete the <strong style={{ color: "#e0dcf8" }}>{deleteTarget?.platform}</strong> schedule?
          </Typography>
        </DialogContent>
        <Divider sx={{ borderColor: "#2e2e42" }} />
        <DialogActions sx={{ px: 3, py: 2, gap: 1.5 }}>
          <Button onClick={() => setDeleteTarget(null)}
            sx={{ color: "#7070a0", textTransform: "none", border: "1px solid #44445a", borderRadius: "10px", px: 2.5,
              "&:hover": { bgcolor: "rgba(255,255,255,0.06)" } }}>
            Cancel
          </Button>
          <Button onClick={handleDelete} disabled={deleting} variant="contained"
            sx={{ bgcolor: "#dc2626", textTransform: "none", fontWeight: 600, borderRadius: "10px", px: 3, flexGrow: 1,
              "&:hover": { bgcolor: "#b91c1c" }, "&.Mui-disabled": { bgcolor: "#3d1a1a", color: "#ef4444" } }}>
            {deleting ? <CircularProgress size={16} sx={{ color: "#fca5a5" }} /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={5000}
        onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={snackbar.severity}
          onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
          sx={{
            bgcolor: snackbar.severity === "success" ? "#0d2010" : "#1a0808",
            color: snackbar.severity === "success" ? "#22c55e" : "#ef4444",
            border: `0.5px solid ${snackbar.severity === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            "& .MuiAlert-icon": { color: snackbar.severity === "success" ? "#22c55e" : "#ef4444" },
          }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
}
