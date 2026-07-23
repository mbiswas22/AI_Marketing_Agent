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
  Snackbar,
  Alert,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LogoutIcon from "@mui/icons-material/Logout";
import HistoryIcon from "@mui/icons-material/History";
import SettingsIcon from "@mui/icons-material/Settings";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import DownloadIcon from "@mui/icons-material/Download";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import FacebookIcon from "@mui/icons-material/Facebook";
import InstagramIcon from "@mui/icons-material/Instagram";
import {
  generateCaption,
  generateMarketAsset,
  generateImage,
  getModels,
  getSocialConnections,
  publishToLinkedIn,
  getMetaPages,
  publishToFacebook,
  getInstagramStatus,
  publishToInstagram,
  crawlWebsite,
  getUser,
  getBusinesses,
} from "../services/api";
import type { BedrockModel, Business } from "../services/api";
import { getUserAttributes } from "../services/auth";
import {
  DEMO_BUSINESSES,
  FALLBACK_MODELS,
  CONTENT_TYPE_CATEGORY,
  CONTENT_TILES,
  OUTPUT_FORMATS_BY_TYPE,
  FORMAT_DEFS,
  SOCIAL_PLATFORMS,
  INPUT_TABS,
  cardSx,
  labelSx,
  subLabelSx,
  darkSelectSx,
  darkInputSx,
} from "../constants/dashboardConstants";

const getApiConfig = (ct: string) => {
  if (ct === "social_caption") return { type: "caption" };
  if (ct === "whatsapp_sms") return null;
  return { type: "asset" };
};

export default function Dashboard() {
  const { user, signOut } = useAuthenticator();
  const navigate = useNavigate();
  const [role, setRole] = useState<string>("VIEWER");
  const [businessId, setBusinessId] = useState<string | null>(null);
  const location = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [url] = useState("");
  const [business, setBusiness] = useState(DEMO_BUSINESSES[0]);
  const [customBusiness, setCustomBusiness] = useState("");
  const [contentType, setContentType] = useState("flyer");
  const [selectedFormat, setSelectedFormat] = useState("pdf");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(
    FALLBACK_MODELS.text[0].modelId,
  );
  const [modelsCache, setModelsCache] =
    useState<Record<string, BedrockModel[]>>(FALLBACK_MODELS);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [caption, setCaption] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [offer, setOffer] = useState<string | null>(null);
  const [callToAction, setCallToAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fromHistoryBanner, setFromHistoryBanner] = useState(false);
  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const [publishingToLinkedIn, setPublishingToLinkedIn] = useState(false);
  const [facebookConnected, setFacebookConnected] = useState(false);
  const [publishingToFacebook, setPublishingToFacebook] = useState(false);
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [publishingToInstagram, setPublishingToInstagram] = useState(false);
  const [publishSnackbar, setPublishSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [resultActionId, setResultActionId] = useState<string | null>(null);
  const [resultCreatedAt, setResultCreatedAt] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [inputTab, setInputTab] =
    useState<(typeof INPUT_TABS)[number]["value"]>("text");

  const isCustom = business === "__custom__";
  const effectiveBusiness = isCustom ? customBusiness : business;
  const currentModels =
    modelsCache[CONTENT_TYPE_CATEGORY[contentType] ?? "text"] ?? [];
  const currentFormats = OUTPUT_FORMATS_BY_TYPE[contentType] ?? [];
  const isInputEmpty =
    inputTab === "text"
      ? !prompt.trim()
      : inputTab === "url"
        ? !websiteUrl.trim()
        : !fileName;

  const fetchModels = useCallback(
    async (category: string) => {
      if (
        modelsCache[category]?.length &&
        modelsCache[category] !== FALLBACK_MODELS[category]
      )
        return;
      setModelsLoading(true);
      try {
        const models = await getModels(category);
        if (models.length > 0) {
          setModelsCache((prev) => ({ ...prev, [category]: models }));
          setSelectedModel((prev) =>
            models.some((m) => m.modelId === prev) ? prev : models[0].modelId,
          );
        }
      } catch {
        // silently fall back to FALLBACK_MODELS
      } finally {
        setModelsLoading(false);
      }
    },
    [modelsCache],
  );

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
    if (hi.title) setTitle(hi.title);
    if (hi.offer) setOffer(hi.offer);
    if (hi.call_to_action) setCallToAction(hi.call_to_action);
    if (hi.image_url) setResultImageUrl(hi.image_url);
    setFromHistoryBanner(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const attrs = await getUserAttributes();
        const cognitoRole = (attrs as any)?.["custom:role"];
        if (cognitoRole) setRole(cognitoRole);
        const sub = (attrs as any)?.sub;
        const email = (attrs as { email?: string })?.email;
        if (!sub) return;
        const businesses = await getBusinesses();
        // GET /business currently returns every business in the system, not just
        // the caller's own — match by owner email instead of trusting businesses[0].
        const ownBusiness = businesses.find(
          (b: Business) => b.ownerEmail === email,
        );
        const resolvedBusinessId =
          ownBusiness?.businessId ?? businesses[0]?.businessId;
        if (!resolvedBusinessId) return;
        setBusinessId(resolvedBusinessId);
        const userData = await getUser(sub, resolvedBusinessId);
        if (userData?.role) setRole(userData.role);
      } catch {
        // keep default VIEWER
      }
    };
    fetchRole();
  }, []);

  useEffect(() => {
    if (!businessId) return;
    getSocialConnections(businessId)
      .then((conns) =>
        setLinkedinConnected(
          conns.some(
            (c) => c.platform === "linkedin" && c.status === "connected",
          ),
        ),
      )
      .catch(() => {});
    getMetaPages(businessId)
      .then((info) => setFacebookConnected(info.status === "connected"))
      .catch(() => {});
    getInstagramStatus(businessId)
      .then((info) => setInstagramConnected(info.status === "connected"))
      .catch(() => {});
  }, [businessId]);

  const handleSignOut = () => {
    signOut();
    navigate("/login");
  };

  const handleLinkedInPublish = async () => {
    setPublishingToLinkedIn(true);
    try {
      const extractS3Key = (url: string): string | null => {
        if (!url) return null;
        try {
          const urlObj = new URL(url);
          return urlObj.pathname.startsWith("/")
            ? urlObj.pathname.slice(1)
            : urlObj.pathname;
        } catch {
          return null;
        }
      };

      const imageKey = resultImageUrl ? extractS3Key(resultImageUrl) : null;

      await publishToLinkedIn({
        text: caption || undefined,
        businessId: businessId ?? "",
        ...(imageKey && { image_key: imageKey }),
        ...(resultActionId && { action_id: resultActionId }),
        ...(resultCreatedAt && { createdAt: resultCreatedAt }),
      });
      setPublishSnackbar({
        open: true,
        message: "Posted to LinkedIn successfully",
        severity: "success",
      });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Failed to post to LinkedIn";
      setPublishSnackbar({ open: true, message: msg, severity: "error" });
    } finally {
      setPublishingToLinkedIn(false);
    }
  };

  const handleFacebookPublish = async () => {
    setPublishingToFacebook(true);
    try {
      const extractS3Key = (url: string): string | null => {
        if (!url) return null;
        try {
          const urlObj = new URL(url);
          return urlObj.pathname.startsWith("/")
            ? urlObj.pathname.slice(1)
            : urlObj.pathname;
        } catch {
          return null;
        }
      };

      const imageKey = resultImageUrl ? extractS3Key(resultImageUrl) : null;

      await publishToFacebook({
        text: caption || undefined,
        ...(imageKey && { image_key: imageKey }),
      });
      setPublishSnackbar({
        open: true,
        message: "Posted to Facebook successfully",
        severity: "success",
      });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Failed to post to Facebook";
      setPublishSnackbar({ open: true, message: msg, severity: "error" });
    } finally {
      setPublishingToFacebook(false);
    }
  };

  const handleInstagramPublish = async () => {
    setPublishingToInstagram(true);
    try {
      const extractS3Key = (url: string): string | null => {
        if (!url) return null;
        try {
          const urlObj = new URL(url);
          return urlObj.pathname.startsWith("/")
            ? urlObj.pathname.slice(1)
            : urlObj.pathname;
        } catch {
          return null;
        }
      };

      const imageKey = resultImageUrl ? extractS3Key(resultImageUrl) : null;
      if (!imageKey) {
        setPublishSnackbar({
          open: true,
          message: "Instagram requires an image — generate one first",
          severity: "error",
        });
        return;
      }

      const result = await publishToInstagram({
        text: caption || undefined,
        image_key: imageKey,
      });
      if (result.processing) {
        setPublishSnackbar({
          open: true,
          message:
            result.error || "Instagram is still processing — try again shortly",
          severity: "error",
        });
      } else {
        setPublishSnackbar({
          open: true,
          message: "Posted to Instagram successfully",
          severity: "success",
        });
      }
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Failed to post to Instagram";
      setPublishSnackbar({ open: true, message: msg, severity: "error" });
    } finally {
      setPublishingToInstagram(false);
    }
  };

  const handleGenerate = async () => {
    const effectiveInput =
      inputTab === "text"
        ? prompt
        : inputTab === "url"
          ? websiteUrl
          : (fileName ?? "");
    if (!effectiveInput.trim()) return;
    const config = getApiConfig(contentType);
    if (!config) {
      alert("WhatsApp/SMS integration coming soon");
      return;
    }
    setLoading(true);
    setError(null);
    setCaption(null);
    setHashtags([]);
    setTitle(null);
    setOffer(null);
    setCallToAction(null);
    setResultImageUrl(null);
    try {
      if (inputTab === "url") {
        const result = await crawlWebsite(
          websiteUrl,
          contentType,
          selectedPlatforms,
        );
        setCaption(result.marketing.caption ?? null);
        setHashtags(result.marketing.hashtags ?? []);
        // handle both imageUrl and image_url from crawler
        const crawlerImage =
          result.imageUrl || (result as any).image_url || null;
        if (crawlerImage) setResultImageUrl(crawlerImage);
        if ((result as any).action_id)
          setResultActionId((result as any).action_id);
        if ((result as any).created_at)
          setResultCreatedAt((result as any).created_at);
      } else if (contentType === "image") {
        const enrichedImagePrompt = `Professional marketing image for ${effectiveBusiness}. ${prompt}. High quality, photorealistic, commercial photography style, vibrant colors, no text, no words, no letters, no watermarks.`;
        const url = await generateImage(enrichedImagePrompt);
        setResultImageUrl(url);
      } else if (inputTab === "image" && uploadedFile) {
        // Convert uploaded image to base64 and send to generate-marketing-asset Lambda
        const base64Str = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(uploadedFile);
        });
        const response = await generateMarketAsset(
          prompt ||
            `Create ${contentType} marketing content for ${effectiveBusiness} based on the uploaded image.`,
          effectiveBusiness,
          contentType,
          selectedFormat,
          selectedPlatforms,
          selectedModel,
          base64Str,
          "image",
        );
        setCaption(response.data.caption ?? null);
        setHashtags(response.data.hashtags ?? []);
        if (response.data.image_url) setResultImageUrl(response.data.image_url);
        if ((response.data as any).action_id)
          setResultActionId((response.data as any).action_id);
        if ((response.data as any).created_at)
          setResultCreatedAt((response.data as any).created_at);
      } else if (config.type === "caption") {
        const enrichedPrompt = `You are an expert marketing copywriter. Create detailed, compelling ${contentType} content for the business "${effectiveBusiness}". ${prompt}. Write at least 3-4 paragraphs with a strong headline, body copy, and a clear call to action. Be specific, persuasive and professional.`;
        const response = await generateCaption(
          enrichedPrompt,
          effectiveBusiness,
          contentType,
          selectedPlatforms,
          selectedModel,
        );
        setCaption(response.data.caption ?? null);
        setHashtags(response.data.hashtags ?? []);
        if ((response.data as any).action_id)
          setResultActionId((response.data as any).action_id);
        if ((response.data as any).created_at)
          setResultCreatedAt((response.data as any).created_at);
      } else {
        const enrichedPrompt = `You are an expert marketing copywriter. Create detailed, compelling ${contentType} content for the business "${effectiveBusiness}". ${prompt}. Write at least 3-4 paragraphs with a strong headline, body copy, and a clear call to action. Be specific, persuasive and professional.`;
        const response = await generateMarketAsset(
          enrichedPrompt,
          effectiveBusiness,
          contentType,
          selectedFormat,
          selectedPlatforms,
          selectedModel,
        );
        setCaption(response.data.caption ?? null);
        setHashtags(response.data.hashtags ?? []);
        if (response.data.image_url) setResultImageUrl(response.data.image_url);
        if ((response.data as any).action_id)
          setResultActionId((response.data as any).action_id);
        if ((response.data as any).created_at)
          setResultCreatedAt((response.data as any).created_at);
      }
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
    // Handle image download
    if (
      resultImageUrl &&
      (selectedFormat === "jpeg" ||
        selectedFormat === "png" ||
        contentType === "image")
    ) {
      const a = document.createElement("a");
      a.href = resultImageUrl;
      a.download = `generated-image.${selectedFormat === "jpeg" ? "jpg" : "png"}`;
      a.target = "_blank";
      a.click();
      return;
    }

    if (!caption) return;
    const fullContent = [
      title ? `# ${title}\n\n` : "",
      caption,
      offer ? `\n\nOffer: ${offer}` : "",
      callToAction ? `\n\nCall to Action: ${callToAction}` : "",
      hashtags.length > 0 ? `\n\n${hashtags.join(" ")}` : "",
    ].join("");

    if (selectedFormat === "html") {
      const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${title || "Marketing Content"}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6;}
h1{color:#333;}p{color:#555;}.hashtags{color:#7c6df0;margin-top:20px;}.cta{background:#7c3aed;color:#fff;padding:10px 20px;border-radius:6px;display:inline-block;margin-top:16px;text-decoration:none;}</style>
</head>
<body>
${title ? `<h1>${title}</h1>` : ""}
<p>${caption.replace(/\n/g, "</p><p>")}</p>
${offer ? `<p><strong>Offer:</strong> ${offer}</p>` : ""}
${callToAction ? `<a class="cta">${callToAction}</a>` : ""}
${hashtags.length > 0 ? `<p class="hashtags">${hashtags.join(" ")}</p>` : ""}
</body></html>`;
      const blob = new Blob([html], { type: "text/html" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "generated-content.html";
      a.click();
      URL.revokeObjectURL(objectUrl);
    } else if (selectedFormat === "pdf") {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`<!DOCTYPE html>
<html><head><title>${title || "Marketing Content"}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6;}h1{color:#333;}p{color:#555;}.hashtags{color:#6d28d9;}.cta{font-weight:bold;color:#7c3aed;}</style>
</head><body>
${title ? `<h1>${title}</h1>` : ""}
<p>${caption.replace(/\n/g, "</p><p>")}</p>
${offer ? `<p><strong>Offer:</strong> ${offer}</p>` : ""}
${callToAction ? `<p class="cta">👉 ${callToAction}</p>` : ""}
${hashtags.length > 0 ? `<p class="hashtags">${hashtags.join(" ")}</p>` : ""}
</body></html>`);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 500);
      }
    } else if (selectedFormat === "docx" || selectedFormat === "word") {
      // Generate RTF which Word can open
      const rtf = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Arial;}}
{\\colortbl;\\red124\\green109\\blue240;}
\\f0\\fs24
${title ? `{\\b\\fs32 ${title}}\\par\\par` : ""}
${caption.replace(/\n/g, "\\par ")}
${offer ? `\\par\\par {\\b Offer:} ${offer}` : ""}
${callToAction ? `\\par\\par {\\b Call to Action:} ${callToAction}` : ""}
${hashtags.length > 0 ? `\\par\\par {\\cf1 ${hashtags.join(" ")}}` : ""}
}`;
      const blob = new Blob([rtf], { type: "application/rtf" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "generated-content.rtf";
      a.click();
      URL.revokeObjectURL(objectUrl);
    } else {
      // Plain text default
      const blob = new Blob([fullContent], { type: "text/plain" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "generated-content.txt";
      a.click();
      URL.revokeObjectURL(objectUrl);
    }
  };

  const togglePlatform = (val: string) =>
    setSelectedPlatforms((prev) =>
      prev.includes(val) ? prev.filter((p) => p !== val) : [...prev, val],
    );

  const clearHistory = () => {
    setFromHistoryBanner(false);
    setBusiness(DEMO_BUSINESSES[0]);
    setCustomBusiness("");
    setPrompt("");
    setWebsiteUrl("");
    setContentType("flyer");
    setSelectedPlatforms([]);
    setCaption(null);
    setHashtags([]);
    setTitle(null);
    setOffer(null);
    setCallToAction(null);
    setResultImageUrl(null);
    setResultActionId(null);
    setResultCreatedAt(null);
    setInputTab("text");
  };

  return (
    <Box
      sx={{
        height: "100vh",
        bgcolor: "#0d0d0f",
        display: "flex",
        flexDirection: "column",
        overflow: { xs: "auto", md: "hidden" },
      }}
    >
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
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AutoAwesomeIcon sx={{ color: "#8b5cf6" }} />
          <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>
            MarketingAI
          </Typography>
        </Box>
        <Box
          sx={{ display: "flex", alignItems: "center", gap: { xs: 1, sm: 2 } }}
        >
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
          {(role === "ADMIN" || role === "SUPER_ADMIN") && (
            <Button
              onClick={() => navigate("/settings")}
              startIcon={<SettingsIcon />}
              sx={{
                color: "#a78bfa",
                textTransform: "none",
                fontSize: 14,
                "&:hover": { color: "#fff" },
              }}
            >
              Settings
            </Button>
          )}
          <Typography
            sx={{
              color: "#475569",
              fontSize: 13,
              display: { xs: "none", md: "block" },
            }}
          >
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
            <Box
              component="span"
              sx={{ display: { xs: "none", sm: "inline" } }}
            >
              Sign Out
            </Box>
          </Button>
        </Box>
      </Box>

      {/* Body */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          overflow: { xs: "unset", md: "hidden" },
          flexDirection: { xs: "column", md: "row" },
        }}
      >
        {/* Left panel — full width mobile, 67% desktop */}
        <Box
          sx={{
            width: { xs: "100%", md: "67%" },
            flexShrink: 0,
            overflowY: { xs: "visible", md: "auto" },
            borderRight: { xs: "none", md: "1px solid #2a2a35" },
            borderBottom: { xs: "1px solid #2a2a35", md: "none" },
            px: { xs: "12px", sm: "18px" },
            py: "12px",
            display: "flex",
            flexDirection: "column",
            "&::-webkit-scrollbar": { width: 4 },
            "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
            "&::-webkit-scrollbar-thumb": {
              bgcolor: "rgba(124,109,240,0.3)",
              borderRadius: 2,
            },
          }}
        >
          {/* History banner */}
          {fromHistoryBanner && (
            <Box
              sx={{
                background: "#1a1730",
                border: "1px solid #7c6df0",
                borderRadius: "6px",
                p: "8px 12px",
                mb: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <Typography sx={{ color: "#a89cf0", fontSize: 11 }}>
                Editing from history — modify and regenerate, or clear to start
                fresh
              </Typography>
              <button
                onClick={clearHistory}
                style={{
                  background: "none",
                  border: "none",
                  color: "#a89cf0",
                  cursor: "pointer",
                  fontSize: 14,
                  padding: "0 0 0 8px",
                  lineHeight: 1,
                }}
              >
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
              MenuProps={
                {
                  PaperProps: {
                    sx: {
                      bgcolor: "#141418",
                      border: "0.5px solid #2a2a35",
                      color: "#e0dcf8",
                    },
                  },
                } as any
              }
            >
              {DEMO_BUSINESSES.map((b) => (
                <MenuItem
                  key={b}
                  value={b}
                  sx={{
                    fontSize: 12,
                    "&:hover": { bgcolor: "rgba(124,109,240,0.1)" },
                  }}
                >
                  {b}
                </MenuItem>
              ))}
              <MenuItem
                value="__custom__"
                sx={{
                  fontSize: 12,
                  color: "#7c6df0",
                  "&:hover": { bgcolor: "rgba(124,109,240,0.1)" },
                }}
              >
                + Type a different business
              </MenuItem>
            </Select>
            {isCustom && (
              <TextField
                fullWidth
                size="small"
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
                    onClick={
                      !tile.disabled
                        ? () => setContentType(tile.value)
                        : undefined
                    }
                    sx={{
                      position: "relative",
                      background: isSelected ? "#1a1730" : "#0d0d0f",
                      border: `0.5px solid ${isSelected ? "#7c6df0" : "#2a2a35"}`,
                      borderRadius: "8px",
                      py: { xs: "8px", sm: "12px" },
                      px: { xs: "4px", sm: "8px" },
                      cursor: tile.disabled ? "not-allowed" : "pointer",
                      opacity: tile.disabled ? 0.5 : 1,
                      textAlign: "center",
                      flex: {
                        xs: "0 0 calc(33.33% - 5px)",
                        sm: "0 0 calc(20% - 5px)",
                      },
                      boxSizing: "border-box",
                      "&:hover": !tile.disabled
                        ? { borderColor: "#7c6df0" }
                        : {},
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    {tile.disabled && (
                      <Box
                        sx={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          bgcolor: "#2a2a35",
                          color: "#666",
                          fontSize: "8px",
                          px: "4px",
                          py: "1px",
                          borderRadius: "3px",
                          lineHeight: 1.5,
                        }}
                      >
                        Soon
                      </Box>
                    )}
                    <i
                      className={`ti ${tile.icon}`}
                      style={{
                        fontSize: 20,
                        color: isSelected ? "#7c6df0" : "#555",
                        display: "block",
                        marginBottom: 4,
                      }}
                    />
                    <Typography
                      sx={{
                        fontSize: { xs: "10px", sm: "12px" },
                        fontWeight: 600,
                        color: "#e0dcf8",
                        lineHeight: 1.3,
                        mb: "2px",
                      }}
                    >
                      {tile.name}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "10px",
                        color: "#666",
                        lineHeight: 1.4,
                        display: { xs: "none", sm: "block" },
                      }}
                    >
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
                      onClick={
                        !isAuto ? () => setSelectedFormat(fmt) : undefined
                      }
                      sx={{
                        background: isSelected ? "#1a1730" : "#0d0d0f",
                        border: `0.5px solid ${isSelected ? "#7c6df0" : "#2a2a35"}`,
                        borderRadius: "8px",
                        py: { xs: "8px", sm: "12px" },
                        px: { xs: "4px", sm: "8px" },
                        cursor: isAuto ? "default" : "pointer",
                        opacity: isAuto ? 0.7 : 1,
                        textAlign: "center",
                        flex: {
                          xs: "0 0 calc(33.33% - 5px)",
                          sm: "0 0 calc(20% - 5px)",
                        },
                        boxSizing: "border-box",
                        "&:hover": !isAuto ? { borderColor: "#7c6df0" } : {},
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      <i
                        className={`ti ${def.icon}`}
                        style={{
                          fontSize: 20,
                          color: isSelected ? "#7c6df0" : "#555",
                          display: "block",
                          marginBottom: 4,
                        }}
                      />
                      <Typography
                        sx={{
                          fontSize: { xs: "10px", sm: "12px" },
                          fontWeight: 600,
                          color: "#e0dcf8",
                          lineHeight: 1.3,
                          mb: "2px",
                        }}
                      >
                        {def.name}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: "10px",
                          color: "#666",
                          lineHeight: 1.4,
                          display: { xs: "none", sm: "block" },
                        }}
                      >
                        {def.desc}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>

          {/* Bedrock Model card */}
          <Box sx={cardSx}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                mb: "8px",
              }}
            >
              <Typography sx={{ ...labelSx, mb: 0 }}>Bedrock Model</Typography>
              {modelsLoading ? (
                <CircularProgress size={10} sx={{ color: "#5a4fd0" }} />
              ) : (
                <Typography sx={{ color: "#5a4fd0", fontSize: "10px" }}>
                  Top 5 for {CONTENT_TYPE_CATEGORY[contentType] ?? "text"}
                </Typography>
              )}
            </Box>
            <Select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={modelsLoading}
              fullWidth
              renderValue={(val) => {
                const m = currentModels.find((m) => m.modelId === val);
                return (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Box>
                      <Typography
                        sx={{
                          fontSize: "13px",
                          fontWeight: 500,
                          color: "#e0dcf8",
                          lineHeight: 1.3,
                        }}
                      >
                        {m?.label ?? "Select model"}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: "10px",
                          color: "#7c6df0",
                          lineHeight: 1.5,
                        }}
                      >
                        {val}
                      </Typography>
                    </Box>
                  </Box>
                );
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              IconComponent={
                (() => (
                  <i
                    className="ti ti-chevron-down"
                    style={{
                      fontSize: 14,
                      color: "#888",
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                    }}
                  />
                )) as any
              }
              sx={{
                bgcolor: "#0d0d0f",
                borderRadius: "8px",
                "& .MuiOutlinedInput-notchedOutline": {
                  borderColor: "#3a3a4a",
                  borderWidth: "0.5px",
                },
                "&:hover .MuiOutlinedInput-notchedOutline": {
                  borderColor: "#7c6df0",
                },
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                  borderColor: "#7c6df0",
                },
                "& .MuiSelect-select": { p: "8px 12px" },
              }}
              MenuProps={
                {
                  PaperProps: {
                    sx: {
                      bgcolor: "#141418",
                      border: "0.5px solid #2a2a35",
                      maxHeight: 280,
                    },
                  },
                } as any
              }
            >
              {currentModels.map((m) => (
                <MenuItem
                  key={m.modelId}
                  value={m.modelId}
                  sx={{
                    flexDirection: "column",
                    alignItems: "flex-start",
                    py: 1,
                    "&:hover": { bgcolor: "rgba(124,109,240,0.1)" },
                    "&.Mui-selected": { bgcolor: "rgba(124,109,240,0.15)" },
                  }}
                >
                  <Typography
                    sx={{ color: "#e0dcf8", fontSize: 12, fontWeight: 600 }}
                  >
                    {m.label}
                  </Typography>
                  <Typography sx={{ color: "#555", fontSize: 10 }}>
                    {m.description}
                  </Typography>
                </MenuItem>
              ))}
            </Select>
          </Box>

          {/* Input card */}
          <Box sx={{ ...cardSx, mb: "8px" }}>
            {/* Tab bar */}
            <Box sx={{ display: "flex", gap: "6px", mb: "10px" }}>
              {INPUT_TABS.map((tab) => {
                const isActive = inputTab === tab.value;
                return (
                  <Box
                    key={tab.value}
                    component="button"
                    onClick={() => setInputTab(tab.value)}
                    sx={{
                      background: isActive ? "#2d2460" : "#1e1e2e",
                      border: `0.5px solid ${isActive ? "#7c6df0" : "#3a3a4a"}`,
                      borderRadius: "8px",
                      padding: { xs: "7px 8px", sm: "7px 14px" },
                      color: isActive ? "#e0dcf8" : "#aaa",
                      fontSize: { xs: "11px", sm: "12px" },
                      fontWeight: 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      outline: "none",
                      fontFamily: "inherit",
                      flex: 1,
                      justifyContent: "center",
                      transition:
                        "border-color 0.15s, background 0.15s, color 0.15s",
                      "&:hover": !isActive
                        ? {
                            borderColor: "#7c6df0",
                            color: "#c4bef8",
                            background: "#1a1730",
                          }
                        : {},
                    }}
                  >
                    <i
                      className={`ti ${tab.icon}`}
                      style={{ fontSize: 14, color: "#7c6df0" }}
                    />
                    <Box
                      component="span"
                      sx={{ display: { xs: "none", sm: "inline" } }}
                    >
                      {tab.label}
                    </Box>
                  </Box>
                );
              })}
            </Box>

            {/* Tab: Prompt text */}
            {inputTab === "text" && (
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Write a Facebook ad for our new summer sneaker collection targeting 18–30 year olds..."
                style={{
                  background: "#0d0d0f",
                  border: "0.5px solid #3a3a4a",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  color: "#e0dcf8",
                  fontSize: "13px",
                  minHeight: "100px",
                  resize: "none",
                  width: "100%",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  lineHeight: "1.6",
                  outline: "none",
                  display: "block",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#7c6df0";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#3a3a4a";
                }}
              />
            )}

            {/* Tab: Website URL */}
            {inputTab === "url" && (
              <input
                type="text"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://yourwebsite.com"
                style={{
                  background: "#0d0d0f",
                  border: "0.5px solid #3a3a4a",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  color: "#e0dcf8",
                  fontSize: "13px",
                  width: "100%",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  outline: "none",
                  display: "block",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#7c6df0";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#3a3a4a";
                }}
              />
            )}

            {/* Tab: Upload Image */}
            {inputTab === "image" && (
              <Box
                onClick={() => fileRef.current?.click()}
                sx={{
                  border: "0.5px dashed #3a3a4a",
                  borderRadius: "8px",
                  p: "28px 16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                  width: "100%",
                  boxSizing: "border-box" as const,
                  "&:hover": { borderColor: "#7c6df0" },
                  transition: "border-color 0.15s",
                }}
              >
                {fileName ? (
                  <>
                    <InsertDriveFileIcon
                      sx={{ color: "#7c6df0", fontSize: 24 }}
                    />
                    <Typography sx={{ color: "#a89cf0", fontSize: "12px" }}>
                      {fileName}
                    </Typography>
                  </>
                ) : (
                  <>
                    <i
                      className="ti ti-cloud-upload"
                      style={{ fontSize: 24, color: "#7c6df0" }}
                    />
                    <Typography sx={{ color: "#555", fontSize: "12px" }}>
                      Click to upload or drag & drop
                    </Typography>
                    <Typography sx={{ color: "#3a3a4a", fontSize: "10px" }}>
                      PNG, JPG, WEBP up to 10MB
                    </Typography>
                  </>
                )}
              </Box>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setFileName(file?.name ?? null);
                setUploadedFile(file);
              }}
            />

            {/* Divider */}
            <Box sx={{ height: "0.5px", bgcolor: "#2a2a35", my: "10px" }} />

            {/* Social media row */}
            <Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  mb: "6px",
                }}
              >
                <Typography sx={subLabelSx}>Publish to Social Media</Typography>
                <Typography
                  sx={{
                    color: "#555",
                    fontSize: "9px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
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
            disabled={loading || isInputEmpty}
            style={{
              width: "100%",
              background: loading || isInputEmpty ? "#22203a" : "#5a4fd0",
              border: "none",
              borderRadius: "8px",
              padding: "11px",
              color: loading || isInputEmpty ? "#5a4f90" : "#ffffff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading || isInputEmpty ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            {loading ? (
              <>
                <CircularProgress size={15} sx={{ color: "#a89cf0" }} />{" "}
                Generating...
              </>
            ) : (
              <>
                <i className="ti ti-sparkles" style={{ fontSize: 16 }} />{" "}
                Generate
              </>
            )}
          </button>
        </Box>

        {/* Right panel — 33% */}
        <Box
          sx={{
            flex: 1,
            bgcolor: "#0d0d0f",
            p: "20px",
            overflowY: "auto",
            "&::-webkit-scrollbar": { width: 4 },
            "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
            "&::-webkit-scrollbar-thumb": {
              bgcolor: "rgba(124,109,240,0.3)",
              borderRadius: 2,
            },
          }}
        >
          <Typography
            sx={{ fontSize: 16, fontWeight: 500, color: "#f0eeff", mb: "4px" }}
          >
            Result
          </Typography>
          <Typography sx={{ color: "#555", fontSize: "11px", mb: "16px" }}>
            Your AI-generated content appears here instantly.
          </Typography>

          {/* Empty state */}
          {!caption && !resultImageUrl && !error && !loading && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 200,
                gap: "12px",
              }}
            >
              <i
                className="ti ti-sparkles"
                style={{ fontSize: 32, color: "#333" }}
              />
              <Typography
                sx={{ color: "#333", fontSize: 12, textAlign: "center" }}
              >
                Your generated content will appear here.
              </Typography>
            </Box>
          )}

          {/* Loading */}
          {loading && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 200,
                gap: 2,
              }}
            >
              <CircularProgress sx={{ color: "#7c6df0" }} />
              <Typography sx={{ color: "#555", fontSize: 13 }}>
                Generating your content...
              </Typography>
            </Box>
          )}

          {/* Error */}
          {error && (
            <Box
              sx={{
                background: "#1a0808",
                border: "0.5px solid #5c1a1a",
                borderRadius: "8px",
                p: "12px",
              }}
            >
              <Typography sx={{ color: "#ef4444", fontSize: 13 }}>
                {error}
              </Typography>
            </Box>
          )}

          {/* Result content */}
          {(caption || resultImageUrl) && !loading && (
            <Box>
              {caption && (
                <Box sx={{ mb: 2 }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      mb: 1,
                    }}
                  >
                    <Typography
                      sx={{
                        color: "#888",
                        fontSize: 10,
                        fontWeight: 500,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      Generated Content
                    </Typography>
                    <Tooltip title={copied ? "Copied!" : "Copy to clipboard"}>
                      <Button
                        size="small"
                        onClick={handleCopy}
                        startIcon={
                          copied ? (
                            <CheckIcon fontSize="small" />
                          ) : (
                            <ContentCopyIcon fontSize="small" />
                          )
                        }
                        sx={{
                          color: copied ? "#22c55e" : "#555",
                          textTransform: "none",
                          fontSize: 11,
                          "&:hover": { color: "#a89cf0" },
                          minWidth: "auto",
                          p: "2px 8px",
                        }}
                      >
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </Tooltip>
                  </Box>
                  <Box
                    sx={{ height: "0.5px", bgcolor: "#2a2a35", mb: "12px" }}
                  />
                  {title && (
                    <Box sx={{ mb: "10px" }}>
                      <Typography
                        sx={{
                          color: "#888",
                          fontSize: 10,
                          fontWeight: 500,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          mb: "4px",
                        }}
                      >
                        Title
                      </Typography>
                      <Typography
                        sx={{ color: "#e0dcf8", fontSize: 13, fontWeight: 600 }}
                      >
                        {title}
                      </Typography>
                    </Box>
                  )}
                  {offer && (
                    <Box sx={{ mb: "10px" }}>
                      <Typography
                        sx={{
                          color: "#888",
                          fontSize: 10,
                          fontWeight: 500,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          mb: "4px",
                        }}
                      >
                        Offer
                      </Typography>
                      <Typography sx={{ color: "#e0dcf8", fontSize: 13 }}>
                        {offer}
                      </Typography>
                    </Box>
                  )}
                  {callToAction && (
                    <Box sx={{ mb: "10px" }}>
                      <Typography
                        sx={{
                          color: "#888",
                          fontSize: 10,
                          fontWeight: 500,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          mb: "4px",
                        }}
                      >
                        Call to Action
                      </Typography>
                      <Typography
                        sx={{ color: "#a89cf0", fontSize: 13, fontWeight: 600 }}
                      >
                        {callToAction}
                      </Typography>
                    </Box>
                  )}
                  <Typography
                    sx={{
                      color: "#e0dcf8",
                      fontSize: 13,
                      lineHeight: 1.8,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {caption}
                  </Typography>
                </Box>
              )}

              {hashtags.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography
                    sx={{
                      color: "#888",
                      fontSize: 10,
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      mb: 1,
                    }}
                  >
                    Hashtags
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {hashtags.map((tag) => (
                      <Box
                        key={tag}
                        sx={{
                          color: "#7c6df0",
                          fontSize: 12,
                          bgcolor: "rgba(124,109,240,0.1)",
                          px: "10px",
                          py: "3px",
                          borderRadius: "20px",
                          border: "0.5px solid rgba(124,109,240,0.25)",
                        }}
                      >
                        {tag}
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {resultImageUrl && (
                <Box sx={{ mb: 2 }}>
                  <Typography
                    sx={{
                      color: "#888",
                      fontSize: 10,
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      mb: 1,
                    }}
                  >
                    Generated Image
                  </Typography>
                  <Box
                    component="img"
                    src={resultImageUrl}
                    alt="Generated"
                    onClick={() => setLightboxOpen(true)}
                    sx={{
                      maxHeight: 200,
                      maxWidth: "100%",
                      objectFit: "contain",
                      borderRadius: "6px",
                      display: "block",
                      cursor: "zoom-in",
                      transition: "opacity 0.15s",
                      "&:hover": { opacity: 0.85 },
                    }}
                  />
                </Box>
              )}

              {/* Lightbox */}
              {lightboxOpen && resultImageUrl && (
                <Box
                  onClick={() => setLightboxOpen(false)}
                  sx={{
                    position: "fixed",
                    inset: 0,
                    bgcolor: "rgba(0,0,0,0.85)",
                    zIndex: 1300,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "zoom-out",
                  }}
                >
                  <Box
                    component="img"
                    src={resultImageUrl}
                    alt="Generated full size"
                    sx={{
                      maxWidth: "90vw",
                      maxHeight: "90vh",
                      objectFit: "contain",
                      borderRadius: "8px",
                      boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
                    }}
                  />
                </Box>
              )}

              <Box sx={{ height: "0.5px", bgcolor: "#2a2a35", my: "12px" }} />

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<DownloadIcon fontSize="small" />}
                  onClick={handleDownload}
                  sx={{
                    color: "#7c6df0",
                    borderColor: "rgba(124,109,240,0.5)",
                    textTransform: "none",
                    borderRadius: "6px",
                    fontSize: 12,
                    "&:hover": { bgcolor: "rgba(124,109,240,0.08)" },
                  }}
                >
                  Download .{selectedFormat || "txt"}
                </Button>
                {selectedPlatforms.length > 0 && (
                  <Button
                    variant="outlined"
                    size="small"
                    sx={{
                      color: "#22c55e",
                      borderColor: "rgba(34,197,94,0.5)",
                      textTransform: "none",
                      borderRadius: "6px",
                      fontSize: 12,
                      "&:hover": { bgcolor: "rgba(34,197,94,0.08)" },
                    }}
                  >
                    Publish to {selectedPlatforms.join(", ")}
                  </Button>
                )}
                {caption && (
                  <Tooltip
                    title={
                      linkedinConnected
                        ? ""
                        : "Connect LinkedIn in Account Settings"
                    }
                    placement="top"
                  >
                    <span>
                      <Button
                        variant="contained"
                        size="small"
                        disabled={!linkedinConnected || publishingToLinkedIn}
                        onClick={handleLinkedInPublish}
                        startIcon={
                          publishingToLinkedIn ? (
                            <CircularProgress
                              size={12}
                              sx={{ color: "#fff" }}
                            />
                          ) : (
                            <LinkedInIcon fontSize="small" />
                          )
                        }
                        sx={{
                          bgcolor: "#0077b5",
                          textTransform: "none",
                          borderRadius: "6px",
                          fontSize: 12,
                          "&:hover": { bgcolor: "#005f8f" },
                          "&.Mui-disabled": {
                            bgcolor: "#003850",
                            color: "#335870",
                          },
                        }}
                      >
                        Post to LinkedIn
                      </Button>
                    </span>
                  </Tooltip>
                )}
                {caption && (
                  <Tooltip
                    title={
                      facebookConnected
                        ? ""
                        : "Connect Facebook in Account Settings"
                    }
                    placement="top"
                  >
                    <span>
                      <Button
                        variant="contained"
                        size="small"
                        disabled={!facebookConnected || publishingToFacebook}
                        onClick={handleFacebookPublish}
                        startIcon={
                          publishingToFacebook ? (
                            <CircularProgress
                              size={12}
                              sx={{ color: "#fff" }}
                            />
                          ) : (
                            <FacebookIcon fontSize="small" />
                          )
                        }
                        sx={{
                          bgcolor: "#1877f2",
                          textTransform: "none",
                          borderRadius: "6px",
                          fontSize: 12,
                          "&:hover": { bgcolor: "#145dbf" },
                          "&.Mui-disabled": {
                            bgcolor: "#0f3a73",
                            color: "#4e78ac",
                          },
                        }}
                      >
                        Post to Facebook
                      </Button>
                    </span>
                  </Tooltip>
                )}
                {caption && (
                  <Tooltip
                    title={
                      instagramConnected
                        ? ""
                        : "Connect Facebook (with a linked Instagram account) in Account Settings"
                    }
                    placement="top"
                  >
                    <span>
                      <Button
                        variant="contained"
                        size="small"
                        disabled={!instagramConnected || publishingToInstagram}
                        onClick={handleInstagramPublish}
                        startIcon={
                          publishingToInstagram ? (
                            <CircularProgress
                              size={12}
                              sx={{ color: "#fff" }}
                            />
                          ) : (
                            <InstagramIcon fontSize="small" />
                          )
                        }
                        sx={{
                          bgcolor: "#e1306c",
                          textTransform: "none",
                          borderRadius: "6px",
                          fontSize: 12,
                          "&:hover": { bgcolor: "#b81f57" },
                          "&.Mui-disabled": {
                            bgcolor: "#5c1430",
                            color: "#a06080",
                          },
                        }}
                      >
                        Post to Instagram
                      </Button>
                    </span>
                  </Tooltip>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
      <Snackbar
        open={publishSnackbar.open}
        autoHideDuration={5000}
        onClose={() => setPublishSnackbar((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={publishSnackbar.severity}
          onClose={() => setPublishSnackbar((p) => ({ ...p, open: false }))}
          sx={{
            bgcolor:
              publishSnackbar.severity === "success" ? "#0d2010" : "#1a0808",
            color:
              publishSnackbar.severity === "success" ? "#22c55e" : "#ef4444",
            border: `0.5px solid ${publishSnackbar.severity === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            "& .MuiAlert-icon": {
              color:
                publishSnackbar.severity === "success" ? "#22c55e" : "#ef4444",
            },
          }}
        >
          {publishSnackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
