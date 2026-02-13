export const parseCSV = (csvText: string): Record<string, string>[] => {
  // Remove BOM if present
  const cleanText = csvText.replace(/^\uFEFF/, "");
  const lines = cleanText.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  const headers = lines[0].split(","); // Simple split for headers, assuming no commas in headers
  const result: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const obj: Record<string, string> = {};
    const currentLine = lines[i];

    // Improved CSV parsing logic to handle quoted fields containing commas
    const values: string[] = [];
    let currentVal = "";
    let inQuotes = false;

    for (let j = 0; j < currentLine.length; j++) {
      const char = currentLine[j];

      if (char === '"') {
        if (inQuotes && currentLine[j + 1] === '"') {
          // Escaped quote
          currentVal += '"';
          j++;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        // End of field
        values.push(currentVal);
        currentVal = "";
      } else {
        currentVal += char;
      }
    }
    values.push(currentVal); // Push the last value

    // Map values to headers
    headers.forEach((header, index) => {
      // Normalize header key (trim quotes if present)
      const cleanHeader = header.replace(/^"|"$/g, "").trim();
      // Only include value if it exists
      if (index < values.length) {
        obj[cleanHeader] = values[index].trim();
      }
    });

    if (Object.keys(obj).length > 0) {
      result.push(obj);
    }
  }

  return result;
};
