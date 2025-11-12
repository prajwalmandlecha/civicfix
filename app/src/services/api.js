import axios from "axios";
import { auth } from "./firebase";
import { API_URL } from "../constants/config";

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch (error) {
      console.error("Error getting ID token:", error);
    }
  }
  return config;
});

export default api;
