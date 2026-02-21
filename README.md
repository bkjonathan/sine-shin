# Sine Shin - Tauri + React Application

This is a Tauri + React + TypeScript application built with Vite.

## Prerequisites Checklist

Before you begin, ensure you have the following installed on your machine depending on your operating system:

### General Requirements (Both macOS and Windows)

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Rust](https://www.rust-lang.org/tools/install) (This will also install `cargo`)

### macOS Setup

To build a Tauri app on macOS, you need the Xcode Command Line Tools.

- Run the following command in your terminal:

  ```sh
  xcode-select --install
  ```

### Windows Setup

To build a Tauri app on Windows, you need the Microsoft Visual Studio C++ Build Tools and WebView2.

1. Download [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/). During installation, select the **"Desktop development with C++"** workload.
2. _(Usually pre-installed on Windows 11)_ Download and install [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) if you are on an older Windows version.

---

## Getting Started

1. Navigate to the root directory of the project:

   ```sh
   cd sine-shin
   ```

2. Install the necessary dependencies:

   ```sh
   npm install
   ```

## How to Run Development Server

To run the application in development mode (with hot-reloading for both the React frontend and Rust backend):

```sh
npm run tauri dev
```

## How to Build the App

To build the application for production. The resulting executable (e.g., `.app` for macOS, `.exe` for Windows) will be generated based on the operating system you are building on.

```sh
npm run tauri build
```

The built installation files and binaries can usually be found under:

- `src-tauri/target/release/bundle/`

---

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
