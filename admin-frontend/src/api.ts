import axios from "axios";
import type {
  CreateMemberPayload,
  LoginResponse,
  UpdateMemberPayload,
  User,
} from "@/types";

const TOKEN_KEY = "okx_admin_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

const http = axios.create({ baseURL: "/api", timeout: 20000 });

http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (error) => {
    const url: string = error?.config?.url ?? "";
    if (error?.response?.status === 401 && !url.includes("/auth/login")) {
      tokenStore.clear();
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  }
);

export const api = {
  login: (username: string, password: string) =>
    http.post<LoginResponse>("/auth/login", { username, password }).then((r) => r.data),
  me: () => http.get<User>("/auth/me").then((r) => r.data),

  listMembers: () => http.get<User[]>("/members").then((r) => r.data),
  createMember: (payload: CreateMemberPayload) =>
    http.post<User>("/members", payload).then((r) => r.data),
  updateMember: (id: number, payload: UpdateMemberPayload) =>
    http.put<User>(`/members/${id}`, payload).then((r) => r.data),
  deleteMember: (id: number) =>
    http.delete<{ msg: string }>(`/members/${id}`).then((r) => r.data),
};

export default api;
