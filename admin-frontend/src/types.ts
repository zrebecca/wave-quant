export type Role = "admin" | "viewer";

export interface User {
  id: number;
  username: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface CreateMemberPayload {
  username: string;
  password: string;
  role: Role;
}

export interface UpdateMemberPayload {
  password?: string;
  role?: Role;
  is_active?: boolean;
}
