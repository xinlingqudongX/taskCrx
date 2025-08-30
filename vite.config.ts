import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
// import manifest from "./public/manifest.json";
import manifest from "./manifest.config";
import zip from "vite-plugin-zip-pack";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig({
    root: "src/",
    plugins: [
        vue(),
        crx({ manifest }),
        zip({
            inDir: "src/dist",
            outDir: "release",
            outFileName: "release.zip",
        }),
    ],
    server: {
        host: "localhost",
        port: 5173,
        // cors: {
        //     origin: [/chrome-extension:\/\//],
        // },
        cors: true,
        allowedHosts: ["localhost"],
        hmr: {
            host: "localhost",
            port: 5173,
            protocol: "ws",
        },
    },
    build: {
        target: "chrome107",
        outDir: "dist",
        assetsDir: "assets",
        // ensure assets are emitted for extension packaging
        rollupOptions: {
            input: {
                options: path.resolve(__dirname, "src/options/index.html"),
                // background: "src/background.ts",
            },
        },
        sourcemap: true,
        copyPublicDir: true,
    },
    legacy: {
        skipWebSocketTokenCheck: true,
    },
});
