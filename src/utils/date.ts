/**
 * Formats a date string or Date object to DD-MM-YYYY format.
 * @param date The date to format (string or Date object).
 * @returns The formatted date string in DD-MM-YYYY format, or "-" if invalid/null.
 */
export const formatDate = (date: string | Date | undefined | null): string => {
  if (!date) return "-";

  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  return `${day}-${month}-${year}`;
};

/**
 * Parses a date string in YYYY-MM-DD format (typical HTML input value)
 * and returns it in DD-MM-YYYY format for display.
 */
export const formatInputDate = (dateString: string): string => {
  if (!dateString) return "-";

  // Check if already in DD-MM-YYYY format
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateString)) return dateString;

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "-";

  return formatDate(date);
};
