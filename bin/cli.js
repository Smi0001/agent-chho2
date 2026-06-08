#!/usr/bin/env node
// Thin launcher for the published package: runs the compiled entrypoint.
// For local development without a build step, use `npm run dev` (tsx src/index.ts).
import { main } from "../dist/index.js";

main(process.argv.slice(2)).catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
