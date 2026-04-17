const defaultConfig = require("@wordpress/scripts/config/webpack.config");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const MonacoWebpackPlugin = require("monaco-editor-webpack-plugin");
const webpack = require("webpack");
const path = require("path");

console.log("PREMIUM BUILD:", process.env.WPSUITE_PREMIUM === "true");

function getStyleChunkName(chunks, cacheGroupKey) {
  const namedChunk = chunks.find(
    (chunk) => typeof chunk?.name === "string" && chunk.name.length > 0,
  );

  if (namedChunk?.name) {
    return `${path.dirname(namedChunk.name)}/${cacheGroupKey}-${path.basename(
      namedChunk.name,
    )}`;
  }

  const fallbackChunk = chunks[0];
  const suffix =
    fallbackChunk && fallbackChunk.id !== null && fallbackChunk.id !== undefined
      ? String(fallbackChunk.id)
      : "async";

  return `${cacheGroupKey}-${suffix}`;
}

module.exports = function () {
  const miniCssExtractPlugin = defaultConfig.plugins.find(
    (plugin) => plugin.constructor.name === "MiniCssExtractPlugin",
  );

  const config = {
    ...defaultConfig,
    entry: {
      index: [
        path.resolve(process.cwd(), "src", "index.tsx"),
      ],
      components: [
        path.resolve(process.cwd(), "src", "components", "index.tsx"),
      ],
      media: [
        path.resolve(process.cwd(), "src", "components", "MediaLibrary.tsx"),
      ],
      sidebar: [
        path.resolve(process.cwd(), "src", "components", "AiKitSidebar.tsx"),
      ],
      "langutils": [
        path.resolve(process.cwd(), "src", "components", "LanguageUtils.tsx"),
      ],
      "imgextra": [
        path.resolve(process.cwd(), "src", "components", "ImageExtra.tsx"),
      ],
    },
    externals: {
      ...defaultConfig.externals,
      "@aws-amplify/ui": "WpSuiteAmplify",
      "@aws-amplify/ui-react": "WpSuiteAmplify",
      "@aws-amplify/ui-react-core": "WpSuiteAmplify",
      "@mantine/core": "WpSuiteMantine",
      "@mantine/form": "WpSuiteMantine",
      "@mantine/hooks": "WpSuiteMantine",
      "@mantine/modals": "WpSuiteMantine",
      "@mantine/notifications": "WpSuiteMantine",
      "country-data-list": "WpSuiteAmplify",
      "crypto": "WpSuiteCrypto",
      "jose": "WpSuiteJose",
    },
    resolve: {
      ...defaultConfig.resolve,
      alias: {
        ...(defaultConfig.resolve?.alias ?? {}),
        "@monaco-editor/loader": path.resolve(
          process.cwd(),
          "src",
          "components",
          "monacoLoaderShim.ts",
        ),
      },
    },
    plugins: [
      ...defaultConfig.plugins.filter(
        (plugin) =>
          plugin.constructor.name !== "RtlCssPlugin" &&
          plugin.constructor.name !== "MiniCssExtractPlugin",
      ),
      ...(miniCssExtractPlugin
        ? [
          new MiniCssExtractPlugin({
            ...miniCssExtractPlugin.options,
            ignoreOrder: true,
          }),
        ]
        : []),
      new MonacoWebpackPlugin({
        languages: ["json"],
        features: [],
        filename: "workers/[name].worker.[contenthash:8].js",
      }),
      new webpack.EnvironmentPlugin({
        WPSUITE_PREMIUM: false,
      }),
    ],
    output: {
      ...defaultConfig.output,
      assetModuleFilename: "images/[name].[contenthash:8][ext][query]",
      chunkFilename: "chunks/[name].[contenthash:8].js",
    },
    optimization: {
      ...defaultConfig.optimization,
      splitChunks: {
        ...defaultConfig.optimization?.splitChunks,
        cacheGroups: {
          ...defaultConfig.optimization?.splitChunks?.cacheGroups,
          style: {
            ...defaultConfig.optimization?.splitChunks?.cacheGroups?.style,
            name: (_, chunks, cacheGroupKey) =>
              getStyleChunkName(chunks, cacheGroupKey),
          },
          monacoEditor: {
            name: "monaco-editor",
            test: /[\\/]node_modules[\\/](monaco-editor|@monaco-editor)[\\/]/,
            chunks: "all",
            priority: 40,
            enforce: true,
            reuseExistingChunk: true,
          },
        },
      },
    },
  };

  return config;
};
