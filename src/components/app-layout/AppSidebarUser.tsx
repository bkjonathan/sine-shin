import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getRoleLabel(role: string | undefined, t: (key: string) => string): string {
  const normalizedRole = role?.trim().toLowerCase();
  if (normalizedRole === "admin") return t("nav.admin");
  if (normalizedRole === "owner") return t("nav.owner");
  if (!normalizedRole) return t("nav.owner");
  return normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1);
}

export default function AppSidebarUser() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const displayName = user?.name?.trim() || t("nav.admin");
  const displayRole = getRoleLabel(user?.role, t);
  const initials = getInitials(displayName);

  return (
    <div className="p-4 border-t border-white/5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-linear-to-br from-accent-blue to-accent-purple flex items-center justify-center text-xs font-bold text-white">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{displayName}</p>
          <p className="text-xs text-text-muted truncate">{displayRole}</p>
        </div>
      </div>
    </div>
  );
}
