/// <reference types="vite/client" />

interface Window {
  __TAURI_INTERNALS__?: unknown;
  webkitAudioContext?: typeof AudioContext;
}
