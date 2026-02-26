/**
 * Myanmar fonts bundled as base64 data URLs at build time via Vite `?inline`.
 * Importing this module adds the font data to the JS bundle so no runtime
 * fetch is needed — critical for the Tauri webview environment.
 */

// @ts-ignore — Vite resolves ?inline to a base64 data URL string at build time
import myanmarFontDataUrl from "./NotoSansMyanmar-myanmar.woff2?inline";
// @ts-ignore
import latinExtFontDataUrl from "./NotoSansMyanmar-latin-ext.woff2?inline";
// @ts-ignore
import latinFontDataUrl from "./NotoSansMyanmar-latin.woff2?inline";

/** @font-face CSS block with Myanmar font embedded as base64 data URLs.
 *  Safe to pass directly as `fontEmbedCSS` in html-to-image's `toPng`. */
export const MYANMAR_FONT_EMBED_CSS = [
  `@font-face{font-family:'Noto Sans Myanmar';font-style:normal;font-weight:400 700;font-display:swap;src:url('${myanmarFontDataUrl}') format('woff2');unicode-range:U+1000-109F,U+200C-200D,U+25CC,U+A92E,U+A9E0-A9FE,U+AA60-AA7F,U+116D0-116E3;}`,
  `@font-face{font-family:'Noto Sans Myanmar';font-style:normal;font-weight:400 700;font-display:swap;src:url('${latinExtFontDataUrl}') format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;}`,
  `@font-face{font-family:'Noto Sans Myanmar';font-style:normal;font-weight:400 700;font-display:swap;src:url('${latinFontDataUrl}') format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}`,
].join("\n");
