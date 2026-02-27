import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  IconCircleCheck,
  IconDatabase,
  IconCloudUpload,
  IconShield,
  IconRefreshCcw,
  IconSettings,
  IconTriangleAlert,
  IconArrowLeft,
} from "../components/icons";
import { useNavigate } from "react-router-dom";

const fadeVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

function HelpSection({
  icon,
  iconColor,
  title,
  children,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={fadeVariants}
      className="p-5 rounded-xl border border-glass-border bg-glass-white"
    >
      <div className="flex items-start gap-4">
        <div className={`p-2 rounded-lg ${iconColor} shrink-0`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary mb-3">
            {title}
          </h3>
          <div className="text-xs text-text-secondary leading-relaxed space-y-2">
            {children}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="list-none space-y-2 mt-1">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="shrink-0 w-5 h-5 rounded-full bg-accent-blue/10 text-accent-blue text-[10px] font-bold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Help() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const supabaseSetupSteps = t("help.sync.supabase_setup_steps", {
    returnObjects: true,
  }) as string[];

  const configSteps = t("help.sync.config_steps", {
    returnObjects: true,
  }) as string[];

  const syncUsageSteps = t("help.sync.usage_steps", {
    returnObjects: true,
  }) as string[];

  const securitySteps = t("help.sync.security_steps", {
    returnObjects: true,
  }) as string[];

  const migrationSteps = t("help.sync.migration_steps", {
    returnObjects: true,
  }) as string[];

  const troubleshootingItems = t("help.sync.troubleshooting_items", {
    returnObjects: true,
  }) as string[];

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
      className="max-w-3xl mx-auto"
    >
      {/* Header */}
      <motion.div variants={fadeVariants} className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mb-3"
        >
          <IconArrowLeft size={14} />
          {t("help.back")}
        </button>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          {t("help.title")}
        </h1>
        <p className="text-sm text-text-muted mt-1">{t("help.subtitle")}</p>
      </motion.div>

      <div className="space-y-4">
        {/* Overview */}
        <HelpSection
          icon={<IconCloudUpload size={20} strokeWidth={2} />}
          iconColor="bg-blue-500/10 text-blue-500"
          title={t("help.sync.overview_title")}
        >
          <p>{t("help.sync.overview_desc")}</p>
          <div className="mt-3 p-3 rounded-lg bg-glass-white-hover border border-glass-border">
            <p className="font-medium text-text-primary mb-1.5">
              {t("help.sync.synced_tables_title")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                "customers",
                "orders",
                "order_items",
                "expenses",
                "shop_settings",
              ].map((table) => (
                <span
                  key={table}
                  className="px-2 py-0.5 rounded-md bg-accent-blue/10 text-accent-blue font-mono text-[10px]"
                >
                  {table}
                </span>
              ))}
            </div>
          </div>
        </HelpSection>

        {/* Step 1: Supabase Project Setup */}
        <HelpSection
          icon={<IconDatabase size={20} strokeWidth={2} />}
          iconColor="bg-indigo-500/10 text-indigo-500"
          title={t("help.sync.supabase_setup_title")}
        >
          <p>{t("help.sync.supabase_setup_desc")}</p>
          <StepList steps={supabaseSetupSteps} />
          <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <div className="flex items-start gap-2">
              <IconTriangleAlert
                size={14}
                className="text-amber-500 shrink-0 mt-0.5"
              />
              <p className="text-amber-600 dark:text-amber-400">
                {t("help.sync.supabase_setup_warning")}
              </p>
            </div>
          </div>
        </HelpSection>

        {/* Step 2: Configure in App */}
        <HelpSection
          icon={<IconSettings size={20} strokeWidth={2} />}
          iconColor="bg-green-500/10 text-green-500"
          title={t("help.sync.config_title")}
        >
          <p>{t("help.sync.config_desc")}</p>
          <StepList steps={configSteps} />
        </HelpSection>

        {/* Step 3: Using Sync */}
        <HelpSection
          icon={<IconRefreshCcw size={20} strokeWidth={2} />}
          iconColor="bg-cyan-500/10 text-cyan-500"
          title={t("help.sync.usage_title")}
        >
          <p>{t("help.sync.usage_desc")}</p>
          <StepList steps={syncUsageSteps} />
          <div className="mt-3 p-3 rounded-lg bg-glass-white-hover border border-glass-border">
            <p className="font-medium text-text-primary mb-1">
              {t("help.sync.queue_status_title")}
            </p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                <span>
                  <strong>{t("help.sync.status_pending")}</strong> —{" "}
                  {t("help.sync.status_pending_desc")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span>
                  <strong>{t("help.sync.status_syncing")}</strong> —{" "}
                  {t("help.sync.status_syncing_desc")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span>
                  <strong>{t("help.sync.status_synced")}</strong> —{" "}
                  {t("help.sync.status_synced_desc")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span>
                  <strong>{t("help.sync.status_failed")}</strong> —{" "}
                  {t("help.sync.status_failed_desc")}
                </span>
              </div>
            </div>
          </div>
        </HelpSection>

        {/* Step 4: Security */}
        <HelpSection
          icon={<IconShield size={20} strokeWidth={2} />}
          iconColor="bg-purple-500/10 text-purple-500"
          title={t("help.sync.security_title")}
        >
          <p>{t("help.sync.security_desc")}</p>
          <StepList steps={securitySteps} />
        </HelpSection>

        {/* Step 5: Migration */}
        <HelpSection
          icon={<IconDatabase size={20} strokeWidth={2} />}
          iconColor="bg-amber-500/10 text-amber-500"
          title={t("help.sync.migration_title")}
        >
          <p>{t("help.sync.migration_desc")}</p>
          <StepList steps={migrationSteps} />
        </HelpSection>

        {/* Troubleshooting */}
        <HelpSection
          icon={<IconTriangleAlert size={20} strokeWidth={2} />}
          iconColor="bg-red-500/10 text-red-500"
          title={t("help.sync.troubleshooting_title")}
        >
          <ul className="space-y-1.5 list-none">
            {troubleshootingItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <IconCircleCheck
                  size={13}
                  className="text-green-500 shrink-0 mt-0.5"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </HelpSection>
      </div>
    </motion.div>
  );
}
