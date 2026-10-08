import baseConfig from "@rheactor/rheactor-oxc-config/oxfmt";

const config = {
  ...baseConfig,
  ignorePatterns: [...(baseConfig.ignorePatterns ?? []), "tools/resources/**"],
};

export default config;
