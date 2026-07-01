import axios from "axios";
import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = "https://l9k0b4he7h.execute-api.us-east-2.amazonaws.com/dev";

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface GenerateCaptionResponse {
  caption?: string;
  hashtags?: string[];
  image_url?: string;
  title?: string;
  offer?: string;
  call_to_action?: string;
}

export interface GenerateAssetResponse {
  caption?: string;
  hashtags?: string[];
  image_url?: string;
}

export const generateMarketAsset = async (
  prompt: string,
  business: string,
  contentType: string,
  outputFormat: string,
  platforms: string[],
  modelId: string
) => {
  return api.post<GenerateAssetResponse>(`/generate`, {
    prompt,
    business,
    content_type: contentType,
    output_format: outputFormat,
    platforms,
    modelId,
  });
};

export const generateCaption = async (
  prompt: string,
  business: string,
  contentType: string,
  platforms: string[],
  modelId: string
) => {
  return api.post<GenerateCaptionResponse>(`/generate`, {
    prompt,
    business,
    contentType,
    platforms,
    modelId: 'us.' + modelId,
  });
};

export interface GenerateImageResponse {
  imageUrl: string;
  action_id: string;
}

export const generateImage = async (payload: {
  business: string;
  contentType: string;
  platforms: string[];
  modelId: string;
  input_type: "text" | "website" | "image";
  input_value: string;
}) => {
  const res = await api.post(`/image`, payload);
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  return { data: data as GenerateImageResponse };
};

export interface HistoryItem {
  action_id: string;
  input_value?: string;
  prompt?: string;
  caption?: string;
  image_url?: string;
  image_key?: string;
  s3_key?: string;
  created_at: string;
  business?: string;
  content_type?: string;
  platforms?: string[];
  hashtags?: string[];
  status?: string;
}

export interface BedrockModel {
  modelId: string;
  label: string;
  description: string;
}

export const getModels = async (category: string): Promise<BedrockModel[]> => {
  const res = await api.get<BedrockModel[]>(`/models`, { params: { category } });
  return Array.isArray(res.data) ? res.data : [];
};

export const getHistory = async (): Promise<HistoryItem[]> => {
  const res = await api.get(`/history`);
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  return Array.isArray(data) ? data : [];
};

export interface User {
  userId: string;
  businessId: string;
  email: string;
  role: string;
  displayName: string;
  status: string;
  createdAt: string;
}

export const getUsers = async (businessId: string): Promise<User[]> => {
  const res = await api.get(`/users`, { params: { businessId } });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.users)) return data.users;
  return [];
};

export const createUser = async (data: {
  businessId: string;
  email: string;
  role: string;
  displayName: string;
}): Promise<User> => {
  const res = await api.post(`/users`, data);
  return res.data;
};

export const deleteUser = async (
  businessId: string,
  userId: string
): Promise<void> => {
  await api.delete(`/users/${userId}`, { params: { businessId } });
};

export const updateUser = async (
  userId: string,
  data: { businessId: string; email: string; role: string; displayName: string }
): Promise<User> => {
  const res = await api.put(`/users/${userId}`, data);
  return res.data;
};

export interface SocialConnection {
  platform: string;
  status: string;
  displayName: string | null;
  connectedAt: string | null;
}

export const getSocialConnections = async (): Promise<SocialConnection[]> => {
  const res = await api.get(`/social/connections`);
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  return Array.isArray(data) ? data : [];
};

export const getLinkedInAuthUrl = async (): Promise<string> => {
  const res = await api.get(`/social/linkedin/authorize`);
  return res.data.authUrl;
};

export const disconnectSocialPlatform = async (platform: string): Promise<void> => {
  await api.delete(`/social/connections/${platform}`);
};

export const publishToLinkedIn = async (payload: {
  text?: string;
  image_key?: string;
}): Promise<{ success: boolean; postId: string }> => {
  const res = await api.post(`/social/linkedin/publish`, payload);
  return res.data;
};