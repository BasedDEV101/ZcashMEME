import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // The protocol's own modules. The site derives addresses and builds the
      // burn with the same code the verifier was written against.
      "@protocol": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
});
