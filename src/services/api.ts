import axios from "axios";

const API_URL = "https://l9k0b4he7h.execute-api.us-east-2.amazonaws.com/dev";

export interface GenerateCaptionResponse {
  caption: string;
  hashtags: string[];
}

export const generateCaption = async (
  prompt: string,
  business: string,
  contentType: string,
  platforms: string[]
) => {
  return axios.post<GenerateCaptionResponse>(`${API_URL}/generate`, {
    prompt,
    business,
    contentType,
    platforms,
  }, {
    headers: { "Content-Type": "application/json" },
  });
};

export interface HistoryItem {
  action_id: string;
  input_value: string;
  caption: string;
  created_at: string;
  business?: string;
  content_type?: string;
  platforms?: string[];
  hashtags?: string[];
  status?: string;
}

export const getHistory = async (): Promise<HistoryItem[]> => {
  const res = await axios.get(`${API_URL}/history`);
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  return Array.isArray(data) ? data : [];
};