import { invoke } from "@tauri-apps/api/core";

export interface StaffUser {
  id: string;
  email: string;
  user_metadata: StaffUserMetadata;
  created_at: string;
  updated_at: string;
}

export interface StaffUserMetadata {
  name?: string;
  role?: string;
  [key: string]: unknown;
}

export type StaffUsersResponse = StaffUser[] | { users: StaffUser[] };

export async function getStaffUsers(): Promise<StaffUsersResponse> {
  return invoke("get_staff_users");
}

export async function createStaffUser(
  email: string,
  password: string,
  data: StaffUserMetadata,
): Promise<StaffUser> {
  return invoke("create_staff_user", { email, password, data });
}

export async function updateStaffUser(
  id: string,
  email?: string,
  password?: string,
  data?: StaffUserMetadata,
): Promise<StaffUser> {
  return invoke("update_staff_user", { id, email, password, data });
}

export async function deleteStaffUser(id: string): Promise<void> {
  return invoke("delete_staff_user", { id });
}
