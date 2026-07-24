import type { BedrockModel } from "../services/api";

export const DEMO_BUSINESSES = ["My Business", "Acme Corp", "Green Leaf Cafe"];

export const FALLBACK_MODELS: Record<string, BedrockModel[]> = {
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

export const CONTENT_TYPE_CATEGORY: Record<string, string> = {
  flyer:               "text",
  blog:                "text",
  email:               "text",
  video_script:        "text",
  product_description: "text",
  social_caption:      "text",
  image:               "image",
  merchandise:         "image",
};

export const CONTENT_TILES = [
  { value: "flyer",               icon: "ti-speakerphone",   name: "Flyer",          desc: "Bold visual for print or digital" },
  { value: "blog",                icon: "ti-article",        name: "Blog",           desc: "Long-form SEO article or post" },
  { value: "email",               icon: "ti-mail",           name: "Email",          desc: "Campaign or newsletter copy" },
  { value: "video_script",        icon: "ti-player-play",    name: "Video Script",   desc: "Scripted scenes with narration" },
  { value: "product_description", icon: "ti-tag",            name: "Product Desc.",  desc: "E-commerce listing copy" },
  { value: "social_caption",      icon: "ti-hash",           name: "Social Caption", desc: "Caption and hashtags for social" },
  { value: "image",               icon: "ti-photo",          name: "Image",          desc: "AI-generated visual asset" },
  { value: "merchandise",         icon: "ti-shirt",          name: "Merchandise",    desc: "Product concept with visual" },
];

export const OUTPUT_FORMATS_BY_TYPE: Record<string, string[]> = {
  flyer:               ["pdf", "word", "plain_text", "html"],
  blog:                ["pdf", "word", "plain_text", "html"],
  email:               ["pdf", "word", "plain_text", "html"],
  video_script:        ["pdf", "word", "plain_text", "html"],
  product_description: ["pdf", "word", "plain_text", "html"],
  social_caption:      ["plain_text"],
  image:               ["png", "jpeg", "pdf"],
  merchandise:         ["png", "jpeg", "pdf"],
};

export const FORMAT_DEFS: Record<string, { icon: string; name: string; desc: string }> = {
  pdf:        { icon: "ti-file-type-pdf", name: "PDF",        desc: "Shareable, print-ready doc" },
  word:       { icon: "ti-file-type-doc", name: "Word",       desc: "Editable .docx for Office" },
  plain_text: { icon: "ti-align-left",    name: "Plain Text", desc: "Raw text, easy to copy" },
  html:       { icon: "ti-code",          name: "HTML",       desc: "Embeddable web markup" },
  png:        { icon: "ti-photo",         name: "PNG",        desc: "Lossless, best quality" },
  jpeg:       { icon: "ti-photo",         name: "JPEG",       desc: "Compressed, smaller file" },
};

export const SOCIAL_PLATFORMS = [
  { value: "facebook",  label: "Facebook",  icon: "ti-brand-facebook" },
  { value: "instagram", label: "Instagram", icon: "ti-brand-instagram" },
  { value: "youtube",   label: "YouTube",   icon: "ti-brand-youtube" },
  { value: "linkedin",  label: "LinkedIn",  icon: "ti-brand-linkedin" },
];

export const INPUT_TABS = [
  { value: "text"  as const, icon: "ti-pencil",   label: "Prompt" },
  { value: "url"   as const, icon: "ti-world",    label: "Website URL" },
  { value: "image" as const, icon: "ti-photo-up", label: "Upload Image" },
];

export const cardSx = {
  background: "#141418",
  border: "0.5px solid #2a2a35",
  borderRadius: "10px",
  p: "12px 14px",
  mb: "8px",
  flexShrink: 0,
} as const;

export const labelSx = {
  fontSize: "10px",
  fontWeight: 500,
  letterSpacing: "0.08em",
  color: "#888",
  textTransform: "uppercase" as const,
  display: "block",
  mb: "8px",
};

export const subLabelSx = {
  fontSize: "9px",
  fontWeight: 500,
  letterSpacing: "0.08em",
  color: "#888",
  textTransform: "uppercase" as const,
  display: "block",
  mb: "4px",
};

export const darkSelectSx = {
  color: "#e0dcf8",
  bgcolor: "#0d0d0f",
  borderRadius: "8px",
  fontSize: "12px",
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "#3a3a4a", borderWidth: "0.5px" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#7c6df0" },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#7c6df0" },
  "& .MuiSvgIcon-root": { color: "#888" },
};

export const darkInputSx = {
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
