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
import PeopleIcon from "@mui/icons-material/People";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import { getUsers, createUser, deleteUser, updateUser } from "../services/api";
import type { User } from "../services/api";
import { sendUserInvite } from "../services/inviteService";

const HARDCODED_BUSINESS_ID = "BUS001";

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
  "& .MuiSelect-select": {
    color: "#ffffff",
    fontSize: 14,
    py: "13px",
    px: "14px",
  },
  "& .MuiSvgIcon-root": { color: "#9090c0" },
});

const emptyErrors = { email: "", displayName: "", businessId: "" };

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

interface UserManagementPanelProps {
  businessId?: string;
  businessName?: string;
}

export function UserManagementPanel({
  businessId,
  businessName,
}: UserManagementPanelProps) {
  const effectiveBusinessId = businessId ?? HARDCODED_BUSINESS_ID;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.between("sm", "md"));

  const emptyForm = {
    email: "",
    displayName: "",
    role: "VIEWER",
    businessId: effectiveBusinessId,
    phoneNumber: "",
  };

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState(emptyErrors);

  useEffect(() => {
    fetchUsers();
  }, [effectiveBusinessId]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await getUsers(effectiveBusinessId));
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setFieldErrors(emptyErrors);
    setDialogOpen(true);
  };

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setForm({
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      businessId: user.businessId,
      phoneNumber: (user as any).phoneNumber ?? "",
    });
    setFieldErrors(emptyErrors);
    setDialogOpen(true);
  };

  const validate = () => {
    const errors = { email: "", displayName: "", businessId: "" };
    let valid = true;
    if (!form.email.trim()) {
      errors.email = "Email is required.";
      valid = false;
    } else if (!validateEmail(form.email)) {
      errors.email = "Enter a valid email address.";
      valid = false;
    }
    if (!form.displayName.trim()) {
      errors.displayName = "Display name is required.";
      valid = false;
    }
    if (!form.businessId.trim()) {
      errors.businessId = "Business ID is required.";
      valid = false;
    }
    setFieldErrors(errors);
    return valid;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.userId, {
          ...form,
          phoneNumber: form.phoneNumber || undefined,
        });
      } else {
        // Creating user should not take current user id
        // const attrs = await getUserAttributes();
        // const userId =
        //   (attrs as any)?.sub ??
        //   "USR-" + Math.random().toString(36).slice(2, 8).toUpperCase();
        const token = crypto.randomUUID();
        const userId = token;
        await createUser({
          ...form,
          userId,
          phoneNumber: form.phoneNumber || undefined,
        });
        await sendUserInvite({
          businessId: effectiveBusinessId,
          businessName: businessName ?? effectiveBusinessId,
          userName: form.displayName,
          userId,
          role: form.role,
          userEmail: form.email,
          userPhoneNumber: form.phoneNumber || undefined,
        });
      }
      setDialogOpen(false);
      await fetchUsers();
    } catch {
      setError(
        editingUser ? "Failed to update user." : "Failed to create user.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (userId: string) => {
    setDeletingId(userId);
    try {
      await deleteUser(effectiveBusinessId, userId);
      setUsers((prev) => prev.filter((u) => u.userId !== userId));
    } catch {
      setError("Failed to delete user.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleFieldChange = (field: keyof typeof emptyForm, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (fieldErrors[field as keyof typeof fieldErrors])
      setFieldErrors((p) => ({ ...p, [field]: "" }));
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        <Button
          variant="contained"
          onClick={openAddDialog}
          startIcon={<PersonAddAltIcon sx={{ fontSize: 16 }} />}
          sx={{
            bgcolor: "#5a4fd0",
            textTransform: "none",
            fontSize: 13,
            borderRadius: "8px",
            "&:hover": { bgcolor: "#6b5fe0" },
          }}
        >
          Add User
        </Button>
      </Box>

      {error && (
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
            {error}
          </Typography>
        </Box>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
          <CircularProgress sx={{ color: "#7c6df0" }} />
        </Box>
      ) : users.length === 0 ? (
        <Box
          sx={{
            border: "0.5px solid #2a2a35",
            borderRadius: "10px",
            p: 4,
            textAlign: "center",
          }}
        >
          <Typography sx={{ color: "#555", fontSize: 13 }}>
            No users found.
          </Typography>
        </Box>
      ) : isMobile ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {users.map((user) => (
            <Box
              key={user.userId}
              sx={{
                border: "0.5px solid #2a2a35",
                borderRadius: "10px",
                bgcolor: "#111118",
                p: 2,
                "&:hover": { borderColor: "rgba(124,109,240,0.4)" },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  mb: 1,
                }}
              >
                <Box>
                  <Typography
                    sx={{ color: "#e0dcf8", fontSize: 14, fontWeight: 600 }}
                  >
                    {user.displayName}
                  </Typography>
                  <Typography sx={{ color: "#8090a8", fontSize: 12, mt: 0.3 }}>
                    {user.email}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 0.5 }}>
                  <IconButton
                    size="small"
                    onClick={() => openEditDialog(user)}
                    sx={{
                      color: "#7c6df0",
                      "&:hover": { bgcolor: "rgba(124,109,240,0.12)" },
                    }}
                  >
                    <EditOutlinedIcon sx={{ fontSize: 17 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleDelete(user.userId)}
                    disabled={deletingId === user.userId}
                    sx={{
                      color: "#ef4444",
                      "&:hover": { bgcolor: "rgba(239,68,68,0.1)" },
                      "&.Mui-disabled": { color: "#5a2020" },
                    }}
                  >
                    {deletingId === user.userId ? (
                      <CircularProgress size={14} sx={{ color: "#ef4444" }} />
                    ) : (
                      <DeleteOutlineIcon sx={{ fontSize: 17 }} />
                    )}
                  </IconButton>
                </Box>
              </Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  flexWrap: "wrap",
                }}
              >
                <Box
                  sx={{
                    px: "8px",
                    py: "2px",
                    borderRadius: "20px",
                    fontSize: 11,
                    fontWeight: 600,
                    bgcolor:
                      user.role === "ADMIN"
                        ? "rgba(139,92,246,0.15)"
                        : "rgba(124,109,240,0.1)",
                    color: user.role === "ADMIN" ? "#a78bfa" : "#7c6df0",
                    border: `0.5px solid ${user.role === "ADMIN" ? "rgba(139,92,246,0.3)" : "rgba(124,109,240,0.25)"}`,
                  }}
                >
                  {user.role}
                </Box>
                <Box
                  sx={{
                    px: "8px",
                    py: "2px",
                    borderRadius: "20px",
                    fontSize: 11,
                    fontWeight: 600,
                    bgcolor:
                      user.status === "ACTIVE"
                        ? "rgba(34,197,94,0.1)"
                        : "rgba(100,116,139,0.1)",
                    color: user.status === "ACTIVE" ? "#22c55e" : "#64748b",
                    border: `0.5px solid ${user.status === "ACTIVE" ? "rgba(34,197,94,0.25)" : "rgba(100,116,139,0.25)"}`,
                  }}
                >
                  {user.status}
                </Box>
                <Typography sx={{ color: "#6070a0", fontSize: 11, ml: "auto" }}>
                  {new Date(user.createdAt).toLocaleDateString()}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      ) : (
        <Box
          sx={{
            border: "0.5px solid #2a2a35",
            borderRadius: "10px",
            overflow: "hidden",
          }}
        >
          <Box sx={{ overflowX: "auto" }}>
            <Table sx={{ minWidth: isTablet ? 500 : 650 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: "#141418" }}>
                  {[
                    "Display Name",
                    "Email",
                    "Role",
                    "Status",
                    ...(!isTablet ? ["Created At"] : []),
                    "Actions",
                  ].map((h) => (
                    <TableCell
                      key={h}
                      sx={{
                        color: "#c0c0d8",
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        borderBottom: "0.5px solid #2a2a35",
                        py: 1.5,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow
                    key={user.userId}
                    sx={{
                      "&:hover": { bgcolor: "rgba(124,109,240,0.04)" },
                      "&:last-child td": { borderBottom: "none" },
                    }}
                  >
                    <TableCell
                      sx={{
                        color: "#e0dcf8",
                        fontSize: 13,
                        borderBottom: "0.5px solid #1e1e2e",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {user.displayName}
                    </TableCell>
                    <TableCell
                      sx={{
                        color: "#c8d0e0",
                        fontSize: 13,
                        borderBottom: "0.5px solid #1e1e2e",
                        maxWidth: isTablet ? 140 : "none",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
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
                          bgcolor:
                            user.role === "ADMIN"
                              ? "rgba(139,92,246,0.15)"
                              : "rgba(124,109,240,0.1)",
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
                          bgcolor:
                            user.status === "ACTIVE"
                              ? "rgba(34,197,94,0.1)"
                              : "rgba(100,116,139,0.1)",
                          color:
                            user.status === "ACTIVE" ? "#22c55e" : "#64748b",
                          border: `0.5px solid ${user.status === "ACTIVE" ? "rgba(34,197,94,0.25)" : "rgba(100,116,139,0.25)"}`,
                        }}
                      >
                        {user.status}
                      </Box>
                    </TableCell>
                    {!isTablet && (
                      <TableCell
                        sx={{
                          color: "#a0b0c8",
                          fontSize: 12,
                          borderBottom: "0.5px solid #1e1e2e",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                    )}
                    <TableCell sx={{ borderBottom: "0.5px solid #1e1e2e" }}>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        <Tooltip title="Edit user" placement="top">
                          <IconButton
                            size="small"
                            onClick={() => openEditDialog(user)}
                            sx={{
                              color: "#7c6df0",
                              "&:hover": {
                                bgcolor: "rgba(124,109,240,0.12)",
                                color: "#a89cf0",
                              },
                            }}
                          >
                            <EditOutlinedIcon sx={{ fontSize: 17 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete user" placement="top">
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(user.userId)}
                            disabled={deletingId === user.userId}
                            sx={{
                              color: "#ef4444",
                              "&:hover": {
                                bgcolor: "rgba(239,68,68,0.1)",
                                color: "#f87171",
                              },
                              "&.Mui-disabled": { color: "#5a2020" },
                            }}
                          >
                            {deletingId === user.userId ? (
                              <CircularProgress
                                size={14}
                                sx={{ color: "#ef4444" }}
                              />
                            ) : (
                              <DeleteOutlineIcon sx={{ fontSize: 17 }} />
                            )}
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

      {/* Add / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            bgcolor: "#1a1a24",
            border: "1px solid #32324a",
            borderRadius: "16px",
            boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
            mx: { xs: 2, sm: 3 },
            width: { xs: "calc(100% - 32px)", sm: "100%" },
          },
        }}
      >
        <Box
          sx={{
            px: { xs: 3, sm: 4 },
            pt: 3.5,
            pb: 2,
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Box
            sx={{
              bgcolor: "rgba(124,109,240,0.18)",
              borderRadius: "12px",
              p: "10px",
              display: "flex",
              border: "1px solid rgba(124,109,240,0.25)",
            }}
          >
            {editingUser ? (
              <EditOutlinedIcon sx={{ color: "#5140d0", fontSize: 22 }} />
            ) : (
              <PersonAddAltIcon sx={{ color: "#5140d0", fontSize: 22 }} />
            )}
          </Box>
          <Box>
            <Typography
              sx={{
                color: "#5140d0",
                fontSize: 17,
                fontWeight: 700,
                lineHeight: 1.3,
              }}
            >
              {editingUser ? "Edit User" : "Add New User"}
            </Typography>
            <Typography sx={{ color: "#a0a0c8", fontSize: 12.5, mt: 0.3 }}>
              {editingUser
                ? `Editing: ${editingUser.email}`
                : "Enter the details for the new team member."}
            </Typography>
          </Box>
        </Box>
        <Divider sx={{ borderColor: "#2e2e42" }} />
        <DialogContent
          sx={{ px: { xs: 3, sm: 4 }, pt: "24px !important", pb: 2 }}
        >
          <Box sx={{ mb: 2.5 }}>
            <Typography
              sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}
            >
              Email Address
            </Typography>
            <TextField
              type="email"
              fullWidth
              placeholder="user@example.com"
              value={form.email}
              onChange={(e) => handleFieldChange("email", e.target.value)}
              error={!!fieldErrors.email}
              InputProps={{ sx: fieldInputSx(!!fieldErrors.email) }}
              InputLabelProps={{ shrink: false }}
              sx={{
                "& .MuiInputLabel-root": { display: "none" },
                "& .MuiFormHelperText-root": {
                  color: "#ef4444",
                  fontSize: 12,
                  mx: 0,
                  mt: 0.6,
                },
              }}
              helperText={fieldErrors.email}
            />
          </Box>
          <Box sx={{ mb: 2.5 }}>
            <Typography
              sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}
            >
              Display Name
            </Typography>
            <TextField
              fullWidth
              placeholder="e.g. Jane Smith"
              value={form.displayName}
              onChange={(e) => handleFieldChange("displayName", e.target.value)}
              error={!!fieldErrors.displayName}
              InputProps={{ sx: fieldInputSx(!!fieldErrors.displayName) }}
              InputLabelProps={{ shrink: false }}
              sx={{
                "& .MuiInputLabel-root": { display: "none" },
                "& .MuiFormHelperText-root": {
                  color: "#ef4444",
                  fontSize: 12,
                  mx: 0,
                  mt: 0.6,
                },
              }}
              helperText={fieldErrors.displayName}
            />
          </Box>
          <Box sx={{ mb: 2.5 }}>
            <Typography
              sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}
            >
              Role
            </Typography>
            <Select
              fullWidth
              value={form.role}
              onChange={(e) => handleFieldChange("role", e.target.value)}
              displayEmpty
              sx={fieldInputSx(false)}
              MenuProps={
                {
                  PaperProps: {
                    sx: {
                      bgcolor: "#13131e",
                      border: "1px solid #383850",
                      borderRadius: "10px",
                      color: "#f0eeff",
                      mt: 0.5,
                      "& .MuiMenuItem-root": {
                        fontSize: 14,
                        py: 1.2,
                        "&:hover": { bgcolor: "rgba(124,109,240,0.12)" },
                      },
                      "& .Mui-selected": {
                        bgcolor: "rgba(124,109,240,0.18) !important",
                      },
                    },
                  },
                } as any
              }
            >
              <MenuItem value="VIEWER">VIEWER</MenuItem>
              <MenuItem value="EDITOR">EDITOR</MenuItem>
              <MenuItem value="ADMIN">ADMIN</MenuItem>
            </Select>
          </Box>
          <Box sx={{ mb: 2.5 }}>
            <Typography
              sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}
            >
              Business ID
            </Typography>
            <TextField
              fullWidth
              placeholder="e.g. BUS001"
              value={form.businessId}
              onChange={(e) => handleFieldChange("businessId", e.target.value)}
              error={!!fieldErrors.businessId}
              InputProps={{ sx: fieldInputSx(!!fieldErrors.businessId) }}
              InputLabelProps={{ shrink: false }}
              sx={{
                "& .MuiInputLabel-root": { display: "none" },
                "& .MuiFormHelperText-root": {
                  color: "#ef4444",
                  fontSize: 12,
                  mx: 0,
                  mt: 0.6,
                },
              }}
              helperText={fieldErrors.businessId}
            />
          </Box>
          <Box sx={{ mb: 1 }}>
            <Typography
              sx={{ color: "#5140d0", fontSize: 13, fontWeight: 600, mb: 0.8 }}
            >
              Phone Number{" "}
              <span style={{ color: "#6060a0", fontWeight: 400 }}>
                (optional)
              </span>
            </Typography>
            <TextField
              fullWidth
              placeholder="e.g. +1 555 000 0000"
              value={form.phoneNumber}
              onChange={(e) => handleFieldChange("phoneNumber", e.target.value)}
              InputProps={{ sx: fieldInputSx(false) }}
              InputLabelProps={{ shrink: false }}
              sx={{ "& .MuiInputLabel-root": { display: "none" } }}
            />
          </Box>
        </DialogContent>
        <Divider sx={{ borderColor: "#2e2e42" }} />
        <DialogActions sx={{ px: { xs: 3, sm: 4 }, py: 2.5, gap: 1.5 }}>
          <Button
            onClick={() => setDialogOpen(false)}
            sx={{
              color: "#7070a0",
              textTransform: "none",
              fontSize: 14,
              borderRadius: "10px",
              px: 2.5,
              border: "1px solid #44445a",
              "&:hover": {
                bgcolor: "rgba(255,255,255,0.06)",
                borderColor: "#7070a0",
              },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              (!editingUser &&
                (!form.email.trim() ||
                  !form.displayName.trim() ||
                  !form.businessId.trim()))
            }
            variant="contained"
            sx={{
              bgcolor: "#a78bfa",
              textTransform: "none",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: "10px",
              px: 3,
              flexGrow: 1,
              "&:hover": { bgcolor: "#b89ffb" },
              "&.Mui-disabled": { bgcolor: "#3d2d60", color: "#f0eef3" },
            }}
          >
            {submitting ? (
              <CircularProgress size={16} sx={{ color: "#a89cf0" }} />
            ) : editingUser ? (
              "Save Changes"
            ) : (
              "Create User"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function UserManagement() {
  const navigate = useNavigate();
  return (
    <Box
      sx={{
        height: "100vh",
        bgcolor: "#0d0d0f",
        display: "flex",
        flexDirection: "column",
      }}
    >
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
      <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 2, sm: 3, md: 4 } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
          <PeopleIcon sx={{ color: "#7c6df0", fontSize: 24 }} />
          <Typography sx={{ color: "#f0eeff", fontSize: 20, fontWeight: 600 }}>
            User Management
          </Typography>
        </Box>
        <UserManagementPanel />
      </Box>
    </Box>
  );
}
