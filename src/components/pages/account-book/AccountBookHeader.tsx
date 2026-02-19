import { useTranslation } from "react-i18next";
import { Input } from "../../ui";
import { IconSearch } from "../../icons";

interface AccountBookHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export default function AccountBookHeader({
  search,
  onSearchChange,
}: AccountBookHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          {t("account_book.title")}
        </h1>
        <p className="text-sm text-text-muted mt-1">{t("account_book.subtitle")}</p>
      </div>
      <div className="relative w-full md:w-72">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <IconSearch className="h-4 w-4 text-text-muted" strokeWidth={2} />
        </div>
        <Input
          type="text"
          className="input-liquid pl-10 w-full"
          placeholder={t("account_book.search_placeholder")}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
    </div>
  );
}
