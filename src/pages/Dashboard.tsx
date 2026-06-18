import { useRef, useState, useEffect, useCallback } from "react";
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
  Divider,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LogoutIcon from "@mui/icons-material/Logout";
import HistoryIcon from "@mui/icons-material/History";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import ArticleIcon from "@mui/icons-material/Article";
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
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import { generateCaption, getModels } from "../services/api";
import type { BedrockModel } from "../services/api";

const DEMO_BUSINESSES = ["My Business", "Acme Corp", "Green Leaf Cafe"];

// Fallback models used if API call fails
const FALLBACK_MODELS: Record<string, BedrockModel[]> = {
  text: [
    { modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0", label: "Claude 3.5 Sonnet v2",    description: "Best for long-form, nuanced text" },
    { modelId: "anthropic.claude-3-haiku-20240307-v1:0",   label: "Claude 3 Haiku",           description: "Fast & cost-efficient text" },
    { modelId: "amazon.titan-text-premier-v1:0",           label: "Titan Text Premier",        description: "Amazon's flagship text model" },
    { modelId: "meta.llama3-70b-instruct-v1:0",            label: "Llama 3 70B",               description: "Open-weight, strong reasoning" },
    { modelId: "mistral.mistral-large-2402-v1:0",          label: "Mistral Large",             description: "Strong multilingual support" },
  ],
  image: [
    { modelId: "amazon.titan-image-generator-v2:0",        label: "Titan Image Generator v2",  description: "Amazon's latest image model" },
    { modelId: "stability.stable-diffusion-xl-v1",         label: "Stable Diffusion XL",      description: "High-quality photorealistic images" },
    { modelId: "stability.stable-image-core-v1:0",         label: "Stable Image Core",         description: "Fast creative images" },
    { modelId: "stability.stable-image-ultra-v1:0",        label: "Stable Image Ultra",        description: "Ultra-detailed image generation" },
    { modelId: "amazon.nova-canvas-v1:0",                  label: "Nova Canvas",               description: "Amazon Nova image generation" },
  ],
  video: [
    { modelId: "amazon.nova-reel-v1:0",                    label: "Nova Reel",                 description: "Amazon's video generation model" },
    { modelId: "luma.ray-v2:0",                            label: "Luma Ray v2",               description: "Cinematic video generation" },
    { modelId: "stability.stable-video-diffusion-v1",      label: "Stable Video Diffusion",   description: "Image-to-video generation" },
    { modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",label: "Claude 3.5 Sonnet v2",    description: "Best for video script writing" },
    { modelId: "meta.llama3-70b-instruct-v1:0",            label: "Llama 3 70B",               description: "Strong script & narrative" },
  ],
};

// Map content types to model categories
const CONTENT_TYPE_CATEGORY: Record<string, string> = {
  flyer: "text", blog: "text", email: "text",
  image: "image", video: "video",
};

const CONTENT_TYPES = [
  { value: "flyer",    label: "Flyer",       icon: <CampaignIcon fontSize="small" /> },
  { value: "blog",     label: "Blog",        icon: <ArticleIcon fontSize="small" /> },
  { value: "image",    label: "Image",       icon: <ImageIcon fontSize="small" /> },
  { value: "email",    label: "Email",       icon: <EmailIcon fontSize="small" /> },
  { value: "video",    label: "Video Script",icon: <VideoLibraryIcon fontSize="small" /> },
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
    bgcolor: "#0a0a0a",
    borderRadius: 2,
    "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
    "&:hover fieldset": { borderColor: "#8b5cf6" },
    "&.Mui-focused fieldset": { borderColor: "#8b5cf6" },
  },
  "& .MuiInputBase-input::placeholder": { color: "#444", opacity: 1 },
  "& .MuiInputLabel-root": { color: "#64748b" },
  "& .MuiInputLabel-root.Mui-focused": { color: "#8b5cf6" },
};

const cardSx = {
  bgcolor: "#161616",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 3,
  p: { xs: 2.5, sm: 3 },
  mb: 2.5,
};

const labelSx = {
  color: "#94a3b8",
  fontWeight: 600,
  mb: 1.5,
  fontSize: 11,
  textTransform: "uppercase" as const,
  letterSpacing: 1.2,
};

const toggleBtnSx = {
  color: "#64748b",
  border: "1px solid rgba(255,255,255,0.1) !important",
  borderRadius: "8px !important",
  px: 1.5,
  py: 0.75,
  gap: 0.75,
  textTransform: "none" as const,
  fontSize: 13,
  "&.Mui-selected": {
    color: "#a78bfa",
    bgcolor: "rgba(139,92,246,0.15) !important",
    border: "1px solid rgba(139,92,246,0.5) !important",
  },
  "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
};

export default function Dashboard() {
  const { user, signOut } = useAuthenticator();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));

  const [fileName, setFileName] = useState<string | null>(null);
  const [business, setBusiness] = useState(DEMO_BUSINESSES[0]);
  const [customBusiness, setCustomBusiness] = useState("");
  const [contentType, setContentType] = useState("flyer");
  const [selectedModel, setSelectedModel] = useState(FALLBACK_MODELS.text[0].modelId);
  const [modelsCache, setModelsCache] = useState<Record<string, BedrockModel[]>>(FALLBACK_MODELS);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [outputFormat, setOutputFormat] = useState("txt");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [caption, setCaption] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isCustom = business === "__custom__";
  const effectiveBusiness = isCustom ? customBusiness : business;
  const currentModels = modelsCache[CONTENT_TYPE_CATEGORY[contentType] ?? "text"] ?? [];

  const fetchModels = useCallback(async (category: string) => {
    if (modelsCache[category]?.length && modelsCache[category] !== FALLBACK_MODELS[category]) return;
    setModelsLoading(true);
    try {
      const models = await getModels(category);
      if (models.length > 0) {
        setModelsCache((prev) => ({ ...prev, [category]: models }));
        setSelectedModel(models[0].modelId);
      }
    } catch {
      // silently fall back to FALLBACK_MODELS already in state
    } finally {
      setModelsLoading(false);
    }
  }, [modelsCache]);

  useEffect(() => {
    const category = CONTENT_TYPE_CATEGORY[contentType] ?? "text";
    fetchModels(category);
  }, [contentType, fetchModels]);


  const handleSignOut = () => { signOut(); navigate("/login"); };

  const handleContentTypeChange = (val: string) => {
    setContentType(val);
    const category = CONTENT_TYPE_CATEGORY[val] ?? "text";
    const first = modelsCache[category]?.[0]?.modelId ?? FALLBACK_MODELS[category][0].modelId;
    setSelectedModel(first);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setCaption(null);
    setHashtags([]);
    const fullPrompt = `Business: ${effectiveBusiness}. Content type: ${contentType}. ${prompt}`;
    try {
      const response = await generateCaption(fullPrompt, effectiveBusiness, contentType, platforms, selectedModel);
      setCaption(response.data.caption);
      setHashtags(response.data.hashtags ?? []);
    } catch {
      setError("Failed to generate content. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!caption) return;
    navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([caption ?? ""], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `generated-content.${outputFormat}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const togglePlatform = (val: string) =>
    setPlatforms((prev) =>
      prev.includes(val) ? prev.filter((p) => p !== val) : [...prev, val]
    );

  // ── Shared form sections ──────────────────────────────────────────────────

  const BusinessSection = (
    <Paper elevation={0} sx={cardSx}>
      <Typography sx={labelSx}>Business</Typography>
      <FormControl fullWidth sx={{ mb: isCustom ? 2 : 0 }}>
        <InputLabel sx={{ color: "#64748b", "&.Mui-focused": { color: "#8b5cf6" } }}>
          Select your business
        </InputLabel>
        <Select
          value={business}
          label="Select your business"
          onChange={(e) => setBusiness(e.target.value)}
          sx={{
            color: "#fff", bgcolor: "#0a0a0a", borderRadius: 2,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.1)" },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#8b5cf6" },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#8b5cf6" },
            "& .MuiSvgIcon-root": { color: "#64748b" },
          }}
          MenuProps={{ slotProps: { paper: { sx: { bgcolor: "#1e1e1e", color: "#fff" } } } }}
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
  );

  const ContentTypeSection = (
    <Paper elevation={0} sx={cardSx}>
      <Typography sx={labelSx}>Content Type</Typography>
      <ToggleButtonGroup
        value={contentType}
        exclusive
        onChange={(_, val) => { if (val) handleContentTypeChange(val); }}
        sx={{ flexWrap: "wrap", gap: 1 }}
      >
        {CONTENT_TYPES.map(({ value, label, icon }) => (
          <ToggleButton key={value} value={value} sx={toggleBtnSx}>
            {icon}{label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Paper>
  );

  const ModelSection = (
    <Paper elevation={0} sx={cardSx}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Typography sx={labelSx}>Bedrock Model</Typography>
        {modelsLoading
          ? <CircularProgress size={12} sx={{ color: "#8b5cf6" }} />
          : <Typography sx={{ color: "#475569", fontSize: 11 }}>Top 5 for {CONTENT_TYPE_CATEGORY[contentType] ?? "text"}</Typography>
        }
      </Box>
      <FormControl fullWidth>
        <Select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={modelsLoading}
          sx={{
            color: "#fff", bgcolor: "#0a0a0a", borderRadius: 2,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.1)" },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#8b5cf6" },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#8b5cf6" },
            "& .MuiSvgIcon-root": { color: "#64748b" },
          }}
          MenuProps={{ PaperProps: { sx: { bgcolor: "#1e1e1e", color: "#fff", maxHeight: 320 } } }}
        >
          {currentModels.map((m) => (
            <MenuItem
              key={m.modelId}
              value={m.modelId}
              sx={{ flexDirection: "column", alignItems: "flex-start", py: 1.5,
                "&:hover": { bgcolor: "rgba(139,92,246,0.1)" },
                "&.Mui-selected": { bgcolor: "rgba(139,92,246,0.15)" },
              }}
            >
              <Typography sx={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>{m.label}</Typography>
              <Typography sx={{ color: "#64748b", fontSize: 12 }}>{m.description}</Typography>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Typography sx={{ color: "#334155", fontSize: 11, mt: 1 }}>
        {currentModels.find((m) => m.modelId === selectedModel)?.modelId}
      </Typography>
    </Paper>
  );

  const OutputFormatSection = (
    <Paper elevation={0} sx={cardSx}>
      <Typography sx={labelSx}>Output Format</Typography>
      <ToggleButtonGroup
        value={outputFormat}
        exclusive
        onChange={(_, val) => { if (val) setOutputFormat(val); }}
        sx={{ flexWrap: "wrap", gap: 1 }}
      >
        {OUTPUT_FORMATS.map(({ value, label, icon }) => (
          <ToggleButton key={value} value={value} sx={toggleBtnSx}>
            {icon}{label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Paper>
  );

  const PromptSection = (
    <Paper elevation={0} sx={cardSx}>
      <Typography sx={labelSx}>Prompt</Typography>
      <TextField
        multiline
        rows={isDesktop ? 6 : 4}
        fullWidth
        placeholder="e.g. Write a Facebook ad for our new summer sneaker collection targeting 18–30 year olds..."
        variant="outlined"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        sx={inputSx}
      />
    </Paper>
  );

  const UrlSection = (
    <Paper elevation={0} sx={cardSx}>
      <Typography sx={labelSx}>Website URL</Typography>
      <TextField fullWidth placeholder="https://yourwebsite.com" variant="outlined" sx={inputSx} />
    </Paper>
  );

  const UploadSection = (
    <Paper elevation={0} sx={cardSx}>
      <Typography sx={labelSx}>Upload Image</Typography>
      <Box
        onClick={() => fileRef.current?.click()}
        sx={{
          border: "1px dashed rgba(139,92,246,0.4)",
          borderRadius: 2, p: 2.5,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
          cursor: "pointer", transition: "border-color 0.2s, background 0.2s",
          "&:hover": { borderColor: "#8b5cf6", bgcolor: "rgba(139,92,246,0.05)" },
        }}
      >
        {fileName ? (
          <>
            <InsertDriveFileIcon sx={{ color: "#8b5cf6", fontSize: 26 }} />
            <Typography sx={{ color: "#a78bfa", fontSize: 13 }}>{fileName}</Typography>
          </>
        ) : (
          <>
            <UploadFileIcon sx={{ color: "#8b5cf6", fontSize: 26 }} />
            <Typography sx={{ color: "#64748b", fontSize: 13 }}>Click to upload or drag & drop</Typography>
            <Typography sx={{ color: "#334155", fontSize: 12 }}>PNG, JPG, WEBP up to 10MB</Typography>
          </>
        )}
      </Box>
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
    </Paper>
  );

  const SocialSection = (
    <Paper elevation={0} sx={cardSx}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 1.5 }}>
        <Typography sx={labelSx}>Publish to Social Media</Typography>
        <Typography sx={{ color: "#475569", fontSize: 11 }}>(optional)</Typography>
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {SOCIAL_PLATFORMS.map(({ value, label, icon, color }) => {
          const selected = platforms.includes(value);
          return (
            <Tooltip key={value} title={label}>
              <Button
                onClick={() => togglePlatform(value)}
                startIcon={icon}
                variant={selected ? "contained" : "outlined"}
                size="small"
                sx={{
                  textTransform: "none", fontSize: 13, borderRadius: 2,
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
    </Paper>
  );

  const GenerateButton = (
    <Button
      fullWidth
      variant="contained"
      size="large"
      disabled={loading || !prompt.trim()}
      startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <AutoFixHighIcon />}
      onClick={handleGenerate}
      sx={{
        bgcolor: "#7c3aed", py: 1.6, borderRadius: 3,
        fontSize: 15, fontWeight: 700, textTransform: "none",
        boxShadow: "0 0 24px rgba(124,58,237,0.35)",
        "&:hover": { bgcolor: "#6d28d9", boxShadow: "0 0 32px rgba(124,58,237,0.5)" },
        "&.Mui-disabled": { bgcolor: "#3b1f6e", color: "#7c5cbf" },
      }}
    >
      {loading ? "Generating..." : "Generate"}
    </Button>
  );

  const ResultPanel = (
    <Box sx={{ height: "100%" }}>
      {/* Placeholder when no result yet */}
      {!caption && !error && !loading && (
        <Box
          sx={{
            height: "100%", minHeight: 320,
            border: "1px dashed rgba(139,92,246,0.2)",
            borderRadius: 3, display: "flex",
            flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 1.5, p: 4,
          }}
        >
          <AutoAwesomeIcon sx={{ color: "rgba(139,92,246,0.3)", fontSize: 40 }} />
          <Typography sx={{ color: "#334155", fontSize: 14, textAlign: "center" }}>
            Your generated content will appear here
          </Typography>
        </Box>
      )}

      {loading && (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 320, gap: 2 }}>
          <CircularProgress sx={{ color: "#8b5cf6" }} />
          <Typography sx={{ color: "#475569", fontSize: 13 }}>Generating your content...</Typography>
        </Box>
      )}

      {error && (
        <Paper elevation={0} sx={{ ...cardSx, mb: 0, borderColor: "rgba(239,68,68,0.3)" }}>
          <Typography sx={{ color: "#ef4444", fontSize: 14 }}>{error}</Typography>
        </Paper>
      )}

      {caption && (
        <Paper elevation={0} sx={{ ...cardSx, mb: 0, borderColor: "rgba(139,92,246,0.25)", height: isDesktop ? "calc(100% - 0px)" : "auto" }}>
          {/* Header */}
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <AutoAwesomeIcon sx={{ color: "#8b5cf6", fontSize: 16 }} />
              <Typography sx={{ color: "#cbd5e1", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2 }}>
                Generated Content
              </Typography>
            </Box>
            <Tooltip title={copied ? "Copied!" : "Copy to clipboard"}>
              <Button
                size="small"
                onClick={handleCopy}
                startIcon={copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                sx={{ color: copied ? "#22c55e" : "#64748b", textTransform: "none", fontSize: 12,
                  "&:hover": { color: "#a78bfa" } }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </Tooltip>
          </Box>

          <Divider sx={{ borderColor: "rgba(255,255,255,0.06)", mb: 2 }} />

          {/* Caption */}
          <Typography sx={{ color: "#e2e8f0", fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap", mb: 2 }}>
            {caption}
          </Typography>

          {/* Hashtags */}
          {hashtags.length > 0 && (
            <>
              <Typography sx={{ ...labelSx, mb: 1 }}>Hashtags</Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 2.5 }}>
                {hashtags.map((tag) => (
                  <Typography key={tag} sx={{
                    color: "#8b5cf6", fontSize: 12,
                    bgcolor: "rgba(139,92,246,0.1)", px: 1.25, py: 0.4, borderRadius: 4,
                    border: "1px solid rgba(139,92,246,0.25)",
                  }}>
                    {tag}
                  </Typography>
                ))}
              </Box>
            </>
          )}

          <Divider sx={{ borderColor: "rgba(255,255,255,0.06)", mb: 2 }} />

          {/* Actions */}
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
            <Button
              variant="outlined" size="small"
              startIcon={<DownloadIcon fontSize="small" />}
              onClick={handleDownload}
              sx={{ color: "#8b5cf6", borderColor: "rgba(139,92,246,0.5)", textTransform: "none",
                borderRadius: 2, fontSize: 13, "&:hover": { bgcolor: "rgba(139,92,246,0.08)" } }}
            >
              Download .{outputFormat}
            </Button>
            {platforms.length > 0 && (
              <Button
                variant="outlined" size="small"
                sx={{ color: "#22c55e", borderColor: "rgba(34,197,94,0.5)", textTransform: "none",
                  borderRadius: 2, fontSize: 13, "&:hover": { bgcolor: "rgba(34,197,94,0.08)" } }}
              >
                Publish to {platforms.join(", ")}
              </Button>
            )}
          </Box>
        </Paper>
      )}
    </Box>
  );

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#0f0f0f", display: "flex", flexDirection: "column" }}>
      {/* Navbar */}
      <Box sx={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        px: { xs: 2, sm: 3, md: 4 }, py: 1.75,
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        bgcolor: "#111", position: "sticky", top: 0, zIndex: 10,
      }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AutoAwesomeIcon sx={{ color: "#8b5cf6" }} />
          <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>MarketingAI</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, sm: 2 } }}>
          <Button onClick={() => navigate("/history")} startIcon={<HistoryIcon />}
            sx={{ color: "#64748b", textTransform: "none", fontSize: 14, "&:hover": { color: "#fff" },
              "& .MuiButton-startIcon": { display: { xs: "none", sm: "flex" } } }}>
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>History</Box>
            <HistoryIcon sx={{ display: { xs: "block", sm: "none" }, fontSize: 20, color: "#64748b" }} />
          </Button>
          <Typography sx={{ color: "#475569", fontSize: 13, display: { xs: "none", md: "block" } }}>
            {user?.username}
          </Typography>
          <Button onClick={handleSignOut} startIcon={<LogoutIcon />} size="small" variant="outlined"
            sx={{ color: "#8b5cf6", borderColor: "#8b5cf6", textTransform: "none", fontSize: 13,
              "&:hover": { borderColor: "#a78bfa", color: "#a78bfa", bgcolor: "rgba(139,92,246,0.08)" } }}>
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>Sign Out</Box>
          </Button>
        </Box>
      </Box>

      {/* Page body */}
      <Box sx={{ flex: 1, display: "flex", overflow: isDesktop ? "hidden" : "auto" }}>

        {/* ── Desktop: two-column ── */}
        {isDesktop ? (
          <Box sx={{ display: "flex", width: "100%", height: "calc(100vh - 57px)", overflow: "hidden" }}>

            {/* Left column — inputs */}
            <Box sx={{
              width: "50%", overflowY: "auto", px: 4, py: 4,
              borderRight: "1px solid rgba(255,255,255,0.06)",
              "&::-webkit-scrollbar": { width: 6 },
              "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
              "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(139,92,246,0.3)", borderRadius: 3 },
            }}>
              <Typography variant="h5" sx={{ color: "#fff", fontWeight: 800, mb: 0.5 }}>
                Generate Content
              </Typography>
              <Typography sx={{ color: "#475569", fontSize: 14, mb: 3 }}>
                Configure your options and describe what you need.
              </Typography>

              {BusinessSection}
              {ContentTypeSection}
              {ModelSection}
              {OutputFormatSection}
              {PromptSection}
              {UrlSection}
              {UploadSection}
              {SocialSection}
              {GenerateButton}
            </Box>

            {/* Right column — result */}
            <Box sx={{
              width: "50%", overflowY: "auto", px: 4, py: 4,
              "&::-webkit-scrollbar": { width: 6 },
              "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
              "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(139,92,246,0.3)", borderRadius: 3 },
            }}>
              <Typography variant="h5" sx={{ color: "#fff", fontWeight: 800, mb: 0.5 }}>
                Result
              </Typography>
              <Typography sx={{ color: "#475569", fontSize: 14, mb: 3 }}>
                Your AI-generated content appears here instantly.
              </Typography>
              {ResultPanel}
            </Box>
          </Box>
        ) : (
          /* ── Mobile / Tablet: single column ── */
          <Box sx={{ width: "100%", maxWidth: 720, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
            <Typography variant="h5" sx={{ color: "#fff", fontWeight: 800, mb: 0.5 }}>
              Generate Content
            </Typography>
            <Typography sx={{ color: "#475569", fontSize: 14, mb: 3 }}>
              Describe what you need — AI handles the rest.
            </Typography>

            {BusinessSection}
            {ContentTypeSection}
            {ModelSection}
            {OutputFormatSection}
            {PromptSection}
            {UrlSection}
            {UploadSection}
            {SocialSection}
            {GenerateButton}

            {/* Result appears below on mobile */}
            <Box sx={{ mt: 3 }}>{ResultPanel}</Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
