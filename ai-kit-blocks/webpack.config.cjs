const defaultConfig = require("@wordpress/scripts/config/webpack.config");
const webpack = require("webpack");
const path = require("path");

console.log("PREMIUM BUILD:", process.env.WPSUITE_PREMIUM === "true");

module.exports = function (env = {}) {
  const config = {
    ...defaultConfig,
    entry: {
      index: [
        path.resolve(process.cwd(), "src", "index.tsx"),
        path.resolve(process.cwd(), "src/ai-feature", "index.tsx"),
        path.resolve(process.cwd(), "src/ai-feature", "view.tsx"),
        path.resolve(process.cwd(), "src/doc-search", "index.tsx"),
        path.resolve(process.cwd(), "src/doc-search", "view.tsx"),
      ],
    },
    externals: {
      ...defaultConfig.externals,
      "@mantine/core": "WpSuiteMantine",
      "crypto": "WpSuiteCrypto",
      "jose": "WpSuiteJose",
    },
    optimization: {
      ...defaultConfig.optimization,
      splitChunks: {
        name: (module, chunks, cacheGroupKey) => {
          const allChunksNames = chunks.map((chunk) => chunk.name).join('-');
          return allChunksNames;
        },
      },
    },
    plugins: [
      ...defaultConfig.plugins.filter(
        (plugin) => plugin.constructor.name !== "RtlCssPlugin"
      ),
      new webpack.EnvironmentPlugin({
        WPSUITE_PREMIUM: false,
      }),
    ],
  };

  return config;
};
