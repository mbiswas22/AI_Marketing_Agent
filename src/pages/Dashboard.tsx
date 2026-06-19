import { useRef, useState, useEffect, useCallback } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  TextField,
  CircularProgress,
  MenuItem,
  Select,
  Tooltip,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LogoutIcon from "@mui/icons-material/Logout";
import HistoryIcon from "@mui/icons-material/History";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import DownloadIcon from "@mui/icons-material/Download";
import { generateCaption, generateMarketAsset, getModels } from "../services/api";
import type { BedrockModel } from "../services/api";

const DEMO_BUSINESSES = ["My Business", "Acme Corp", "Green Leaf Cafe"];

const FALLBACK_MODELS: Record<string, BedrockModel[]> = {
  text: [
    { modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0", label: "Claude 3.5 Sonnet v2",   description: "Best for long-form, nuanced text" },
    { modelId: "anthropic.claude-3-haiku-20240307-v1:0",   label: "Claude 3 Haiku",          description: "Fast & cost-efficient text" },
    { modelId: "amazon.titan-text-premier-v1:0",           label: "Titan Text Premier",       description: "Amazon's flagship text model" },
    { modelId: "meta.llama3-70b-instruct-v1:0",            label: "Llama 3 70B",              description: "Open-weight, strong reasoning" },
    { modelId: "mistral.mistral-large-2402-v1:0",          label: "Mistral Large",            description: "Strong multilingual support" },
  ],
  image: [
    { modelId: "amazon.titan-image-generator-v2:0",        label: "Titan Image Generator v2", description: "Amazon's latest image model" },
    { modelId: "stability.stable-diffusion-xl-v1",         label: "Stable Diffusion XL",     description: "High-quality photorealistic images" },
    { modelId: "stability.stable-image-core-v1:0",         label: "Stable Image Core",        description: "Fast creative images" },
    { modelId: "stability.stable-image-ultra-v1:0",        label: "Stable Image Ultra",       description: "Ultra-detailed image generation" },
    { modelId: "amazon.nova-canvas-v1:0",                  label: "Nova Canvas",              description: "Amazon Nova image generation" },
  ],
};

const CONTENT_TYPE_CATEGORY: Record<string, string> = {
  flyer:               "text",
  blog:                "text",
  email:               "text",
  video_script:        "text",
  product_description: "text",
  social_caption:      "text",
  image:               "image",
  merchandise:         "image",
  whatsapp_sms:        "text",
};

const CONTENT_TILES = [
  { value: "flyer",               icon: "ti-speakerphone",   name: "Flyer",          desc: "Bold visual for print or digital" },
  { value: "blog",                icon: "ti-article",        name: "Blog",           desc: "Long-form SEO article or post" },
  { value: "email",               icon: "ti-mail",           name: "Email",          desc: "Campaign or newsletter copy" },
  { value: "video_script",        icon: "ti-player-play",    name: "Video Script",   desc: "Scripted scenes with narration" },
  { value: "product_description", icon: "ti-tag",            name: "Product Desc.",  desc: "E-commerce listing copy" },
  { value: "social_caption",      icon: "ti-hash",           name: "Social Caption", desc: "Caption and hashtags for social" },
  { value: "image",               icon: "ti-photo",          name: "Image",          desc: "AI-generated visual asset" },
  { value: "merchandise",         icon: "ti-shirt",          name: "Merchandise",    desc: "Product concept with visual" },
  { value: "whatsapp_sms",        icon: "ti-brand-whatsapp", name: "WhatsApp / SMS", desc: "Short promo message", disabled: true },
];

const OUTPUT_FORMATS_BY_TYPE: Record<string, string[]> = {
  flyer:               ["pdf", "word", "plain_text", "html"],
  blog:                ["pdf", "word", "plain_text", "html"],
  email:               ["pdf", "word", "plain_text", "html"],
  video_script:        ["pdf", "word", "plain_text", "html"],
  product_description: ["pdf", "word", "plain_text", "html"],
  social_caption:      ["plain_text"],
  image:               ["png", "jpeg", "pdf"],
  merchandise:         ["png", "jpeg", "pdf"],
  whatsapp_sms:        [],
};

const FORMAT_DEFS: Record<string, { icon: string; name: string; desc: string }> = {
  pdf:        { icon: "ti-file-type-pdf", name: "PDF",        desc: "Shareable, print-ready doc" },
  word:       { icon: "ti-file-type-doc", name: "Word",       desc: "Editable .docx for Office" },
  plain_text: { icon: "ti-align-left",    name: "Plain Text", desc: "Raw text, easy to copy" },
  html:       { icon: "ti-code",          name: "HTML",       desc: "Embeddable web markup" },
  png:        { icon: "ti-photo",         name: "PNG",        desc: "Lossless, best quality" },
  jpeg:       { icon: "ti-photo",         name: "JPEG",       desc: "Compressed, smaller file" },
};

const SOCIAL_PLATFORMS = [
  { value: "facebook",  label: "Facebook",  icon: "ti-brand-facebook" },
  { value: "instagram", label: "Instagram", icon: "ti-brand-instagram" },
  { value: "youtube",   label: "YouTube",   icon: "ti-brand-youtube" },
  { value: "linkedin",  label: "LinkedIn",  icon: "ti-brand-linkedin" },
];

const getApiConfig = (ct: string) => {
  if (ct === "social_caption") return { type: "caption" };
  if (ct === "whatsapp_sms") return null;
  return { type: "asset" };
};

const cardSx = {
  background: "#141418",
  border: "0.5px solid #2a2a35",
  borderRadius: "10px",
  p: "12px 14px",
  mb: "8px",
  flexShrink: 0,
} as const;

const labelSx = {
  fontSize: "10px",
  fontWeight: 500,
  letterSpacing: "0.08em",
  color: "#888",
  textTransform: "uppercase" as const,
  display: "block",
  mb: "8px",
};

const subLabelSx = {
  fontSize: "9px",
  fontWeight: 500,
  letterSpacing: "0.08em",
  color: "#888",
  textTransform: "uppercase" as const,
  display: "block",
  mb: "4px",
};

const darkSelectSx = {
  color: "#e0dcf8",
  bgcolor: "#0d0d0f",
  borderRadius: "8px",
  fontSize: "12px",
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "#3a3a4a", borderWidth: "0.5px" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#7c6df0" },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#7c6df0" },
  "& .MuiSvgIcon-root": { color: "#888" },
};

const darkInputSx = {
  "& .MuiOutlinedInput-root": {
    color: "#e0dcf8",
    bgcolor: "#0d0d0f",
    borderRadius: "8px",
    fontSize: "12px",
    "& fieldset": { borderColor: "#3a3a4a", borderWidth: "0.5px" },
    "&:hover fieldset": { borderColor: "#7c6df0" },
    "&.Mui-focused fieldset": { borderColor: "#7c6df0" },
  },
  "& .MuiInputBase-input": { padding: "8px 12px", color: "#e0dcf8" },
  "& .MuiInputBase-input::placeholder": { color: "#555", opacity: 1 },
};

export default function Dashboard() {
  const { user, signOut } = useAuthenticator();
  const navigate = useNavigate();
  const location = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [business, setBusiness] = useState(DEMO_BUSINESSES[0]);
  const [customBusiness, setCustomBusiness] = useState("");
  const [contentType, setContentType] = useState("flyer");
  const [selectedFormat, setSelectedFormat] = useState("pdf");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(FALLBACK_MODELS.text[0].modelId);
  const [modelsCache, setModelsCache] = useState<Record<string, BedrockModel[]>>(FALLBACK_MODELS);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [caption, setCaption] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fromHistoryBanner, setFromHistoryBanner] = useState(false);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);

  const isCustom = business === "__custom__";
  const effectiveBusiness = isCustom ? customBusiness : business;
  const currentModels = modelsCache[CONTENT_TYPE_CATEGORY[contentType] ?? "text"] ?? [];
  const currentFormats = OUTPUT_FORMATS_BY_TYPE[contentType] ?? [];

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
      // silently fall back to FALLBACK_MODELS
    } finally {
      setModelsLoading(false);
    }
  }, [modelsCache]);

  useEffect(() => {
    const category = CONTENT_TYPE_CATEGORY[contentType] ?? "text";
    fetchModels(category);
    const formats = OUTPUT_FORMATS_BY_TYPE[contentType] ?? [];
    if (formats.length > 0) setSelectedFormat(formats[0]);
    else setSelectedFormat("");
  }, [contentType, fetchModels]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hi = (location.state as any)?.fromHistory;
    if (!hi) return;
    if (DEMO_BUSINESSES.includes(hi.business ?? "")) {
      setBusiness(hi.business);
    } else if (hi.business) {
      setBusiness("__custom__");
      setCustomBusiness(hi.business);
    }
    setPrompt(hi.prompt || hi.input_value || "");
    setContentType(hi.content_type || "flyer");
    setSelectedPlatforms(hi.platforms ?? []);
    if (hi.caption) setCaption(hi.caption);
    if (hi.hashtags) setHashtags(hi.hashtags);
    if (hi.image_url) setResultImageUrl(hi.image_url);
    setFromHistoryBanner(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = () => { signOut(); navigate("/login"); };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    const config = getApiConfig(contentType);
    if (!config) {
      alert("WhatsApp/SMS integration coming soon");
      return;
    }
    setLoading(true);
    setError(null);
    setCaption(null);
    setHashtags([]);
    setResultImageUrl(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let response: any;
      if (config.type === "caption") {
        response = await generateCaption(prompt, effectiveBusiness, contentType, selectedPlatforms, selectedModel);
      } else {
        response = await generateMarketAsset(prompt, effectiveBusiness, contentType, selectedFormat, selectedPlatforms, selectedModel);
      }
      setCaption(response.data.caption ?? null);
      setHashtags(response.data.hashtags ?? []);
      if (response.data.image_url) setResultImageUrl(response.data.image_url);
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
    a.download = `generated-content.${selectedFormat || "txt"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const togglePlatform = (val: string) =>
    setSelectedPlatforms((prev) =>
      prev.includes(val) ? prev.filter((p) => p !== val) : [...prev, val]
    );

  const clearHistory = () => {
    setFromHistoryBanner(false);
    setBusiness(DEMO_BUSINESSES[0]);
    setCustomBusiness("");
    setPrompt("");
    setContentType("flyer");
    setSelectedPlatforms([]);
    setCaption(null);
    setHashtags([]);
    setResultImageUrl(null);
    setWebsiteUrl("");
  };

  return (
    <Box sx={{ height: "100vh", bgcolor: "#0d0d0f", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Navbar */}
      <Box sx={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        px: { xs: 2, sm: 3, md: 4 }, py: 1.75,
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        bgcolor: "#111", zIndex: 10, flexShrink: 0,
      }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AutoAwesomeIcon sx={{ color: "#8b5cf6" }} />
          <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>MarketingAI</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, sm: 2 } }}>
          <Button onClick={() => navigate("/history")} startIcon={<HistoryIcon />}
            sx={{ color: "#64748b", textTransform: "none", fontSize: 14, "&:hover": { color: "#fff" } }}>
            History
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

      {/* Body */}
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left panel — 67% */}
        <Box sx={{
          width: "67%",
          flexShrink: 0,
          overflowY: "auto",
          borderRight: "1px solid #2a2a35",
          px: "18px",
          py: "12px",
          display: "flex",
          flexDirection: "column",
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
          "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(124,109,240,0.3)", borderRadius: 2 },
        }}>

          {/* History banner */}
          {fromHistoryBanner && (
            <Box sx={{
              background: "#1a1730",
              border: "1px solid #7c6df0",
              borderRadius: "6px",
              p: "8px 12px",
              mb: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <Typography sx={{ color: "#a89cf0", fontSize: 11 }}>
                Editing from history — modify and regenerate, or clear to start fresh
              </Typography>
              <button onClick={clearHistory}
                style={{ background: "none", border: "none", color: "#a89cf0", cursor: "pointer", fontSize: 14, padding: "0 0 0 8px", lineHeight: 1 }}>
                ✕
              </button>
            </Box>
          )}

          {/* Business card */}
          <Box sx={cardSx}>
            <Typography sx={labelSx}>Business</Typography>
            <Select
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              fullWidth
              size="small"
              sx={darkSelectSx}
              MenuProps={{ PaperProps: { sx: { bgcolor: "#141418", border: "0.5px solid #2a2a35", color: "#e0dcf8" } } }}
            >
              {DEMO_BUSINESSES.map((b) => (
                <MenuItem key={b} value={b} sx={{ fontSize: 12, "&:hover": { bgcolor: "rgba(124,109,240,0.1)" } }}>{b}</MenuItem>
              ))}
              <MenuItem value="__custom__" sx={{ fontSize: 12, color: "#7c6df0", "&:hover": { bgcolor: "rgba(124,109,240,0.1)" } }}>
                + Type a different business
              </MenuItem>
            </Select>
            {isCustom && (
              <TextField
                fullWidth size="small"
                placeholder="Enter your business name"
                value={customBusiness}
                onChange={(e) => setCustomBusiness(e.target.value)}
                sx={{ mt: "8px", ...darkInputSx }}
              />
            )}
          </Box>

          {/* Content type card */}
          <Box sx={cardSx}>
            <Typography sx={labelSx}>Content Type</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {CONTENT_TILES.map((tile) => {
                const isSelected = contentType === tile.value;
                return (
                  <Box
                    key={tile.value}
                    onClick={!tile.disabled ? () => setContentType(tile.value) : undefined}
                    sx={{
                      position: "relative",
                      background: isSelected ? "#1a1730" : "#0d0d0f",
                      border: `0.5px solid ${isSelected ? "#7c6df0" : "#2a2a35"}`,
                      borderRadius: "8px",
                      py: "12px",
                      px: "8px",
                      cursor: tile.disabled ? "not-allowed" : "pointer",
                      opacity: tile.disabled ? 0.5 : 1,
                      textAlign: "center",
                      flex: "0 0 calc(20% - 5px)",
                      boxSizing: "border-box",
                      "&:hover": !tile.disabled ? { borderColor: "#7c6df0" } : {},
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    {tile.disabled && (
                      <Box sx={{
                        position: "absolute", top: 4, right: 4,
                        bgcolor: "#2a2a35", color: "#666",
                        fontSize: "8px", px: "4px", py: "1px",
                        borderRadius: "3px", lineHeight: 1.5,
                      }}>
                        Soon
                      </Box>
                    )}
                    <i
                      className={`ti ${tile.icon}`}
                      style={{ fontSize: 20, color: isSelected ? "#7c6df0" : "#555", display: "block", marginBottom: 6 }}
                    />
                    <Typography sx={{ fontSize: "12px", fontWeight: 600, color: "#e0dcf8", lineHeight: 1.3, mb: "3px" }}>
                      {tile.name}
                    </Typography>
                    <Typography sx={{ fontSize: "10px", color: "#666", lineHeight: 1.4 }}>
                      {tile.desc}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>

          {/* Output format card */}
          <Box sx={cardSx}>
            <Typography sx={labelSx}>Output Format</Typography>
            {contentType === "whatsapp_sms" ? (
              <Typography sx={{ color: "#666", fontSize: "11px" }}>
                Content will be sent directly via WhatsApp/SMS API
              </Typography>
            ) : (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {currentFormats.map((fmt) => {
                  const def = FORMAT_DEFS[fmt];
                  if (!def) return null;
                  const isSelected = selectedFormat === fmt;
                  const isAuto = contentType === "social_caption";
                  return (
                    <Box
                      key={fmt}
                      onClick={!isAuto ? () => setSelectedFormat(fmt) : undefined}
                      sx={{
                        background: isSelected ? "#1a1730" : "#0d0d0f",
                        border: `0.5px solid ${isSelected ? "#7c6df0" : "#2a2a35"}`,
                        borderRadius: "8px",
                        py: "12px",
                        px: "8px",
                        cursor: isAuto ? "default" : "pointer",
                        opacity: isAuto ? 0.7 : 1,
                        textAlign: "center",
                        flex: "0 0 calc(20% - 5px)",
                        boxSizing: "border-box",
                        "&:hover": !isAuto ? { borderColor: "#7c6df0" } : {},
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      <i
                        className={`ti ${def.icon}`}
                        style={{ fontSize: 20, color: isSelected ? "#7c6df0" : "#555", display: "block", marginBottom: 6 }}
                      />
                      <Typography sx={{ fontSize: "12px", fontWeight: 600, color: "#e0dcf8", lineHeight: 1.3, mb: "3px" }}>
                        {def.name}
                      </Typography>
                      <Typography sx={{ fontSize: "10px", color: "#666", lineHeight: 1.4 }}>
                        {def.desc}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>

          {/* Prompt card */}
          <Box sx={{ ...cardSx, mb: "8px" }}>
            <Typography sx={labelSx}>Prompt</Typography>

            {/* Textarea */}
            <TextField
              multiline
              rows={3}
              fullWidth
              placeholder="e.g. Write a Facebook ad for our new summer sneaker collection targeting 18–30 year olds..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              sx={{
                "& .MuiOutlinedInput-root": {
                  color: "#e0dcf8",
                  bgcolor: "#0d0d0f",
                  borderRadius: "8px",
                  fontSize: "12px",
                  p: "10px 12px",
                  "& fieldset": { borderColor: "#3a3a4a", borderWidth: "0.5px" },
                  "&:hover fieldset": { borderColor: "#7c6df0" },
                  "&.Mui-focused fieldset": { borderColor: "#7c6df0" },
                },
                "& .MuiInputBase-inputMultiline": { color: "#e0dcf8", p: 0, lineHeight: 1.6 },
                "& .MuiInputBase-input::placeholder": { color: "#555", opacity: 1 },
              }}
            />

            {/* Divider */}
            <Box sx={{ height: "0.5px", bgcolor: "#2a2a35", my: "10px" }} />

            {/* 3-column row */}
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>

              {/* Col 1: Bedrock Model */}
              <Box>
                <Typography sx={subLabelSx}>Bedrock Model</Typography>
                <Select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={modelsLoading}
                  size="small"
                  fullWidth
                  renderValue={(val) => {
                    const m = currentModels.find((m) => m.modelId === val);
                    return (
                      <Box sx={{ lineHeight: 1.3, py: "1px" }}>
                        <Typography sx={{ fontSize: "11px", fontWeight: 600, color: "#e0dcf8", lineHeight: 1.1 }}>
                          {m?.label ?? "Model"}
                        </Typography>
                        <Typography sx={{ fontSize: "9px", color: "#7c6df0", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {val}
                        </Typography>
                      </Box>
                    );
                  }}
                  sx={{
                    ...darkSelectSx,
                    "& .MuiSelect-select": { py: "6px", px: "10px" },
                    "& .MuiSvgIcon-root": { color: "#888", fontSize: 16 },
                  }}
                  MenuProps={{ PaperProps: { sx: { bgcolor: "#141418", border: "0.5px solid #2a2a35", maxHeight: 280 } } }}
                >
                  {currentModels.map((m) => (
                    <MenuItem
                      key={m.modelId}
                      value={m.modelId}
                      sx={{
                        flexDirection: "column", alignItems: "flex-start", py: 1,
                        "&:hover": { bgcolor: "rgba(124,109,240,0.1)" },
                        "&.Mui-selected": { bgcolor: "rgba(124,109,240,0.15)" },
                      }}
                    >
                      <Typography sx={{ color: "#e0dcf8", fontSize: 12, fontWeight: 600 }}>{m.label}</Typography>
                      <Typography sx={{ color: "#555", fontSize: 10 }}>{m.description}</Typography>
                    </MenuItem>
                  ))}
                </Select>
              </Box>

              {/* Col 2: Website URL */}
              <Box>
                <Typography sx={subLabelSx}>Website URL</Typography>
                <TextField
                  fullWidth size="small"
                  placeholder="https://yourwebsite.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  sx={darkInputSx}
                />
              </Box>

              {/* Col 3: Upload Image */}
              <Box>
                <Typography sx={subLabelSx}>Upload Image</Typography>
                <Box
                  onClick={() => fileRef.current?.click()}
                  sx={{
                    border: "0.5px dashed #3a3a4a",
                    borderRadius: "8px",
                    height: "38px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    "&:hover": { borderColor: "#7c6df0" },
                    transition: "border-color 0.15s",
                  }}
                >
                  {fileName ? (
                    <>
                      <InsertDriveFileIcon sx={{ color: "#7c6df0", fontSize: 14 }} />
                      <Typography sx={{ color: "#a89cf0", fontSize: "9px", maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fileName}
                      </Typography>
                    </>
                  ) : (
                    <Typography sx={{ color: "#555", fontSize: "10px" }}>Click or drag & drop</Typography>
                  )}
                </Box>
                <input ref={fileRef} type="file" accept="image/*" hidden
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
              </Box>
            </Box>

            {/* Divider */}
            <Box sx={{ height: "0.5px", bgcolor: "#2a2a35", my: "10px" }} />

            {/* Social media row */}
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: "5px", mb: "6px" }}>
                <Typography sx={subLabelSx}>Publish to Social Media</Typography>
                <Typography sx={{ color: "#555", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  (optional)
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {SOCIAL_PLATFORMS.map(({ value, label, icon }) => {
                  const isSel = selectedPlatforms.includes(value);
                  return (
                    <button
                      key={value}
                      onClick={() => togglePlatform(value)}
                      style={{
                        background: "none",
                        border: `0.5px solid ${isSel ? "#7c6df0" : "#2a2a35"}`,
                        borderRadius: "6px",
                        padding: "5px 10px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        color: isSel ? "#e0dcf8" : "#555",
                        fontSize: "11px",
                        transition: "border-color 0.15s, color 0.15s",
                      }}
                    >
                      <i className={`ti ${icon}`} style={{ fontSize: 13 }} />
                      {label}
                    </button>
                  );
                })}
              </Box>
            </Box>
          </Box>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            style={{
              width: "100%",
              background: loading || !prompt.trim() ? "#22203a" : "#5a4fd0",
              border: "none",
              borderRadius: "8px",
              padding: "11px",
              color: loading || !prompt.trim() ? "#5a4f90" : "#ffffff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading || !prompt.trim() ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            {loading
              ? <><CircularProgress size={15} sx={{ color: "#a89cf0" }} /> Generating...</>
              : <><i className="ti ti-sparkles" style={{ fontSize: 16 }} /> Generate</>
            }
          </button>
        </Box>

        {/* Right panel — 33% */}
        <Box sx={{
          flex: 1,
          bgcolor: "#0d0d0f",
          p: "20px",
          overflowY: "auto",
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
          "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(124,109,240,0.3)", borderRadius: 2 },
        }}>
          <Typography sx={{ fontSize: 16, fontWeight: 500, color: "#f0eeff", mb: "4px" }}>
            Result
          </Typography>
          <Typography sx={{ color: "#555", fontSize: "11px", mb: "16px" }}>
            Your AI-generated content appears here instantly.
          </Typography>

          {/* Empty state */}
          {!caption && !resultImageUrl && !error && !loading && (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, gap: "12px" }}>
              <i className="ti ti-sparkles" style={{ fontSize: 32, color: "#333" }} />
              <Typography sx={{ color: "#333", fontSize: 12, textAlign: "center" }}>
                Your generated content will appear here.
              </Typography>
            </Box>
          )}

          {/* Loading */}
          {loading && (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, gap: 2 }}>
              <CircularProgress sx={{ color: "#7c6df0" }} />
              <Typography sx={{ color: "#555", fontSize: 13 }}>Generating your content...</Typography>
            </Box>
          )}

          {/* Error */}
          {error && (
            <Box sx={{ background: "#1a0808", border: "0.5px solid #5c1a1a", borderRadius: "8px", p: "12px" }}>
              <Typography sx={{ color: "#ef4444", fontSize: 13 }}>{error}</Typography>
            </Box>
          )}

          {/* Result content */}
          {(caption || resultImageUrl) && !loading && (
            <Box>
              {caption && (
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                    <Typography sx={{ color: "#888", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Generated Content
                    </Typography>
                    <Tooltip title={copied ? "Copied!" : "Copy to clipboard"}>
                      <Button
                        size="small"
                        onClick={handleCopy}
                        startIcon={copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                        sx={{ color: copied ? "#22c55e" : "#555", textTransform: "none", fontSize: 11,
                          "&:hover": { color: "#a89cf0" }, minWidth: "auto", p: "2px 8px" }}
                      >
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </Tooltip>
                  </Box>
                  <Box sx={{ height: "0.5px", bgcolor: "#2a2a35", mb: "12px" }} />
                  <Typography sx={{ color: "#e0dcf8", fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                    {caption}
                  </Typography>
                </Box>
              )}

              {hashtags.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography sx={{ color: "#888", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", mb: 1 }}>
                    Hashtags
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {hashtags.map((tag) => (
                      <Box key={tag} sx={{
                        color: "#7c6df0", fontSize: 12,
                        bgcolor: "rgba(124,109,240,0.1)", px: "10px", py: "3px",
                        borderRadius: "20px", border: "0.5px solid rgba(124,109,240,0.25)",
                      }}>
                        {tag}
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {resultImageUrl && (
                <Box sx={{ mb: 2 }}>
                  <Typography sx={{ color: "#888", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", mb: 1 }}>
                    Generated Image
                  </Typography>
                  <Box
                    component="img"
                    src={resultImageUrl}
                    alt="Generated"
                    sx={{ maxHeight: 200, maxWidth: "100%", objectFit: "contain", borderRadius: "6px", display: "block" }}
                  />
                </Box>
              )}

              <Box sx={{ height: "0.5px", bgcolor: "#2a2a35", my: "12px" }} />

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  variant="outlined" size="small"
                  startIcon={<DownloadIcon fontSize="small" />}
                  onClick={handleDownload}
                  sx={{ color: "#7c6df0", borderColor: "rgba(124,109,240,0.5)", textTransform: "none",
                    borderRadius: "6px", fontSize: 12, "&:hover": { bgcolor: "rgba(124,109,240,0.08)" } }}
                >
                  Download .{selectedFormat || "txt"}
                </Button>
                {selectedPlatforms.length > 0 && (
                  <Button
                    variant="outlined" size="small"
                    sx={{ color: "#22c55e", borderColor: "rgba(34,197,94,0.5)", textTransform: "none",
                      borderRadius: "6px", fontSize: 12, "&:hover": { bgcolor: "rgba(34,197,94,0.08)" } }}
                  >
                    Publish to {selectedPlatforms.join(", ")}
                  </Button>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
