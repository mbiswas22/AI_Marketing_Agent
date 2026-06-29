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
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BusinessIcon from "@mui/icons-material/Business";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import AddBusinessIcon from "@mui/icons-material/AddBusiness";
import { api } from "../services/api";

export interface Business {
  businessId: string;
  name: string;
  industry: string;
  status: string;
  createdAt: string;
}

const fieldInputSx = (hasError: boolean) => ({
  bgcolor: "#1a1a28",
  borderRadius: "10px",
  "& fieldset": {
    borderColor: hasError ? "#ef4444" : "#383850",
    borderWidth: "1px",
  },
  "&:hover fieldset": { borderColor: hasError ? "#f87171" : "#7c6df0" },
  "&.Mui-focused fieldset": {
    borderColor: hasError ? "#ef4444" : "#7c6df0",
    borderWidth: "1.5px",
  },
  "& input": { color: "#ffffff", fontSize: 14, py: "13px", px: "14px" },
  "& input::placeholder": { color: "#7070a0", opacity: 1 },
  "& .MuiSelect-select": { color: "#ffffff", fontSize: 14, py: "13px", px: "14px" },
  "& .MuiSvgIcon-root": { color: "#9090c0" },
});

const emptyForm = { businessId: "", name: "", industry: "Retail", status: "ACTIVE" };
const emptyErrors = { businessId: "", name: "" };

const INDUSTRIES = ["Retail", "Food & Beverage", "Technology", "Healthcare", "Education", "Finance", "Real Estate", "Entertainment", "Other"];

export default function BusinessManagement() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.between("sm", "md"));

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState(emptyErrors);

  useEffect(() => { fetchBusinesses(); }, []);

  const fetchBusinesses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/businesses");
      const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      setBusinesses(Array.isArray(data) ? data : data?.businesses ?? []);
    } catch {
      setError("Failed to load businesses.");
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingBusiness(null);
    setForm(emptyForm);
    setFieldErrors(emptyErrors);
    setDialogOpen(true);
  };

  const openEditDialog = (business: Business) => {
    setEditingBusiness(business);
    setForm({ businessId: business.businessId, name: business.name, industry: business.industry, status: business.status });
    setFieldErrors(emptyErrors);
    setDialogOpen(true);
  };

  const validate = () => {
    const errors = { businessId: "", name: "" };
    let valid = true;
    if (!form.businessId.trim()) { errors.businessId = "Business ID is required."; valid = false; }
    if (!form.name.trim()) { errors.name = "Business name is required."; valid = false; }
    setFieldErrors(errors);
    return valid;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (editingBusiness) {
        await api.put(`/businesses/${editingBusiness.businessId}`, form);
      } else {
        await api.post("/businesses", form);
      }
      setDialogOpen(false);
      await fetchBusinesses();
    } catch {
      setError(editingBusiness ? "Failed to update business." : "Failed to create business.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (businessId: string) => {
    setDeletingId(businessId);
    try {
      await api.delete(`/businesses/${businessId}`);
      setBusinesses((prev) => prev.filter((b) => b.businessId !== businessId));
    } catch {
      setError("Failed to delete business.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleFieldChange = (field: keyof typeof form, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (fieldErrors[field as keyof typeof fieldErrors])
      setFieldErrors((p) => ({ ...p, [field]: "" }));
  };

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
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <BusinessIcon sx={{ color: "#7c6df0", fontSize: 24 }} />
            <Typography sx={{ color: "#f0eeff", fontSize: 20, fontWeight: 600 }}>Business Management</Typography>
          </Box>
          <Button variant="contained" onClick={openAddDialog}
            startIcon={<AddBusinessIcon sx={{ fontSize: 16 }} />}
            sx={{ bgcolor: "#5a4fd0", textTransform: "none", fontSize: 13, borderRadius: "8px", "&:hover": { bgcolor: "#6b5fe0" } }}>
            Add Business
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
        ) : businesses.length === 0 ? (
          <Box sx={{ border: "0.5px solid #2a2a35", borderRadius: "10px", p: 4, textAlign: "center" }}>
            <Typography sx={{ color: "#555", fontSize: 13 }}>No businesses found.</Typography>
          </Box>
        ) : isMobile ? (
          /* Mobile: card list */
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {businesses.map((b) => (
              <Box key={b.businessId} sx={{
                border: "0.5px solid #2a2a35", borderRadius: "10px", bgcolor: "#111118", p: 2,
                "&:hover": { borderColor: "rgba(124,109,240,0.4)" },
              }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                  <Box>
                    <Typography sx={{ color: "#e0dcf8", fontSize: 14, fontWeight: 600 }}>{b.name}</Typography>
                    <Typography sx={{ color: "#8090a8", fontSize: 12, mt: 0.3 }}>ID: {b.businessId}</Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <IconButton size="small" onClick={() => openEditDialog(b)}
                      sx={{ color: "#7c6df0", "&:hover": { bgcolor: "rgba(124,109,240,0.12)" } }}>
                      <EditOutlinedIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(b.businessId)} disabled={deletingId === b.businessId}
                      sx={{ color: "#ef4444", "&:hover": { bgcolor: "rgba(239,68,68,0.1)" }, "&.Mui-disabled": { color: "#5a2020" } }}>
                      {deletingId === b.businessId
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
                  }}>{b.industry}</Box>
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
          /* Tablet / Desktop: table */
          <Box sx={{ border: "0.5px solid #2a2a35", borderRadius: "10px", overflow: "hidden" }}>
            <Box sx={{ overflowX: "auto" }}>
              <Table sx={{ minWidth: isTablet ? 500 : 650 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: "#141418" }}>
                    {["Business ID", "Name", "Industry", "Status", ...(!isTablet ? ["Created At"] : []), "Actions"].map((h) => (
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
                        {b.name}
                      </TableCell>
                      <TableCell sx={{ color: "#c8d0e0", fontSize: 13, borderBottom: "0.5px solid #1e1e2e" }}>
                        {b.industry}
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
                            <IconButton size="small" onClick={() => openEditDialog(b)}
                              sx={{ color: "#7c6df0", "&:hover": { bgcolor: "rgba(124,109,240,0.12)", color: "#a89cf0" } }}>
                              <EditOutlinedIcon sx={{ fontSize: 17 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete business" placement="top">
                            <IconButton size="small" onClick={() => handleDelete(b.businessId)} disabled={deletingId === b.businessId}
                              sx={{ color: "#ef4444", "&:hover": { bgcolor: "rgba(239,68,68,0.1)", color: "#f87171" }, "&.Mui-disabled": { color: "#5a2020" } }}>
                              {deletingId === b.businessId
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

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm"
        PaperProps={{ sx: { bgcolor: "#1a1a24", border: "1px solid #32324a", borderRadius: "16px", boxShadow: "0 32px 80px rgba(0,0,0,0.7)", mx: { xs: 2, sm: 3 }, width: { xs: "calc(100% - 32px)", sm: "100%" } } }}>
        {/* Header */}
        <Box sx={{ px: { xs: 3, sm: 4 }, pt: 3.5, pb: 2, display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ bgcolor: "rgba(124,109,240,0.18)", borderRadius: "12px", p: "10px", display: "flex", border: "1px solid rgba(124,109,240,0.25)" }}>
            {editingBusiness ? <EditOutlinedIcon sx={{ color: "#5140d0", fontSize: 22 }} /> : <AddBusinessIcon sx={{ color: "#5140d0", fontSize: 22 }} />}
          </Box>
          <Box>
            <Typography sx={{ color: "#5140d0", fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>
              {editingBusiness ? "Edit Business" : "Add New Business"}
            </Typography>
            <Typography sx={{ color: "#a0a0c8", fontSize: 12.5, mt: 0.3 }}>
              {editingBusiness ? `Editing: ${editingBusiness.name}` : "Enter the details for the new business."}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ borderColor: "#2e2e42" }} />

        <DialogContent sx={{ px: { xs: 3, sm: 4 }, pt: "24px !important", pb: 2 }}>
          {/* Business ID */}
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Business ID</Typography>
            <TextField fullWidth placeholder="e.g. BUS001"
              value={form.businessId}
              onChange={(e) => handleFieldChange("businessId", e.target.value)}
              error={!!fieldErrors.businessId}
              disabled={!!editingBusiness}
              InputProps={{ sx: fieldInputSx(!!fieldErrors.businessId) }}
              InputLabelProps={{ shrink: false }}
              sx={{ "& .MuiInputLabel-root": { display: "none" }, "& .MuiFormHelperText-root": { color: "#ef4444", fontSize: 12, mx: 0, mt: 0.6 } }}
              helperText={fieldErrors.businessId} />
          </Box>
          {/* Business Name */}
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Business Name</Typography>
            <TextField fullWidth placeholder="e.g. Acme Corp"
              value={form.name}
              onChange={(e) => handleFieldChange("name", e.target.value)}
              error={!!fieldErrors.name}
              InputProps={{ sx: fieldInputSx(!!fieldErrors.name) }}
              InputLabelProps={{ shrink: false }}
              sx={{ "& .MuiInputLabel-root": { display: "none" }, "& .MuiFormHelperText-root": { color: "#ef4444", fontSize: 12, mx: 0, mt: 0.6 } }}
              helperText={fieldErrors.name} />
          </Box>
          {/* Industry */}
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Industry</Typography>
            <Select fullWidth value={form.industry} onChange={(e) => handleFieldChange("industry", e.target.value)}
              sx={fieldInputSx(false)}
              MenuProps={{ PaperProps: { sx: { bgcolor: "#13131e", border: "1px solid #383850", borderRadius: "10px", color: "#f0eeff", mt: 0.5, "& .MuiMenuItem-root": { fontSize: 14, py: 1.2, "&:hover": { bgcolor: "rgba(124,109,240,0.12)" } }, "& .Mui-selected": { bgcolor: "rgba(124,109,240,0.18) !important" } } } } as any}>
              {INDUSTRIES.map((ind) => <MenuItem key={ind} value={ind}>{ind}</MenuItem>)}
            </Select>
          </Box>
          {/* Status */}
          <Box sx={{ mb: 1 }}>
            <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Status</Typography>
            <Select fullWidth value={form.status} onChange={(e) => handleFieldChange("status", e.target.value)}
              sx={fieldInputSx(false)}
              MenuProps={{ PaperProps: { sx: { bgcolor: "#13131e", border: "1px solid #383850", borderRadius: "10px", color: "#f0eeff", mt: 0.5, "& .MuiMenuItem-root": { fontSize: 14, py: 1.2, "&:hover": { bgcolor: "rgba(124,109,240,0.12)" } }, "& .Mui-selected": { bgcolor: "rgba(124,109,240,0.18) !important" } } } } as any}>
              <MenuItem value="ACTIVE">ACTIVE</MenuItem>
              <MenuItem value="INACTIVE">INACTIVE</MenuItem>
            </Select>
          </Box>
        </DialogContent>

        <Divider sx={{ borderColor: "#2e2e42" }} />

        <DialogActions sx={{ px: { xs: 3, sm: 4 }, py: 2.5, gap: 1.5 }}>
          <Button onClick={() => setDialogOpen(false)}
            sx={{ color: "#7070a0", textTransform: "none", fontSize: 14, borderRadius: "10px", px: 2.5, border: "1px solid #44445a", "&:hover": { bgcolor: "rgba(255,255,255,0.06)", borderColor: "#7070a0" } }}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}
            disabled={submitting || (!editingBusiness && (!form.businessId.trim() || !form.name.trim()))}
            variant="contained"
            sx={{ bgcolor: "#a78bfa", textTransform: "none", fontSize: 14, fontWeight: 600, borderRadius: "10px", px: 3, flexGrow: 1, "&:hover": { bgcolor: "#b89ffb" }, "&.Mui-disabled": { bgcolor: "#3d2d60", color: "#f0eef3" } }}>
            {submitting ? <CircularProgress size={16} sx={{ color: "#a89cf0" }} /> : editingBusiness ? "Save Changes" : "Create Business"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
