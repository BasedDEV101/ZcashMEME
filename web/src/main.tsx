// @solana/spl-token builds instruction data with Node's Buffer, which does
// not exist in a browser. Without this every burn fails with
// "Buffer is not defined" at the moment the user clicks Destroy.
import { Buffer } from "buffer";
globalThis.Buffer ??= Buffer;

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
