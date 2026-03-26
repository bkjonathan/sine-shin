export const DEFAULT_TAB_PATH = "/dashboard";

const STATIC_TAB_PATHS = new Set([
  "/dashboard",
  "/orders",
  "/label-print",
  "/expenses",
  "/account-book",
  "/staff",
  "/reports",
  "/customers",
  "/settings",
  "/help",
]);

export const getPathnameFromTabPath = (path: string): string => {
  const normalizedPath = path.trim() || DEFAULT_TAB_PATH;

  try {
    return new URL(normalizedPath, "https://local.tab").pathname;
  } catch {
    const [withoutHash] = normalizedPath.split("#");
    const [pathname] = withoutHash.split("?");
    return pathname || DEFAULT_TAB_PATH;
  }
};

export const normalizeTabPath = (path: string): string => {
  const normalizedPath = path.trim();

  if (!normalizedPath) {
    return DEFAULT_TAB_PATH;
  }

  return normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
};

export const isSupportedTabPath = (pathname: string): boolean => {
  if (STATIC_TAB_PATHS.has(pathname)) {
    return true;
  }

  if (/^\/orders\/[^/]+$/.test(pathname)) {
    return true;
  }

  return /^\/customers\/[^/]+$/.test(pathname);
};

export const getRouteLabel = (
  tabPath: string,
  t: (key: string) => string,
): string => {
  const pathname = getPathnameFromTabPath(tabPath);

  if (/^\/orders\/[^/]+$/.test(pathname)) {
    const id = pathname.split("/").pop();
    return `${t("orders.detail.title")} #${id}`;
  }

  if (/^\/customers\/[^/]+$/.test(pathname)) {
    const id = pathname.split("/").pop();
    return `${t("customers.detail.title")} #${id}`;
  }

  switch (pathname) {
    case "/dashboard":
      return t("nav.dashboard");
    case "/orders":
      return t("nav.orders");
    case "/label-print":
      return t("nav.label_print");
    case "/expenses":
      return t("nav.expenses");
    case "/account-book":
      return t("nav.account_book");
    case "/staff":
      return t("nav.staff");
    case "/reports":
      return t("nav.reports");
    case "/customers":
      return t("nav.customers");
    case "/settings":
      return t("nav.settings");
    case "/help":
      return t("nav.help");
    default:
      return pathname;
  }
};

export const isNavigationItemActive = (
  navPath: string,
  tabPath: string,
): boolean => {
  const pathname = getPathnameFromTabPath(tabPath);

  if (navPath === "/orders") {
    return pathname === "/orders" || /^\/orders\/[^/]+$/.test(pathname);
  }

  if (navPath === "/customers") {
    return pathname === "/customers" || /^\/customers\/[^/]+$/.test(pathname);
  }

  return pathname === navPath;
};
