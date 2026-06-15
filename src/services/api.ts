import axios from "axios";

const API_URL = import.meta.env.DEV
  ? "/api"
  : "https://r2f4pnjci1.execute-api.us-east-1.amazonaws.com/dev";

export interface GenerateCaptionResponse {
  caption: string;
  hashtags: string[];
}

export const generateCaption = async (prompt: string) => {
  return axios.post<GenerateCaptionResponse>(`${API_URL}/generate`, { prompt }, {
    headers: { "Content-Type": "application/json" },
  });
};

export interface HistoryItem {
  action_id: string;
  input_value: string;
  caption: string;
  created_at: string;
}

export const getHistory = async (): Promise<HistoryItem[]> => {
  const res = await axios.get<HistoryItem[]>(`${API_URL}/history`);
  return Array.isArray(res.data) ? res.data : [];
};