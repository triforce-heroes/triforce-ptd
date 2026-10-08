import { defineConfig } from "vitest/config";

const config = defineConfig({ test: { fsModuleCache: true } });

export default config;
