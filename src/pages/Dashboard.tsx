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
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LogoutIcon from "@mui/icons-material/Logout";
import HistoryIcon from "@mui/icons-material/History";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import ArticleIcon from "@mui/icons-material/Article";
import StyleIcon from "@mui/icons-material/Style";
import CheckroomIcon from "@mui/icons-material/Checkroom";
import ImageIcon from "@mui/icons-material/Image";
import CampaignIcon from "@mui/icons-material/Campaign";
import EmailIcon from "@mui/icons-material/Email";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import CodeIcon from "@mui/icons-material/Code";
import TextSnippetIcon from "@mui/icons-material/TextSnippet";
import TableChartIcon from "@mui/icons-material/TableChart";
import DownloadIcon from "@mui/icons-material/Download";
import FacebookIcon from "@mui/icons-material/Facebook";
import InstagramIcon from "@mui/icons-material/Instagram";
import YouTubeIcon from "@mui/icons-material/YouTube";
import LinkedInIcon from "@mui/icons-material/LinkedIn";

const DEMO_BUSINESSES = ["My Business", "Acme Corp", "Green Leaf Cafe"];

const CONTENT_TYPES = [
  {
    id: "flyer",
    label: "Flyer",
    description: "Eye-catching promotional flyer",
    icon: <StyleIcon />,
    placeholder: "e.g. Design a flyer for a weekend sale — 30% off all items, bright colours, bold text...",
  },
  {
    id: "blog",
    label: "Blog Post",
    description: "Long-form article or write-up",
    icon: <ArticleIcon />,
    placeholder: "e.g. Write a 500-word blog post about the benefits of sustainable fashion for Gen Z...",
  },
  {
    id: "merchandise",
    label: "Merchandise Concept",
    description: "Product & merch design ideas",
    icon: <CheckroomIcon />,
    placeholder: "e.g. Suggest merchandise concepts for a streetwear brand targeting skaters aged 16–25...",
  },
  {
    id: "image",
    label: "Image",
    description: "AI-generated marketing image",
    icon: <ImageIcon />,
    placeholder: "e.g. Generate a vibrant product image for a new energy drink targeting athletes...",
  },
  {
    id: "email",
    label: "Email",
    description: "Email campaign copy",
    icon: <EmailIcon />,
    placeholder: "e.g. Write a promotional email for a 48-hour flash sale with a 20% discount code...",
  },
  {
    id: "video",
    label: "Video Script",
    description: "Video or reel script",
    icon: <VideoLibraryIcon />,
    placeholder: "e.g. Write a 30-second video script for an Instagram reel promoting a new coffee blend...",
  },
  {
    id: "campaign",
    label: "Ad Campaign",
    description: "Full ad campaign copy",
    icon: <CampaignIcon />,
    placeholder: "e.g. Create a Facebook ad campaign for a new summer sneaker collection targeting 18–30 year olds...",
  },
];

const OUTPUT_FORMATS = [
  { value: "pdf",  label: "PDF",        icon: <PictureAsPdfIcon fontSize="small" /> },
  { value: "docx", label: "Word",       icon: <TextSnippetIcon fontSize="small" /> },
  { value: "txt",  label: "Plain Text", icon: <TextSnippetIcon fontSize="small" /> },
  { value: "html", label: "HTML",       icon: <CodeIcon fontSize="small" /> },
  { value: "csv",  label: "CSV",        icon: <TableChartIcon fontSize="small" /> },
  { value: "jpeg", label: "JPEG",       icon: <ImageIcon fontSize="small" /> },
];

const SOCIAL_PLATFORMS = [
  { value: "facebook",  label: "Facebook",  icon: <FacebookIcon />,  color: "#1877f2" },
  { value: "instagram", label: "Instagram", icon: <InstagramIcon />, color: "#e1306c" },
  { value: "youtube",   label: "YouTube",   icon: <YouTubeIcon />,   color: "#ff0000" },
  { value: "linkedin",  label: "LinkedIn",  icon: <LinkedInIcon />,  color: "#0a66c2" },
];

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
  "& .MuiInputLabel-root": { color: "#64748b" },
  "& .MuiInputLabel-root.Mui-focused": { color: "#8b5cf6" },
  "& .MuiSelect-icon": { color: "#64748b" },
};

const cardSx = {
  bgcolor: "#161616",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 3,
  p: 3,
  mb: 3,
};

const labelSx = {
  color: "#cbd5e1",
  fontWeight: 600,
  mb: 1.5,
  fontSize: 13,
  textTransform: "uppercase" as const,
  letterSpacing: 1,
};

export default function Dashboard() {
  const { user, signOut } = useAuthenticator();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [business, setBusiness] = useState(DEMO_BUSINESSES[0]);
  const [customBusiness, setCustomBusiness] = useState("");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [outputFormat, setOutputFormat] = useState("txt");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [caption, setCaption] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = business === "__custom__";
  const effectiveBusiness = isCustom ? customBusiness : business;

  const activePlaceholder =
    CONTENT_TYPES.find((t) => t.id === selectedType)?.placeholder ??
    "e.g. Write a Facebook ad for our new summer sneaker collection targeting 18–30 year olds...";

  const handleSignOut = () => { signOut(); navigate("/login"); };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setCaption(null);
    setHashtags([]);
    try {
      // Replace with real API call
      await new Promise((res) => setTimeout(res, 1500));
      setCaption(`Generated content for "${effectiveBusiness}" — ${selectedType ?? "general"} type.\n\n${prompt}`);
      setHashtags(["#marketing", "#AI", "#content"]);
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
            sx={{ color: "#64748b", textTransform: "none", fontSize: 14, "&:hover": { color: "#fff" } }}
          >
            History
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
      <Box sx={{ maxWidth: 700, mx: "auto", px: { xs: 2, sm: 3 }, py: 6 }}>
        <Typography variant="h4" sx={{ color: "#fff", fontWeight: 800, mb: 0.5 }}>
          Generate Content
        </Typography>
        <Typography sx={{ color: "#475569", mb: 5, fontSize: 15 }}>
          Describe what you need or provide a source — AI handles the rest.
        </Typography>

        {/* Business */}
        <Paper elevation={0} sx={cardSx}>
          <Typography sx={labelSx}>Business</Typography>
          <FormControl fullWidth sx={{ ...inputSx, mb: isCustom ? 2 : 0 }}>
            <InputLabel sx={{ color: "#64748b" }}>Select your business</InputLabel>
            <Select
              value={business}
              label="Select your business"
              onChange={(e) => setBusiness(e.target.value)}
              sx={{
                color: "#fff", bgcolor: "#0f0f0f", borderRadius: 2,
                "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.1)" },
                "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#8b5cf6" },
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#8b5cf6" },
                "& .MuiSvgIcon-root": { color: "#64748b" },
              }}
              MenuProps={{ PaperProps: { sx: { bgcolor: "#1e1e1e", color: "#fff" } } }}
            >
              {DEMO_BUSINESSES.map((b) => (
                <MenuItem key={b} value={b} sx={{ "&:hover": { bgcolor: "rgba(139,92,246,0.1)" } }}>{b}</MenuItem>
              ))}
              <MenuItem value="__custom__" sx={{ color: "#8b5cf6", "&:hover": { bgcolor: "rgba(139,92,246,0.1)" } }}>
                + Type a different business
              </MenuItem>
            </Select>
          </FormControl>
          {isCustom && (
            <TextField
              fullWidth
              placeholder="Enter your business name"
              variant="outlined"
              value={customBusiness}
              onChange={(e) => setCustomBusiness(e.target.value)}
              sx={inputSx}
            />
          )}
        </Paper>

        {/* Content Type */}
        <Paper elevation={0} sx={cardSx}>
          <Typography sx={labelSx}>Content Type</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5 }}>
            {CONTENT_TYPES.map((type) => {
              const active = selectedType === type.id;
              return (
                <Box
                  key={type.id}
                  onClick={() => setSelectedType(active ? null : type.id)}
                  sx={{
                    border: active ? "1px solid #8b5cf6" : "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 2,
                    p: 2,
                    cursor: "pointer",
                    bgcolor: active ? "rgba(139,92,246,0.12)" : "#0f0f0f",
                    transition: "all 0.18s",
                    display: "flex",
                    flexDirection: "column",
                    gap: 0.75,
                    "&:hover": { borderColor: "#8b5cf6", bgcolor: "rgba(139,92,246,0.07)" },
                  }}
                >
                  <Box sx={{ color: active ? "#a78bfa" : "#475569", display: "flex" }}>
                    {type.icon}
                  </Box>
                  <Typography sx={{ color: active ? "#e2e8f0" : "#94a3b8", fontWeight: 600, fontSize: 14 }}>
                    {type.label}
                  </Typography>
                  <Typography sx={{ color: "#475569", fontSize: 12, lineHeight: 1.4 }}>
                    {type.description}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Paper>

        {/* Output Format */}
        <Paper elevation={0} sx={cardSx}>
          <Typography sx={labelSx}>Output Format</Typography>
          <ToggleButtonGroup
            value={outputFormat}
            exclusive
            onChange={(_, val) => { if (val) setOutputFormat(val); }}
            sx={{ flexWrap: "wrap", gap: 1 }}
          >
            {OUTPUT_FORMATS.map(({ value, label, icon }) => (
              <ToggleButton
                key={value}
                value={value}
                sx={{
                  color: "#64748b",
                  border: "1px solid rgba(255,255,255,0.1) !important",
                  borderRadius: "8px !important",
                  px: 2, py: 1, gap: 0.75,
                  textTransform: "none",
                  fontSize: 14,
                  "&.Mui-selected": {
                    color: "#a78bfa",
                    bgcolor: "rgba(139,92,246,0.15) !important",
                    border: "1px solid rgba(139,92,246,0.5) !important",
                  },
                  "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
                }}
              >
                {icon}{label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Paper>

        {/* Prompt */}
        <Paper elevation={0} sx={cardSx}>
          <Typography sx={labelSx}>Prompt</Typography>
          <TextField
            multiline
            rows={4}
            fullWidth
            placeholder={activePlaceholder}
            variant="outlined"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            sx={inputSx}
          />
        </Paper>

        {/* URL */}
        <Paper elevation={0} sx={cardSx}>
          <Typography sx={labelSx}>Website URL</Typography>
          <TextField
            fullWidth
            placeholder="https://yourwebsite.com"
            variant="outlined"
            sx={inputSx}
          />
        </Paper>

        {/* File upload */}
        <Paper elevation={0} sx={cardSx}>
          <Typography sx={labelSx}>Upload Image</Typography>
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
              "&:hover": { borderColor: "#8b5cf6", bgcolor: "rgba(139,92,246,0.05)" },
            }}
          >
            {fileName ? (
              <>
                <InsertDriveFileIcon sx={{ color: "#8b5cf6", fontSize: 28 }} />
                <Typography sx={{ color: "#a78bfa", fontSize: 14 }}>{fileName}</Typography>
              </>
            ) : (
              <>
                <UploadFileIcon sx={{ color: "#8b5cf6", fontSize: 28 }} />
                <Typography sx={{ color: "#64748b", fontSize: 14 }}>Click to upload or drag & drop</Typography>
                <Typography sx={{ color: "#334155", fontSize: 12 }}>PNG, JPG, WEBP up to 10MB</Typography>
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

        {/* Publish to Social Media */}
        <Paper elevation={0} sx={cardSx}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Typography sx={labelSx}>Publish to Social Media</Typography>
            <Typography sx={{ color: "#475569", fontSize: 12, mb: 1.5 }}>(optional)</Typography>
          </Box>
          <Typography sx={{ color: "#475569", fontSize: 13, mb: 2 }}>
            Select platforms to auto-publish after generation.
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
            {SOCIAL_PLATFORMS.map(({ value, label, icon, color }) => {
              const selected = platforms.includes(value);
              return (
                <Tooltip key={value} title={label}>
                  <Button
                    onClick={() =>
                      setPlatforms((prev) =>
                        prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]
                      )
                    }
                    startIcon={icon}
                    variant={selected ? "contained" : "outlined"}
                    sx={{
                      textTransform: "none",
                      fontSize: 13,
                      borderRadius: 2,
                      borderColor: selected ? color : "rgba(255,255,255,0.12)",
                      color: selected ? "#fff" : "#64748b",
                      bgcolor: selected ? color : "transparent",
                      "&:hover": { bgcolor: selected ? color : "rgba(255,255,255,0.05)", borderColor: color, color: selected ? "#fff" : color },
                    }}
                  >
                    {label}
                  </Button>
                </Tooltip>
              );
            })}
          </Box>
          {platforms.length > 0 && (
            <Typography sx={{ color: "#475569", fontSize: 12, mt: 1.5 }}>
              Will publish to: {platforms.join(", ")}
            </Typography>
          )}
        </Paper>

        {/* Generate */}
        <Button
          fullWidth
          variant="contained"
          size="large"
          disabled={loading || !prompt.trim()}
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <AutoFixHighIcon />}
          onClick={handleGenerate}
          sx={{
            bgcolor: "#7c3aed",
            py: 1.8,
            borderRadius: 3,
            fontSize: 16,
            fontWeight: 700,
            textTransform: "none",
            boxShadow: "0 0 24px rgba(124,58,237,0.35)",
            "&:hover": { bgcolor: "#6d28d9", boxShadow: "0 0 32px rgba(124,58,237,0.5)" },
            "&.Mui-disabled": { bgcolor: "#3b1f6e", color: "#7c5cbf" },
          }}
        >
          {loading ? "Generating..." : "Generate"}
        </Button>

        {/* Result */}
        {error && (
          <Paper elevation={0} sx={{ ...cardSx, mt: 3, borderColor: "rgba(239,68,68,0.3)" }}>
            <Typography sx={{ color: "#ef4444", fontSize: 14 }}>{error}</Typography>
          </Paper>
        )}
        {caption && (
          <Paper elevation={0} sx={{ ...cardSx, mt: 3, borderColor: "rgba(139,92,246,0.3)" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
              <AutoAwesomeIcon sx={{ color: "#8b5cf6", fontSize: 18 }} />
              <Typography sx={{ color: "#cbd5e1", fontWeight: 600, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }}>
                Generated Content
              </Typography>
            </Box>
            <Typography sx={{ color: "#e2e8f0", fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {caption}
            </Typography>
            {hashtags.length > 0 && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2 }}>
                {hashtags.map((tag) => (
                  <Typography
                    key={tag}
                    sx={{ color: "#8b5cf6", fontSize: 13, bgcolor: "rgba(139,92,246,0.1)", px: 1.5, py: 0.5, borderRadius: 5 }}
                  >
                    {tag}
                  </Typography>
                ))}
              </Box>
            )}
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mt: 3 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={() => {
                  const blob = new Blob([caption ?? ""], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `generated-content.${outputFormat}`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                sx={{
                  color: "#8b5cf6", borderColor: "#8b5cf6", textTransform: "none", borderRadius: 2,
                  "&:hover": { bgcolor: "rgba(139,92,246,0.08)" },
                }}
              >
                Download as .{outputFormat}
              </Button>
              {platforms.length > 0 && (
                <Button
                  variant="outlined"
                  size="small"
                  sx={{
                    color: "#22c55e", borderColor: "#22c55e", textTransform: "none", borderRadius: 2,
                    "&:hover": { bgcolor: "rgba(34,197,94,0.08)" },
                  }}
                >
                  Publish to {platforms.join(", ")}
                </Button>
              )}
            </Box>
          </Paper>
        )}
      </Box>
    </Box>
  );
}
