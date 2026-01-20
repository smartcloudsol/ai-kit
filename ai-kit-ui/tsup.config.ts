import { defineConfig } from "tsup";

export default defineConfig({
  // Copy non-hashed global CSS so consumers can import it (like Mantine styles)
  onSuccess: "node -e \"const fs=require('fs'); const path=require('path'); fs.mkdirSync('dist',{recursive:true}); fs.copyFileSync(path.join('src','styles','ai-kit-ui.css'), path.join('dist','ai-kit-ui.css'));\"",

  entry: ["src/index.tsx"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  external: [
    "react",
    "react-dom",
    /^aws-amplify(\/.*)?$/,
    /^@mantine\/.*?$/,
    "jquery",
    "@wordpress/data",
  ],
});
