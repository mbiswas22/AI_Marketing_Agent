import axios from "axios";
import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = "https://l9k0b4he7h.execute-api.us-east-2.amazonaws.com/dev";

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ================== Generate

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

export const generateImage = async (prompt: string): Promise<string> => {
  const res = await api.post(`/generate-image`, { prompt });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  return data.imageUrl;
};
// =========== Model
export interface BedrockModel {
  modelId: string;
  label: string;
  description: string;
}

export const getModels = async (category: string): Promise<BedrockModel[]> => {
  const res = await api.get<BedrockModel[]>(`/models`, { params: { category } });
  return Array.isArray(res.data) ? res.data : [];
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

export const getHistory = async (userId?: string): Promise<HistoryItem[]> => {
  const res = await api.get(`/history`, { params: userId ? { userId } : {} });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  return Array.isArray(data) ? data : [];
};

// =============== USER
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
  userId: string;
  email: string;
  role: string;
  displayName: string;
  phoneNumber?: string;
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

export const getUser = async (userId: string, businessId: string): Promise<User> => {
  const res = await api.get(`/users/${userId}`, { params: { businessId } });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  return data?.user ?? data;
};

export const updateUserCognitoId = async (
  invitationUserId: string,
  cognitoUserId: string,
  businessId: string
): Promise<void> => {
  await api.put(`/users/${invitationUserId}}?businessId=${businessId}`, { userId: cognitoUserId });
};

export const updateUser = async (
  userId: string,
  data: { businessId: string; email: string; role: string; displayName: string; phoneNumber?: string }
): Promise<User> => {
  const res = await api.put(`/users/${userId}`, data);
  return res.data;
};


// =============== Invite User
export interface InviteUserPayload {
  businessName: string;
  businessId?: string;
  userName: string;
  userId: string;
  role: string;
  userEmail: string;
  userPhoneNumber: string;
  invitationLink: string;
  expirationTime: string;
  invitationId: string;
}

export const inviteUser = async (payload: InviteUserPayload): Promise<void> => {
  await api.post(`/invitations`, payload);
};

export const sendInviteEmail = async (payload: {
  toEmail: string;
  subject: string;
  message: string;
}): Promise<void> => {
  await api.post(`/send-email`, payload);
};

export interface InvitationResponse {
  invitationId: string;
  businessId: string;
  businessName: string;
  userName: string;
  userId: string;
  role: string;
  userEmail: string;
  userPhoneNumber: string;
  status: string;
}

export const getInvitation = async (invitationId: string): Promise<InvitationResponse> => {
  const res = await api.get(`/invitations/${invitationId}`);
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  return data?.invitation ?? data;
};

export const updateInvitation = async (
  invitationId: string,
  payload: { status: string }
): Promise<void> => {
  await api.put(`/invitations/${invitationId}`, payload);
};

// =========== Business
export interface Business {
  businessId: string;
  businessName: string;
  businessType: string;
  status: string;
  createdAt: string;
  phone?: string;
  region?: string;
}

export const getBusinesses = async (): Promise<Business[]> => {
  const res = await api.get(`/business`);
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  return Array.isArray(data) ? data : data?.businesses ?? [];
};

export const createBusiness = async (payload: {
  businessId?: string;
  businessName: string;
  businessType: string;
  ownerName?: string;
  ownerEmail?: string;
  status?: string;
}): Promise<{ businessId?: string }> => {
  const res = await api.post(`/business`, payload);
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  return data?.business ?? data;
};

export const updateBusiness = async (
  businessId: string,
  payload: { businessName: string; businessType: string; status: string }
): Promise<void> => {
  await api.put(`/business/${businessId}`, payload);
};

export const deleteBusiness = async (businessId: string): Promise<void> => {
  await api.delete(`/business/${businessId}`);
};

// =============== SocialConnection
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

export const getMetaAuthUrl = async (): Promise<string> => {
  const res = await api.get(`/social/meta/authorize`);
  return res.data.authUrl;
};

export interface MetaPageInfo {
  platform: string;
  status: string;
  pageName?: string;
  pageId?: string;
  connectedAt?: string;
}

export const getMetaPages = async (): Promise<MetaPageInfo> => {
  const res = await api.get(`/social/meta/pages`);
  return res.data;
};

export const publishToLinkedIn = async (payload: {
  text?: string;
  image_key?: string;
}): Promise<{ success: boolean; postId: string }> => {
  const res = await api.post(`/social/linkedin/publish`, payload);
  return res.data;
};

export interface CrawlWebsiteResponse {
  websiteData: { title: string; h1: string[]; h2: string[] };
  businessType: string;
  services?: {
    services: string[];
    hours: string;
    contact: { phone: string; email: string; address: string };
  };
  marketing: { caption?: string; hashtags?: string[]; image_prompt?: string };
  imageUrl?: string;
}

export const crawlWebsite = async (
  url: string,
  contentType: string,
  platforms: string[]
): Promise<CrawlWebsiteResponse> => {
  const res = await api.post<CrawlWebsiteResponse>(`/crawl`, {
    url,
    contentType,
    platforms,
  });
  return res.data;
};


