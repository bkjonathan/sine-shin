import { invoke } from "@tauri-apps/api/core";

export interface LoginUserResponse {
  name: string;
  role: string;
}

export interface RegisterUserPayload {
  name: string;
  password: string;
}

export const loginUser = async (
  name: string,
  password: string,
): Promise<LoginUserResponse> => {
  return invoke<LoginUserResponse>("login_user", { name, password });
};

export const registerUser = async (
  payload: RegisterUserPayload,
): Promise<void> => {
  return invoke("register_user", {
    name: payload.name,
    password: payload.password,
  });
};
