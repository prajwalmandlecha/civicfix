import axios from "axios";
import { auth } from "./firebase";

const api = axios.create({
  baseURL: "https://civicfix-backend-809180458813.asia-south1.run.app",
});

api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
