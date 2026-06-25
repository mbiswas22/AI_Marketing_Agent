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
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import PeopleIcon from "@mui/icons-material/People";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { getUsers, createUser, deleteUser } from "../services/api";
import type { User } from "../services/api";

const HARDCODED_BUSINESS_ID = "BUS001";

const darkInputSx = {
  "& .MuiOutlinedInput-root": {
    bgcolor: "#0d0d0f",
    borderRadius: "8px",
    "& fieldset": { borderColor: "#3a3a4a", borderWidth: "0.5px" },
    "&:hover fieldset": { borderColor: "#7c6df0" },
    "&.Mui-focused fieldset": { borderColor: "#7c6df0" },
    "& input": { color: "#e0dcf8", fontSize: 13 },
  },
  "& .MuiInputLabel-root": { color: "#666", fontSize: 13 },
  "& .MuiInputLabel-root.Mui-focused": { color: "#7c6df0" },
};

const darkSelectSx = {
  bgcolor: "#0d0d0f",
  borderRadius: "8px",
  color: "#e0dcf8",
  fontSize: 13,
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "#3a3a4a",
    borderWidth: "0.5px",
  },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#7c6df0" },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#7c6df0" },
  "& .MuiSvgIcon-root": { color: "#888" },
};

export default function UserManagement() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    email: "",
    displayName: "",
    role: "VIEWER",
    businessId: HARDCODED_BUSINESS_ID,
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUsers(HARDCODED_BUSINESS_ID);
      setUsers(data);
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = () => {
    setForm({ email: "", displayName: "", role: "VIEWER", businessId: HARDCODED_BUSINESS_ID });
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!form.email || !form.displayName || !form.businessId) return;
    setSubmitting(true);
    try {
      await createUser(form);
      setDialogOpen(false);
      await fetchUsers();
    } catch {
      setError("Failed to create user.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (userId: string) => {
    setDeletingId(userId);
    try {
      await deleteUser(HARDCODED_BUSINESS_ID, userId);
      setUsers((prev) => prev.filter((u) => u.userId !== userId));
    } catch {
      setError("Failed to delete user.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Box sx={{ height: "100vh", bgcolor: "#0d0d0f", display: "flex", flexDirection: "column" }}>
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
          sx={{ color: "#64748b", textTransform: "none", fontSize: 14, "&:hover": { color: "#fff" } }}
        >
          Dashboard
        </Button>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 2, sm: 3, md: 4 } }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <PeopleIcon sx={{ color: "#7c6df0", fontSize: 24 }} />
            <Typography sx={{ color: "#f0eeff", fontSize: 20, fontWeight: 600 }}>
              User Management
            </Typography>
          </Box>
          <Button
            variant="contained"
            onClick={handleOpenDialog}
            sx={{
              bgcolor: "#5a4fd0",
              textTransform: "none",
              fontSize: 13,
              borderRadius: "8px",
              "&:hover": { bgcolor: "#6b5fe0" },
            }}
          >
            + Add User
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
        ) : (
          <Box
            sx={{
              border: "0.5px solid #2a2a35",
              borderRadius: "10px",
              overflow: "hidden",
            }}
          >
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: "#141418" }}>
                  {["Display Name", "Email", "Role", "Status", "Created At", ""].map((h) => (
                    <TableCell
                      key={h}
                      sx={{ color: "#888", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "0.5px solid #2a2a35", py: 1.5 }}
                    >
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ color: "#555", fontSize: 13, textAlign: "center", py: 4, borderBottom: "none" }}>
                      No users found.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow
                      key={user.userId}
                      sx={{ "&:hover": { bgcolor: "rgba(124,109,240,0.04)" }, "&:last-child td": { borderBottom: "none" } }}
                    >
                      <TableCell sx={{ color: "#e0dcf8", fontSize: 13, borderBottom: "0.5px solid #1e1e2e" }}>
                        {user.displayName}
                      </TableCell>
                      <TableCell sx={{ color: "#a0aec0", fontSize: 13, borderBottom: "0.5px solid #1e1e2e" }}>
                        {user.email}
                      </TableCell>
                      <TableCell sx={{ borderBottom: "0.5px solid #1e1e2e" }}>
                        <Box
                          sx={{
                            display: "inline-block",
                            px: "10px",
                            py: "2px",
                            borderRadius: "20px",
                            fontSize: 11,
                            fontWeight: 600,
                            bgcolor: user.role === "ADMIN" ? "rgba(139,92,246,0.15)" : "rgba(124,109,240,0.1)",
                            color: user.role === "ADMIN" ? "#a78bfa" : "#7c6df0",
                            border: `0.5px solid ${user.role === "ADMIN" ? "rgba(139,92,246,0.3)" : "rgba(124,109,240,0.25)"}`,
                          }}
                        >
                          {user.role}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ borderBottom: "0.5px solid #1e1e2e" }}>
                        <Box
                          sx={{
                            display: "inline-block",
                            px: "10px",
                            py: "2px",
                            borderRadius: "20px",
                            fontSize: 11,
                            fontWeight: 600,
                            bgcolor: user.status === "ACTIVE" ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)",
                            color: user.status === "ACTIVE" ? "#22c55e" : "#64748b",
                            border: `0.5px solid ${user.status === "ACTIVE" ? "rgba(34,197,94,0.25)" : "rgba(100,116,139,0.25)"}`,
                          }}
                        >
                          {user.status}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: "#64748b", fontSize: 12, borderBottom: "0.5px solid #1e1e2e" }}>
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell sx={{ borderBottom: "0.5px solid #1e1e2e" }}>
                        <Button
                          size="small"
                          onClick={() => handleDelete(user.userId)}
                          disabled={deletingId === user.userId}
                          sx={{
                            color: "#ef4444",
                            textTransform: "none",
                            fontSize: 12,
                            minWidth: "auto",
                            px: 1.5,
                            borderRadius: "6px",
                            "&:hover": { bgcolor: "rgba(239,68,68,0.08)" },
                          }}
                        >
                          {deletingId === user.userId ? <CircularProgress size={12} sx={{ color: "#ef4444" }} /> : "Delete"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Box>
        )}
      </Box>

      {/* Add User Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        PaperProps={{
          sx: { bgcolor: "#141418", border: "0.5px solid #2a2a35", borderRadius: "12px", minWidth: 400 },
        }}
      >
        <DialogTitle sx={{ color: "#f0eeff", fontSize: 16, fontWeight: 600, pb: 1 }}>
          Add User
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
          <TextField
            label="Email"
            type="email"
            fullWidth
            size="small"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            sx={darkInputSx}
          />
          <TextField
            label="Display Name"
            fullWidth
            size="small"
            value={form.displayName}
            onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
            sx={darkInputSx}
          />
          <FormControl fullWidth size="small">
            <InputLabel sx={{ color: "#666", fontSize: 13, "&.Mui-focused": { color: "#7c6df0" } }}>
              Role
            </InputLabel>
            <Select
              label="Role"
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              sx={darkSelectSx}
              MenuProps={{ PaperProps: { sx: { bgcolor: "#141418", border: "0.5px solid #2a2a35", color: "#e0dcf8" } } } as any}
            >
              <MenuItem value="VIEWER" sx={{ fontSize: 13, "&:hover": { bgcolor: "rgba(124,109,240,0.1)" } }}>VIEWER</MenuItem>
              <MenuItem value="EDITOR" sx={{ fontSize: 13, "&:hover": { bgcolor: "rgba(124,109,240,0.1)" } }}>EDITOR</MenuItem>
              <MenuItem value="ADMIN" disabled sx={{ fontSize: 13, color: "#555" }}>ADMIN</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Business ID"
            fullWidth
            size="small"
            value={form.businessId}
            onChange={(e) => setForm((p) => ({ ...p, businessId: e.target.value }))}
            sx={darkInputSx}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            onClick={() => setDialogOpen(false)}
            sx={{ color: "#64748b", textTransform: "none", fontSize: 13 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={submitting || !form.email || !form.displayName || !form.businessId}
            variant="contained"
            sx={{
              bgcolor: "#5a4fd0",
              textTransform: "none",
              fontSize: 13,
              borderRadius: "8px",
              "&:hover": { bgcolor: "#6b5fe0" },
              "&.Mui-disabled": { bgcolor: "#2d2460", color: "#5a4f90" },
            }}
          >
            {submitting ? <CircularProgress size={14} sx={{ color: "#a89cf0" }} /> : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
