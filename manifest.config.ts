import { defineManifest } from "@crxjs/vite-plugin";

const isDev = process.env.NODE_ENV === "development";

const cspPolicy = isDev
    ? "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' http://localhost:5173 ws://localhost:5173;"
    : "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self';";

export default defineManifest({
    manifest_version: 3,
    name: "Cookie Collector (Vite Template)",
    version: "1.0.0",
    description:
        "Collect cookies from user-authorized domains and POST as JSON (demo template).",
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
        default_title: "Cookie Collector",
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
