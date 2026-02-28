import { useState, useEffect } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useSound } from "../context/SoundContext";
import { Button, Input } from "../components/ui";
import {
  IconUsers,
  IconPlus,
  IconSearch,
  IconLayoutGrid,
  IconTable,
  IconTrash,
  IconEdit,
} from "../components/icons";
import { StaffUser, getStaffUsers, deleteStaffUser } from "../api/staffApi";
import StaffFormModal from "../components/pages/staff/StaffFormModal";
import StaffDeleteModal from "../components/pages/staff/StaffDeleteModal";

const fadeVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

export default function Staff() {
  const { t } = useTranslation();
  const { playSound } = useSound();

  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [viewMode, setViewMode] = useState<"grid" | "table">(() => {
    return (
      (localStorage.getItem("staff_view_mode") as "grid" | "table") ?? "grid"
    );
  });

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<StaffUser | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim().toLowerCase());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data: any = await getStaffUsers();
      // Supabase returns an array of users, or an object, let's assume it returns an array.
      // Sometimes it returns { users: [...] }. Let's handle both.
      const userList = Array.isArray(data) ? data : data.users || [];
      setUsers(userList);
    } catch (e) {
      console.error("Failed to load staff users:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSetViewMode = (mode: "grid" | "table") => {
    setViewMode(mode);
    localStorage.setItem("staff_view_mode", mode);
  };

  const handleOpenForm = (user?: StaffUser) => {
    setEditingUser(user || null);
    setIsFormModalOpen(true);
    playSound("click");
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;
    try {
      await deleteStaffUser(userToDelete.id);
      playSound("success");
      loadUsers();
    } catch (e) {
      console.error(e);
      playSound("error");
    } finally {
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
    }
  };

  const handleDeleteClick = (user: StaffUser) => {
    setUserToDelete(user);
    setIsDeleteModalOpen(true);
    playSound("click");
  };

  const filteredUsers = users.filter((u) => {
    const nameMatch =
      u.user_metadata?.name?.toLowerCase().includes(searchTerm) || false;
    const emailMatch = u.email?.toLowerCase().includes(searchTerm) || false;
    return nameMatch || emailMatch;
  });

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: { staggerChildren: 0.06 },
        },
      }}
      className="max-w-6xl mx-auto h-full flex flex-col"
    >
      <motion.div
        variants={fadeVariants}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            {t("staff.title") || "Staff Members"}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {t("staff.manage_staff") ||
              "Manage application staff users for Supabase."}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => handleOpenForm()}
            variant="primary"
            className="px-4 py-2 text-sm flex items-center gap-2"
          >
            <IconPlus size={16} strokeWidth={2} />
            {t("staff.add_staff") || "Add Staff"}
          </Button>
        </div>
      </motion.div>

      <motion.div
        variants={fadeVariants}
        className="mb-6 flex flex-col md:flex-row gap-4 justify-between items-end md:items-center"
      >
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <IconSearch className="h-4 w-4 text-text-muted" strokeWidth={2} />
          </div>
          <Input
            type="text"
            className="input-liquid pl-10 w-full"
            placeholder={
              t("staff.search_placeholder") ||
              "Search staff by name or email..."
            }
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-glass-border overflow-hidden bg-glass-white">
            <button
              onClick={() => handleSetViewMode("grid")}
              title="Grid View"
              className={`p-2.5 transition-colors ${
                viewMode === "grid"
                  ? "bg-accent-blue text-white"
                  : "text-text-secondary hover:bg-glass-white-hover"
              }`}
            >
              <IconLayoutGrid size={18} strokeWidth={2} />
            </button>
            <button
              onClick={() => handleSetViewMode("table")}
              title="Table View"
              className={`p-2.5 transition-colors ${
                viewMode === "table"
                  ? "bg-accent-blue text-white"
                  : "text-text-secondary hover:bg-glass-white-hover"
              }`}
            >
              <IconTable size={18} strokeWidth={2} />
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={fadeVariants}
        className="flex-1 min-h-0 flex flex-col"
      >
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="w-8 h-8 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-20 bg-glass-white rounded-xl border border-glass-border">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-glass-white-hover flex items-center justify-center text-text-muted">
                <IconUsers size={32} strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-medium text-text-primary">
                {t("staff.no_staff") || "No staff found"}
              </h3>
            </div>
          ) : (
            <div className="relative pb-6">
              <AnimatePresence mode="wait" initial={false}>
                {viewMode === "grid" ? (
                  <motion.div
                    key="grid"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4"
                  >
                    <AnimatePresence mode="popLayout">
                      {filteredUsers.map((user) => (
                        <motion.div
                          key={user.id}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="glass-panel p-5 group hover:border-accent-blue/30 transition-all duration-300 hover:shadow-lg hover:shadow-accent-blue/5 relative overflow-hidden"
                        >
                          <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-start gap-3.5">
                                <div className="w-12 h-12 rounded-xl bg-linear-to-br from-glass-white to-glass-white-hover border border-glass-border flex items-center justify-center text-text-primary font-bold text-lg shadow-sm">
                                  {(
                                    user.user_metadata?.name ||
                                    user.email ||
                                    "?"
                                  )
                                    .charAt(0)
                                    .toUpperCase()}
                                </div>
                                <div className="max-w-[140px]">
                                  <h3 className="font-semibold text-text-primary text-lg leading-tight truncate">
                                    {user.user_metadata?.name ||
                                      t("staff.unnamed") ||
                                      "Unnamed Staff"}
                                  </h3>
                                  <p className="text-xs text-text-muted truncate mt-0.5">
                                    {user.email}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenForm(user);
                                  }}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-accent-blue hover:bg-glass-white transition-colors"
                                >
                                  <IconEdit size={16} strokeWidth={2} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteClick(user);
                                  }}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-system-error hover:bg-glass-white transition-colors"
                                >
                                  <IconTrash size={16} strokeWidth={2} />
                                </button>
                              </div>
                            </div>
                            {user.user_metadata?.role && (
                              <div className="mt-4 pt-4 border-t border-glass-border-light text-sm">
                                <div className="flex flex-col gap-1 text-text-secondary">
                                  <span className="font-medium">
                                    {t("staff.role") || "Role"}:{" "}
                                    {t(
                                      `staff.roles.${user.user_metadata.role.toLowerCase()}`,
                                    ) || user.user_metadata.role}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                ) : (
                  <motion.div
                    key="table"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="glass-panel overflow-hidden"
                  >
                    <div className="overflow-x-auto min-h-[400px]">
                      <table className="w-full text-sm text-left relative">
                        <thead className="text-xs text-text-secondary uppercase bg-glass-white-hover border-b border-glass-border sticky top-0 z-10 h-10">
                          <tr>
                            <th className="px-5 py-3 font-semibold rounded-tl-xl w-[250px]">
                              {t("staff.name_email") || "Name & Email"}
                            </th>
                            <th className="px-5 py-3 font-semibold w-[200px]">
                              {t("staff.role") || "Role"}
                            </th>
                            <th className="px-5 py-3 font-semibold w-[200px]">
                              {t("staff.created_at") || "Created At"}
                            </th>
                            <th className="px-5 py-3 font-semibold text-right rounded-tr-xl w-[120px]">
                              {t("staff.actions") || "Actions"}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <AnimatePresence mode="popLayout">
                            {filteredUsers.map((user) => (
                              <motion.tr
                                key={user.id}
                                layout
                                initial={{
                                  opacity: 0,
                                  backgroundColor:
                                    "rgba(var(--glass-white-rgb), 0)",
                                }}
                                animate={{
                                  opacity: 1,
                                  backgroundColor:
                                    "rgba(var(--glass-white-rgb), 0)",
                                }}
                                exit={{
                                  opacity: 0,
                                  backgroundColor:
                                    "rgba(var(--glass-white-hover-rgb), 1)",
                                }}
                                className="border-b border-glass-border-light hover:bg-glass-white-hover transition-colors group"
                              >
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-glass-white border border-glass-border flex items-center justify-center text-text-secondary font-medium shrink-0">
                                      {(
                                        user.user_metadata?.name ||
                                        user.email ||
                                        "?"
                                      )
                                        .charAt(0)
                                        .toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-medium text-text-primary group-hover:text-accent-blue transition-colors truncate">
                                        {user.user_metadata?.name ||
                                          t("staff.unnamed") ||
                                          "Unnamed Staff"}
                                      </p>
                                      <p className="text-xs text-text-muted truncate">
                                        {user.email}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-4 text-text-secondary truncate">
                                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-accent-blue/10 text-accent-blue">
                                    {user.user_metadata?.role
                                      ? t(
                                          `staff.roles.${user.user_metadata.role.toLowerCase()}`,
                                        ) || user.user_metadata.role
                                      : t("nav.staff") || "Staff"}
                                  </span>
                                </td>
                                <td className="px-5 py-4 text-text-secondary">
                                  {new Date(
                                    user.created_at,
                                  ).toLocaleDateString()}
                                </td>
                                <td className="px-5 py-4 text-right">
                                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenForm(user);
                                      }}
                                      className="p-1.5 text-text-muted hover:text-accent-blue hover:bg-glass-white rounded transition-colors"
                                      title="Edit"
                                    >
                                      <IconEdit size={16} strokeWidth={2} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteClick(user);
                                      }}
                                      className="p-1.5 text-text-muted hover:text-system-error hover:bg-system-error/10 rounded transition-colors"
                                      title="Delete"
                                    >
                                      <IconTrash size={16} strokeWidth={2} />
                                    </button>
                                  </div>
                                </td>
                              </motion.tr>
                            ))}
                          </AnimatePresence>
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>

      {/* Modals */}
      <StaffFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSaved={loadUsers}
        editingUser={editingUser}
      />

      <StaffDeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        userName={
          userToDelete?.user_metadata?.name || userToDelete?.email || ""
        }
      />
    </motion.div>
  );
}
