const parseCSVRows = (csvText: string): string[][] => {
  const cleanText = csvText.replace(/^\uFEFF/, "");
  const rows: string[][] = [];

  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];

    if (char === '"') {
      if (inQuotes && cleanText[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && cleanText[i + 1] === "\n") {
        i++;
      }
      currentRow.push(currentField);
      currentField = "";
      rows.push(currentRow);
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  currentRow.push(currentField);
  rows.push(currentRow);

  return rows;
};

export const parseCSV = (csvText: string): Record<string, string>[] => {
  const rows = parseCSVRows(csvText).filter((row) =>
    row.some((value) => value.trim() !== ""),
  );
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => header.replace(/^"|"$/g, "").trim());
  if (headers.length === 0 || headers.every((header) => !header)) {
    return [];
  }

  return rows
    .slice(1)
    .map((values) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (!header) {
          return;
        }
        record[header] = (values[index] ?? "").trim();
      });
      return record;
    })
    .filter((record) =>
      Object.values(record).some((value) => value.trim().length > 0),
    );
};

export const escapeCSVField = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n") ||
    stringValue.includes("\r")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

export const createCSVContent = (
  headers: string[],
  rows: Array<Array<unknown>>,
): string => {
  const csvRows = rows.map((row) => row.map(escapeCSVField).join(","));
  return [headers.map(escapeCSVField).join(","), ...csvRows].join("\n");
};
