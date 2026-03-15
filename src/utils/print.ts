import { toPng } from "html-to-image";

import { printInvoiceDirect } from "../api/printApi";
import { MYANMAR_FONT_EMBED_CSS } from "../assets/fonts/myanmar-fonts";

const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
};

export const printElementAsImage = async (
  element: HTMLElement,
  printerName?: string | null,
): Promise<void> => {
  await document.fonts.ready;
  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 150);
    });
  });

  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    skipFonts: true,
    fontEmbedCSS: MYANMAR_FONT_EMBED_CSS,
  });

  if (window.__TAURI_INTERNALS__) {
    await printInvoiceDirect(
      Array.from(dataUrlToBytes(dataUrl)),
      printerName?.trim() ? printerName.trim() : null,
    );
    return;
  }

  const win = window.open("");
  if (!win) {
    throw new Error("Unable to open print window");
  }

  win.document.write(
    `<img src="${dataUrl}" onload="window.print();window.close()" />`,
  );
};
