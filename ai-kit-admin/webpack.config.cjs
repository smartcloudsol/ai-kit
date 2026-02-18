const defaultConfig = require("@wordpress/scripts/config/webpack.config");
const webpack = require("webpack");
const path = require("path");

console.log("PREMIUM BUILD:", process.env.WPSUITE_PREMIUM === "true");

module.exports = function () {
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
    plugins: [
      ...defaultConfig.plugins.filter(
        (plugin) => plugin.constructor.name !== "RtlCssPlugin"
      ),
      new webpack.EnvironmentPlugin({
        WPSUITE_PREMIUM: false,
      }),
    ],
    output: {
      ...defaultConfig.output,
      assetModuleFilename: "images/[name].[contenthash:8][ext][query]",
    }
  };

  return config;
};
