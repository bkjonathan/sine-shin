import { invoke } from "@tauri-apps/api/core";

export interface StaffUser {
  id: string;
  email: string;
  user_metadata: {
    name?: string;
    role?: string;
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}

export async function getStaffUsers(): Promise<{ users: StaffUser[] }> {
  return invoke("get_staff_users");
}

export async function createStaffUser(
  email: string,
  password: string,
  data: any,
): Promise<StaffUser> {
  return invoke("create_staff_user", { email, password, data });
}

export async function updateStaffUser(
  id: string,
  email?: string,
  password?: string,
  data?: any,
): Promise<StaffUser> {
  return invoke("update_staff_user", { id, email, password, data });
}

export async function deleteStaffUser(id: string): Promise<void> {
  return invoke("delete_staff_user", { id });
}
