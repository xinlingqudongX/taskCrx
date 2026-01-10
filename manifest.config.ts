import { defineManifest } from "@crxjs/vite-plugin";
import packageJson from "./package.json";

const isDev = process.env.NODE_ENV === "development";

const cspPolicy = isDev
    ? "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' http://localhost:5173 ws://localhost:5173;"
    : "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self';";

export default defineManifest({
    manifest_version: 3,
    name: "Team Session Share",
    short_name: "Team Session Share",
    version: packageJson.version,
    description: packageJson.description,
    permissions: [
        "cookies",
        "storage",
        "alarms",
        "notifications",
        "scripting",
        "activeTab",
        "tabs",
        "clipboardRead",
        "clipboardWrite",
    ],
    optional_permissions: [],
    host_permissions: [
        "<all_urls>",
        "*://*/*",
        "http://*/*",
        "https://*/*",
        "https://*/",
        "http://*/",
        "https://appstoreconnect.apple.com/*",
    ],
    background: {
        service_worker: "background.ts",
        type: "module",
    },
    options_ui: {
        page: "options/index.html",
        open_in_tab: true,
    },
    action: {
        default_title: "Team Session Share",
    },
    icons: {
        "48": "icons/icon48.png",
        "128": "icons/icon128.png",
    },
    web_accessible_resources: [
        {
            matches: ["<all_urls>"],
            resources: ["**/*", "*"],
        },
    ],
    // content_security_policy: {
    //     extension_pages: cspPolicy,
    // },
    // 添加Chrome同步支持
    storage: {
        managed_schema: "schema.json",
    },
});
