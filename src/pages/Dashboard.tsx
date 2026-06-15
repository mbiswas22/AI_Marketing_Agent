import { useRef, useState } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  CircularProgress,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LogoutIcon from "@mui/icons-material/Logout";
import HistoryIcon from "@mui/icons-material/History";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import { generateCaption } from "../services/api";

const inputSx = {
  "& .MuiOutlinedInput-root": {
    color: "#fff",
    bgcolor: "#0f0f0f",
    borderRadius: 2,
    "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
    "&:hover fieldset": { borderColor: "#8b5cf6" },
    "&.Mui-focused fieldset": { borderColor: "#8b5cf6" },
  },
  "& .MuiInputBase-input::placeholder": { color: "#444", opacity: 1 },
};

const cardSx = {
  bgcolor: "#161616",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 3,
  p: 3,
  mb: 3,
};

export default function Dashboard() {
  const { user, signOut } = useAuthenticator();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [caption, setCaption] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = () => {
    signOut();
    navigate("/login");
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setCaption(null);
    setHashtags([]);
    try {
      const response = await generateCaption(prompt);
      setCaption(response.data.caption);
      setHashtags(response.data.hashtags ?? []);
    } catch {
      setError("Failed to generate content. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
            onClick={() => navigate("/history")}
            startIcon={<HistoryIcon />}
            sx={{
              color: "#64748b",
              textTransform: "none",
              fontSize: 14,
              "&:hover": { color: "#fff" },
            }}
          >
            History
          </Button>
          <Typography sx={{ color: "#475569", fontSize: 13 }}>
            {user?.username}
          </Typography>
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
              "&:hover": {
                borderColor: "#a78bfa",
                color: "#a78bfa",
                bgcolor: "rgba(139,92,246,0.08)",
              },
            }}
          >
            Sign Out
          </Button>
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ maxWidth: 700, mx: "auto", px: { xs: 2, sm: 3 }, py: 6 }}>
        <Typography
          variant="h4"
          sx={{ color: "#fff", fontWeight: 800, mb: 0.5 }}
        >
          Generate Content
        </Typography>
        <Typography sx={{ color: "#475569", mb: 5, fontSize: 15 }}>
          Describe what you need or provide a source — AI handles the rest.
        </Typography>

        {/* Prompt */}
        <Paper elevation={0} sx={cardSx}>
          <Typography
            sx={{
              color: "#cbd5e1",
              fontWeight: 600,
              mb: 1.5,
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Prompt
          </Typography>
          <TextField
            multiline
            rows={4}
            fullWidth
            placeholder="e.g. Write a Facebook ad for our new summer sneaker collection targeting 18–30 year olds..."
            variant="outlined"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            sx={inputSx}
          />
        </Paper>

        {/* URL */}
        <Paper elevation={0} sx={cardSx}>
          <Typography
            sx={{
              color: "#cbd5e1",
              fontWeight: 600,
              mb: 1.5,
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Website URL
          </Typography>
          <TextField
            fullWidth
            placeholder="https://yourwebsite.com"
            variant="outlined"
            sx={inputSx}
          />
        </Paper>

        {/* File upload */}
        <Paper elevation={0} sx={cardSx}>
          <Typography
            sx={{
              color: "#cbd5e1",
              fontWeight: 600,
              mb: 2,
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Upload Image
          </Typography>
          <Box
            onClick={() => fileRef.current?.click()}
            sx={{
              border: "1px dashed rgba(139,92,246,0.4)",
              borderRadius: 2,
              p: 3,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
              cursor: "pointer",
              transition: "border-color 0.2s, background 0.2s",
              "&:hover": {
                borderColor: "#8b5cf6",
                bgcolor: "rgba(139,92,246,0.05)",
              },
            }}
          >
            {fileName ? (
              <>
                <InsertDriveFileIcon sx={{ color: "#8b5cf6", fontSize: 28 }} />
                <Typography sx={{ color: "#a78bfa", fontSize: 14 }}>
                  {fileName}
                </Typography>
              </>
            ) : (
              <>
                <UploadFileIcon sx={{ color: "#8b5cf6", fontSize: 28 }} />
                <Typography sx={{ color: "#64748b", fontSize: 14 }}>
                  Click to upload or drag & drop
                </Typography>
                <Typography sx={{ color: "#334155", fontSize: 12 }}>
                  PNG, JPG, WEBP up to 10MB
                </Typography>
              </>
            )}
          </Box>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </Paper>

        {/* Generate */}
        <Button
          fullWidth
          variant="contained"
          size="large"
          disabled={loading || !prompt.trim()}
          startIcon={
            loading ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              <AutoFixHighIcon />
            )
          }
          onClick={handleGenerate}
          sx={{
            bgcolor: "#7c3aed",
            py: 1.8,
            borderRadius: 3,
            fontSize: 16,
            fontWeight: 700,
            textTransform: "none",
            boxShadow: "0 0 24px rgba(124,58,237,0.35)",
            "&:hover": {
              bgcolor: "#6d28d9",
              boxShadow: "0 0 32px rgba(124,58,237,0.5)",
            },
            "&.Mui-disabled": { bgcolor: "#3b1f6e", color: "#7c5cbf" },
          }}
        >
          {loading ? "Generating..." : "Generate"}
        </Button>

        {/* Result */}
        {error && (
          <Paper
            elevation={0}
            sx={{ ...cardSx, mt: 3, borderColor: "rgba(239,68,68,0.3)" }}
          >
            <Typography sx={{ color: "#ef4444", fontSize: 14 }}>
              {error}
            </Typography>
          </Paper>
        )}
        {caption && (
          <Paper
            elevation={0}
            sx={{ ...cardSx, mt: 3, borderColor: "rgba(139,92,246,0.3)" }}
          >
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}
            >
              <AutoAwesomeIcon sx={{ color: "#8b5cf6", fontSize: 18 }} />
              <Typography
                sx={{
                  color: "#cbd5e1",
                  fontWeight: 600,
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                Generated Caption
              </Typography>
            </Box>
            <Typography
              sx={{
                color: "#e2e8f0",
                fontSize: 15,
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
              }}
            >
              {caption}
            </Typography>
            {hashtags.length > 0 && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2 }}>
                {hashtags.map((tag) => (
                  <Typography
                    key={tag}
                    sx={{
                      color: "#8b5cf6",
                      fontSize: 13,
                      bgcolor: "rgba(139,92,246,0.1)",
                      px: 1.5,
                      py: 0.5,
                      borderRadius: 5,
                    }}
                  >
                    {tag}
                  </Typography>
                ))}
              </Box>
            )}
          </Paper>
        )}
      </Box>
    </Box>
  );
}
