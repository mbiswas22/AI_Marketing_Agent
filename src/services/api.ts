import axios from "axios";
import { fetchAuthSession } from "aws-amplify/auth";

//PROD
// const API_URL = "https://pm5vf9za4a.execute-api.us-east-2.amazonaws.com/dev";

//DEV
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
  modelId: string,
  imageBase64?: string,
  inputType?: string,
  businessId?: string
) => {
  const endpoint = imageBase64 ? `/image` : `/generate`;
  return api.post<GenerateAssetResponse>(endpoint, {
    prompt,
    business,
    content_type: contentType,
    output_format: outputFormat,
    platforms,
    modelId,
    input_type: inputType || "text",
    ...(imageBase64 && { image_base64: imageBase64 }),
    ...(businessId && { businessId }),
  });
};

export const generateCaption = async (
  prompt: string,
  business: string,
  contentType: string,
  platforms: string[],
  modelId: string,
  imageBase64?: string,
  businessId?: string
) => {
  return api.post<GenerateCaptionResponse>(`/generate`, {
    prompt,
    business,
    contentType,
    platforms,
    modelId: 'us.' + modelId,
    ...(imageBase64 && { image_base64: imageBase64 }),
    ...(businessId && { businessId }),
  });
};

export interface GenerateImageResponse {
  imageUrl: string;
  action_id: string;
}

export const generateImage = async (prompt: string, business?: string, businessId?: string): Promise<string> => {
  const res = await api.post(`/image`, {
    prompt,
    business: business || "My Business",
    content_type: "image",
    input_type: "text",
    input_value: prompt,
    ...(businessId && { businessId }),
  });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  return data.imageUrl || data.image_url;
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
  let data = res.data;
  // Unwrap any level of stringification
  while (typeof data === "string") {
    try { data = JSON.parse(data); } catch { break; }
  }
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
  await api.put(`/users/${invitationUserId}`, { userId: cognitoUserId, businessId });
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
  ownerEmail?: string;
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

export const getSocialConnections = async (businessId: string): Promise<SocialConnection[]> => {
  const res = await api.get(`/social/connections`, { params: { businessId } });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  return Array.isArray(data) ? data : [];
};

export const getLinkedInAuthUrl = async (businessId: string): Promise<string> => {
  const res = await api.get(`/social/linkedin/authorize`, { params: { businessId } });
  return res.data.authUrl;
};

export const disconnectSocialPlatform = async (platform: string, businessId: string): Promise<void> => {
  await api.delete(`/social/connections/${platform}`, { params: { businessId } });
};

export const getMetaAuthUrl = async (businessId: string): Promise<string> => {
  const res = await api.get(`/social/meta/authorize`, { params: { businessId } });
  return res.data.authUrl;
};

export interface MetaPageInfo {
  platform: string;
  status: string;
  pageName?: string;
  pageId?: string;
  connectedAt?: string;
}

export const getMetaPages = async (businessId: string): Promise<MetaPageInfo> => {
  const res = await api.get(`/social/meta/pages`, { params: { businessId } });
  return res.data;
};

export const publishToLinkedIn = async (payload: {
  text?: string;
  image_key?: string;
  action_id?: string;
  createdAt?: string;
  businessId?: string;
}): Promise<{ success: boolean; postId: string }> => {
  const res = await api.post(`/social/linkedin/publish`, payload);
  return res.data;
};

export const publishToFacebook = async (payload: {
  text?: string;
  image_key?: string;
  businessId?: string;
}): Promise<{ success: boolean; postId: string }> => {
  const res = await api.post(`/social/meta/publish`, payload);
  return res.data;
};

export interface InstagramInfo {
  platform: string;
  status: string;
  pageName?: string;
  instagramBusinessAccountId?: string;
  connectedAt?: string;
}

export const getInstagramStatus = async (businessId: string): Promise<InstagramInfo> => {
  const res = await api.get(`/social/meta/instagram`, { params: { businessId } });
  return res.data;
};

export const publishToInstagram = async (payload: {
  text?: string;
  image_key?: string;
  video_key?: string;
  businessId?: string;
}): Promise<{ success: boolean; postId?: string; processing?: boolean; error?: string }> => {
  const res = await api.post(`/social/meta/instagram/publish`, payload);
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
  marketing: { caption?: string; hashtags?: string[]; image_prompt?: string; headline?: string; subheadline?: string; call_to_action?: string };
  imageUrl?: string;
  image_url?: string;
}

export const viewSchedule = async (schedule_id: string): Promise<Record<string, unknown>> => {
  const res = await api.post(`/schedule`, {
    action: "view_schedule",
    body: { schedule_id },
  });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  if (data.error) throw new Error(data.error);
  return data;
};

export const deleteSchedule = async (schedule_id: string): Promise<void> => {
  const res = await api.post(`/schedule`, {
    action: "delete_schedule",
    body: { schedule_id },
  });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  if (data.error) throw new Error(data.error);
};

export const reactivateSchedule = async (schedule_id: string): Promise<void> => {
  const res = await api.post(`/schedule`, {
    action: "reactivate_schedule",
    body: { schedule_id },
  });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  if (data.error) throw new Error(data.error);
};

export const inactiveSchedule = async (schedule_id: string): Promise<void> => {
  const res = await api.post(`/schedule`, {
    action: "inactive_schedule",
    body: { schedule_id },
  });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  if (data.error) throw new Error(data.error);
};

export const updateSchedule = async (payload: {
  schedule_id: string;
  schedule_expression: string;
  timezone?: string;
}): Promise<{ message: string; schedule_id: string }> => {
  const res = await api.post(`/schedule`, {
    action: "update_schedule",
    body: payload,
  });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  if (data.error) throw new Error(data.error);
  return data;
};

export const createSchedule = async (payload: {
  user_id: string;
  businessId: string;
  platform: string;
  content_type: string;
  schedule_expression: string;
  input_type: string;
  input_value: string;
  business?: string;
  modelId?: string;
  timezone?: string;
  connectionId?: string;
  createdByUserId?: string;
}): Promise<{ message: string; schedule_id: string; schedule_name: string }> => {
  const res = await api.post(`/schedule`, {
    action: "create_schedule",
    body: payload,
  });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  if (data.error) throw new Error(data.error);
  return data;
};

export const listSchedules = async (businessId: string): Promise<Record<string, unknown>[]> => {
  const res = await api.post(`/schedule`, {
    action: "list_schedules",
    body: { businessId },
  });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  if (data.error) throw new Error(data.error);
  return Array.isArray(data) ? data : [];
};

export const listScheduleLogs = async (businessId: string): Promise<Record<string, unknown>[]> => {
  const res = await api.post(`/schedule`, {
    action: "list_logs",
    body: { businessId },
  });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  if (data.error) throw new Error(data.error);
  return Array.isArray(data) ? data : [];
};

export const crawlWebsite = async (
  url: string,
  contentType: string,
  platforms: string[],
  businessId?: string
): Promise<CrawlWebsiteResponse> => {
  const res = await api.post<CrawlWebsiteResponse>(`/crawl`, {
    url,
    contentType,
    platforms,
    ...(businessId && { businessId }),
  });
  return res.data;
};

