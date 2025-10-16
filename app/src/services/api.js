import axios from "axios";

const api = axios.create({
  baseURL: "http://10.193.196.8:8000",
});

export default api;
