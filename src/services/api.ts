import axios from "axios";

const API_URL = "https://3xw44p0uke.execute-api.us-east-2.amazonaws.com";

export interface GenerateCaptionResponse {
  action_id: string;
  userId: string;
  result: {
    caption: string;
    hashtags: string[];
    call_to_action: string;
  };
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