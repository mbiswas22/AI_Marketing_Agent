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
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import SearchIcon from "@mui/icons-material/Search";
import { api } from "../services/api";

export interface Business {
  businessId: string;
  businessName: string;
  businessType: string;
  status: string;
  createdAt: string;
  phone?: string;
  region?: string;
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

const emptyForm = { businessName: "", businessType: "Retail", status: "ACTIVE", ownerEmail: "", ownerName: "" };
const emptyErrors = { businessName: "", ownerEmail: "", ownerName: "" };

const DEFAULT_INDUSTRIES = ["Retail", "Food & Beverage", "Technology", "Healthcare", "Education", "Finance", "Real Estate", "Entertainment", "Other"];
const CUSTOM_INDUSTRIES_KEY = "customBusinessTypes";

const loadIndustries = (): string[] => {
  try {
    const saved = localStorage.getItem(CUSTOM_INDUSTRIES_KEY);
    const custom: string[] = saved ? JSON.parse(saved) : [];
    return [...DEFAULT_INDUSTRIES.slice(0, -1), ...custom, "Other"];
  } catch {
    return DEFAULT_INDUSTRIES;
  }
};

const saveCustomIndustry = (value: string): string[] => {
  try {
    const saved = localStorage.getItem(CUSTOM_INDUSTRIES_KEY);
    const custom: string[] = saved ? JSON.parse(saved) : [];
    if (!custom.includes(value)) {
      custom.push(value);
      localStorage.setItem(CUSTOM_INDUSTRIES_KEY, JSON.stringify(custom));
    }
  } catch {}
  return loadIndustries();
};

const updateCustomIndustry = (oldValue: string, newValue: string): string[] => {
  try {
    const saved = localStorage.getItem(CUSTOM_INDUSTRIES_KEY);
    const custom: string[] = saved ? JSON.parse(saved) : [];
    const idx = custom.indexOf(oldValue);
    if (idx !== -1) { custom[idx] = newValue; }
    localStorage.setItem(CUSTOM_INDUSTRIES_KEY, JSON.stringify(custom));
  } catch {}
  return loadIndustries();
};

const deleteCustomIndustry = (value: string): string[] => {
  try {
    const saved = localStorage.getItem(CUSTOM_INDUSTRIES_KEY);
    const custom: string[] = saved ? JSON.parse(saved) : [];
    localStorage.setItem(CUSTOM_INDUSTRIES_KEY, JSON.stringify(custom.filter((c) => c !== value)));
  } catch {}
  return loadIndustries();
};

export default function BusinessManagement() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.between("sm", "md"));

  const [industries, setIndustries] = useState<string[]>(loadIndustries);
  const [customType, setCustomType] = useState("");
  const [editingCustomType, setEditingCustomType] = useState<{ original: string; value: string } | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState(emptyErrors);
  const [createdBusinessId, setCreatedBusinessId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [searchId, setSearchId] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => { fetchBusinesses(); }, []);

  const fetchBusinesses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/business");
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
    setCustomType("");
    setDialogOpen(true);
  };

  const openEditDialog = (business: Business) => {
    setEditingBusiness(business);
    const knownType = industries.includes(business.businessType);
    setForm({ businessName: business.businessName, businessType: knownType ? business.businessType : "Other", status: business.status, ownerEmail: "", ownerName: "" });
    setCustomType(knownType ? "" : business.businessType);
    setFieldErrors(emptyErrors);
    setDialogOpen(true);
  };

  const validate = () => {
    const errors = { businessName: "", ownerEmail: "", ownerName: "" };
    let valid = true;
    if (!form.businessName.trim()) { errors.businessName = "Business name is required."; valid = false; }
    if (!editingBusiness && !form.ownerEmail.trim()) { errors.ownerEmail = "Owner email is required."; valid = false; }
    if (!editingBusiness && !form.ownerName.trim()) { errors.ownerName = "Owner name is required."; valid = false; }
    setFieldErrors(errors);
    return valid;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    const effectiveType = form.businessType === "Other" && customType.trim()
      ? customType.trim()
      : form.businessType;
    try {
      if (editingBusiness) {
        await api.put(`/business/${editingBusiness.businessId}`, {
          businessName: form.businessName,
          businessType: effectiveType,
          status: form.status,
        });
      } else {
        const res = await api.post("/business", { ...form, businessType: effectiveType });
        const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        setCreatedBusinessId(data?.business?.businessId ?? null);
      }
      if (form.businessType === "Other" && customType.trim()) {
        setIndustries(saveCustomIndustry(customType.trim()));
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
      await api.delete(`/business/${businessId}`);
      setBusinesses((prev) => prev.filter((b) => b.businessId !== businessId));
    } catch {
      setError("Failed to delete business.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSearch = async () => {
    if (!searchId.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await api.get("/business", { params: { businessId: searchId.trim() } });
      const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      const found: Business = data?.business ?? data;
      if (!found?.businessId) { setSearchError("Business not found."); return; }
      setBusinesses((prev) => [found, ...prev.filter((b) => b.businessId !== found.businessId)]);
    } catch {
      setSearchError("Business not found.");
    } finally {
      setSearching(false);
    }
  };

  const handleFieldChange = (field: keyof typeof emptyForm, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (field in fieldErrors)
      setFieldErrors((p) => ({ ...p, [field]: "" }));
  };

  const isFormValid = !!form.businessName.trim()
    && (!!editingBusiness || (!!form.ownerName.trim() && !!form.ownerEmail.trim()))
    && (form.businessType !== "Other" || !!customType.trim());

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

        {/* Search Bar */}
        <Box sx={{ display: "flex", gap: 1, mb: 2.5 }}>
          <TextField
            placeholder="Search by Business ID (e.g. bz-247)"
            value={searchId}
            onChange={(e) => { setSearchId(e.target.value); setSearchError(null); }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            size="small"
            sx={{
              flex: 1,
              "& .MuiOutlinedInput-root": {
                bgcolor: "#111118", borderRadius: "8px", color: "#e0dcf8", fontSize: 13,
                "& fieldset": { borderColor: searchError ? "#ef4444" : "#2a2a35" },
                "&:hover fieldset": { borderColor: searchError ? "#f87171" : "#7c6df0" },
                "&.Mui-focused fieldset": { borderColor: searchError ? "#ef4444" : "#7c6df0" },
              },
              "& input::placeholder": { color: "#555", opacity: 1 },
            }}
          />
          <Button
            onClick={handleSearch}
            disabled={searching || !searchId.trim()}
            variant="outlined"
            startIcon={searching ? <CircularProgress size={14} sx={{ color: "#7c6df0" }} /> : <SearchIcon sx={{ fontSize: 16 }} />}
            sx={{ borderColor: "#2a2a35", color: "#a89cf0", textTransform: "none", fontSize: 13, borderRadius: "8px", whiteSpace: "nowrap", "&:hover": { borderColor: "#7c6df0", bgcolor: "rgba(124,109,240,0.08)" }, "&.Mui-disabled": { borderColor: "#1e1e2e", color: "#444" } }}>
            {searching ? "Searching..." : "Search"}
          </Button>
        </Box>

        {searchError && (
          <Box sx={{ bgcolor: "#1a0808", border: "0.5px solid #5c1a1a", borderRadius: "8px", p: "10px 12px", mb: 2 }}>
            <Typography sx={{ color: "#ef4444", fontSize: 13 }}>{searchError}</Typography>
          </Box>
        )}

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
                    <Typography sx={{ color: "#e0dcf8", fontSize: 14, fontWeight: 600 }}>{b.businessName}</Typography>
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
                  }}>{b.businessType}</Box>
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
                    {["Business ID", "Name", "Business Type", "Status", ...(!isTablet ? ["Created At"] : []), "Actions"].map((h) => (
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
                        {b.businessName}
                      </TableCell>
                      <TableCell sx={{ color: "#c8d0e0", fontSize: 13, borderBottom: "0.5px solid #1e1e2e" }}>
                        {b.businessType}
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

      {/* Success Dialog */}
      <Dialog open={!!createdBusinessId} onClose={() => setCreatedBusinessId(null)} fullWidth maxWidth="xs"
        PaperProps={{ sx: { bgcolor: "#1a1a24", border: "1px solid #32324a", borderRadius: "16px", boxShadow: "0 32px 80px rgba(0,0,0,0.7)", mx: { xs: 2, sm: 3 } } }}>
        <Box sx={{ p: { xs: 3, sm: 4 }, textAlign: "center" }}>
          <CheckCircleOutlineIcon sx={{ color: "#22c55e", fontSize: 48, mb: 1.5 }} />
          <Typography sx={{ color: "#f0eeff", fontSize: 17, fontWeight: 700, mb: 0.5 }}>Business Created!</Typography>
          <Typography sx={{ color: "#a0a0c8", fontSize: 13, mb: 3 }}>Save this Business ID — it's used to link users to this business.</Typography>
          <Box sx={{ bgcolor: "#0d0d0f", border: "1px solid #2a2a35", borderRadius: "10px", p: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 3 }}>
            <Typography sx={{ color: "#a89cf0", fontFamily: "monospace", fontSize: 16, fontWeight: 700, letterSpacing: "0.05em" }}>
              {createdBusinessId}
            </Typography>
            <Tooltip title={copied ? "Copied!" : "Copy ID"}>
              <IconButton size="small" onClick={() => handleCopyId(createdBusinessId!)} sx={{ color: copied ? "#22c55e" : "#7c6df0", "&:hover": { bgcolor: "rgba(124,109,240,0.12)" } }}>
                {copied ? <CheckIcon sx={{ fontSize: 18 }} /> : <ContentCopyIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </Tooltip>
          </Box>
          <Button fullWidth variant="contained" onClick={() => setCreatedBusinessId(null)}
            sx={{ bgcolor: "#5a4fd0", textTransform: "none", fontSize: 14, fontWeight: 600, borderRadius: "10px", "&:hover": { bgcolor: "#6b5fe0" } }}>
            Done
          </Button>
        </Box>
      </Dialog>

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
          {/* Business Name */}
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Business Name</Typography>
            <TextField fullWidth placeholder="e.g. Acme Corp"
              value={form.businessName}
              onChange={(e) => handleFieldChange("businessName", e.target.value)}
              error={!!fieldErrors.businessName}
              InputProps={{ sx: fieldInputSx(!!fieldErrors.businessName) }}
              InputLabelProps={{ shrink: false }}
              sx={{ "& .MuiInputLabel-root": { display: "none" }, "& .MuiFormHelperText-root": { color: "#ef4444", fontSize: 12, mx: 0, mt: 0.6 } }}
              helperText={fieldErrors.businessName} />
          </Box>
          {/* Business Type */}
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Business Type</Typography>
            <Select fullWidth value={form.businessType} onChange={(e) => { handleFieldChange("businessType", e.target.value); setCustomType(""); }}
              sx={fieldInputSx(false)}
              MenuProps={{ PaperProps: { sx: { bgcolor: "#13131e", border: "1px solid #383850", borderRadius: "10px", color: "#f0eeff", mt: 0.5, "& .MuiMenuItem-root": { fontSize: 14, py: 1.2, "&:hover": { bgcolor: "rgba(124,109,240,0.12)" } }, "& .Mui-selected": { bgcolor: "rgba(124,109,240,0.18) !important" } } } } as any}>
              {industries.map((ind) => <MenuItem key={ind} value={ind}>{ind}</MenuItem>)}
            </Select>
            {form.businessType === "Other" && (
              <Box sx={{ mt: 1.5 }}>
                <TextField fullWidth placeholder="e.g. Driving School, Pet Grooming..."
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value)}
                  InputProps={{ sx: fieldInputSx(false) }}
                  InputLabelProps={{ shrink: false }}
                  sx={{ "& .MuiInputLabel-root": { display: "none" } }}
                />
                {customType.trim() && (
                  <Typography sx={{ color: "#7c6df0", fontSize: 11, mt: 0.6 }}>
                    This will be saved as a new business type option for future use.
                  </Typography>
                )}
              </Box>
            )}
            {/* Saved custom types — edit or delete */}
            {(() => {
              const saved = (() => { try { const s = localStorage.getItem(CUSTOM_INDUSTRIES_KEY); return s ? JSON.parse(s) : []; } catch { return []; } })();
              if (!saved.length) return null;
              return (
                <Box sx={{ mt: 1.5, bgcolor: "#0d0d0f", border: "0.5px solid #2a2a35", borderRadius: "8px", p: "10px 12px" }}>
                  <Typography sx={{ color: "#555", fontSize: 11, mb: 1, textTransform: "uppercase", letterSpacing: "0.08em" }}>Saved Custom Types</Typography>
                  {saved.map((t: string) => (
                    <Box key={t} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.8 }}>
                      {editingCustomType?.original === t ? (
                        <>
                          <TextField
                            size="small"
                            value={editingCustomType.value}
                            onChange={(e) => setEditingCustomType({ original: t, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editingCustomType.value.trim()) {
                                setIndustries(updateCustomIndustry(t, editingCustomType.value.trim()));
                                if (form.businessType === t) handleFieldChange("businessType", editingCustomType.value.trim());
                                setEditingCustomType(null);
                              }
                              if (e.key === "Escape") setEditingCustomType(null);
                            }}
                            autoFocus
                            sx={{ flex: 1, "& .MuiOutlinedInput-root": { bgcolor: "#1a1a28", color: "#fff", fontSize: 13, "& fieldset": { borderColor: "#7c6df0" } } }}
                          />
                          <IconButton size="small"
                            onClick={() => {
                              if (editingCustomType.value.trim()) {
                                setIndustries(updateCustomIndustry(t, editingCustomType.value.trim()));
                                if (form.businessType === t) handleFieldChange("businessType", editingCustomType.value.trim());
                                setEditingCustomType(null);
                              }
                            }}
                            sx={{ color: "#22c55e", "&:hover": { bgcolor: "rgba(34,197,94,0.1)" } }}>
                            <CheckIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </>
                      ) : (
                        <>
                          <Typography sx={{ flex: 1, color: "#e0dcf8", fontSize: 13 }}>{t}</Typography>
                          <IconButton size="small" onClick={() => setEditingCustomType({ original: t, value: t })}
                            sx={{ color: "#7c6df0", "&:hover": { bgcolor: "rgba(124,109,240,0.12)" } }}>
                            <EditOutlinedIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                          <IconButton size="small" onClick={() => {
                            setIndustries(deleteCustomIndustry(t));
                            if (form.businessType === t) handleFieldChange("businessType", "Other");
                          }}
                            sx={{ color: "#ef4444", "&:hover": { bgcolor: "rgba(239,68,68,0.1)" } }}>
                            <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                        </>
                      )}
                    </Box>
                  ))}
                </Box>
              );
            })()}
          </Box>
          {/* Owner fields — only on create */}
          {!editingBusiness && (
            <>
              <Box sx={{ mb: 2.5 }}>
                <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Owner Name</Typography>
                <TextField fullWidth placeholder="e.g. Jane Smith"
                  value={form.ownerName}
                  onChange={(e) => handleFieldChange("ownerName", e.target.value)}
                  error={!!fieldErrors.ownerName}
                  InputProps={{ sx: fieldInputSx(!!fieldErrors.ownerName) }}
                  InputLabelProps={{ shrink: false }}
                  sx={{ "& .MuiInputLabel-root": { display: "none" }, "& .MuiFormHelperText-root": { color: "#ef4444", fontSize: 12, mx: 0, mt: 0.6 } }}
                  helperText={fieldErrors.ownerName} />
              </Box>
              <Box sx={{ mb: 2.5 }}>
                <Typography sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}>Owner Email</Typography>
                <TextField fullWidth placeholder="e.g. jane@acme.com"
                  value={form.ownerEmail}
                  onChange={(e) => handleFieldChange("ownerEmail", e.target.value)}
                  error={!!fieldErrors.ownerEmail}
                  InputProps={{ sx: fieldInputSx(!!fieldErrors.ownerEmail) }}
                  InputLabelProps={{ shrink: false }}
                  sx={{ "& .MuiInputLabel-root": { display: "none" }, "& .MuiFormHelperText-root": { color: "#ef4444", fontSize: 12, mx: 0, mt: 0.6 } }}
                  helperText={fieldErrors.ownerEmail} />
              </Box>
            </>
          )}
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
            disabled={submitting || !isFormValid}
            variant="contained"
            sx={{ bgcolor: "#a78bfa", textTransform: "none", fontSize: 14, fontWeight: 600, borderRadius: "10px", px: 3, flexGrow: 1, "&:hover": { bgcolor: "#b89ffb" }, "&.Mui-disabled": { bgcolor: "#3d2d60", color: "#f0eef3" } }}>
            {submitting ? <CircularProgress size={16} sx={{ color: "#a89cf0" }} /> : editingBusiness ? "Save Changes" : "Create Business"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
