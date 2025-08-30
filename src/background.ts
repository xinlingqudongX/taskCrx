// src/background.ts
import {
    collectAllAppData,
    getJiguangTokenFromCookie,
} from "./utils/app-collector";
import type { CollectedAppData, Task, TaskExecutionData } from "./types/index";

const USE_SYNC_STORAGE = true;

// 修改存储相关函数以支持同步
async function getTasks(): Promise<Task[]> {
    return new Promise((res) => {
        const storage = USE_SYNC_STORAGE
            ? chrome.storage.sync
            : chrome.storage.local;
        storage.get([TASKS_KEY], (r) => res(r[TASKS_KEY] || []));
    });
}

async function setTasks(tasks: Task[]): Promise<void> {
    return new Promise((res) => {
        const storage = USE_SYNC_STORAGE
            ? chrome.storage.sync
            : chrome.storage.local;
        storage.set({ [TASKS_KEY]: tasks }, () => res());
    });
}

async function getDomains(): Promise<string[]> {
    return new Promise((res) => {
        const storage = USE_SYNC_STORAGE
            ? chrome.storage.sync
            : chrome.storage.local;
        storage.get([DOMAINS_KEY], (r) => res(r[DOMAINS_KEY] || []));
    });
}

async function setDomains(domains: string[]): Promise<void> {
    return new Promise((res) => {
        const storage = USE_SYNC_STORAGE
            ? chrome.storage.sync
            : chrome.storage.local;
        storage.set({ [DOMAINS_KEY]: domains }, () => res());
    });
}

/**
 * 获取指定域名的localStorage数据
 * @param {string} domain - 域名
 * @param {string[]} keys - 需要获取的键名列表，为空则获取所有
 * @returns {Promise<{success: boolean, data?: Record<string, any>, error?: string}>} 返回结果
 */
async function getWebPageLocalStorage(
    domain: string,
    keys?: string[]
): Promise<{
    success: boolean;
    data?: Record<string, any>;
    error?: string;
}> {
    try {
        // 获取该域名下的所有标签页
        const tabs = await chrome.tabs.query({ url: `*://*.${domain}/*` });

        if (tabs.length === 0) {
            return {
                success: false,
                error: `未找到域名 ${domain} 的打开标签页`,
            };
        }

        // 使用第一个匹配的标签页
        const tab = tabs[0];

        if (!tab.id) {
            return {
                success: false,
                error: "无效的标签页ID",
            };
        }

        // 发送消息到content script
        const messageType =
            keys && keys.length > 0
                ? "GET_LOCALSTORAGE_ITEMS"
                : "GET_LOCALSTORAGE_ALL";

        const message =
            keys && keys.length > 0
                ? { type: messageType, keys }
                : { type: messageType };

        const response = await chrome.tabs.sendMessage(tab.id, message);

        if (response && response.success) {
            return {
                success: true,
                data: response.data,
            };
        } else {
            return {
                success: false,
                error: "Content script未响应或返回错误",
            };
        }
    } catch (error) {
        console.error("获取localStorage失败:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
        };
    }
}

/**
 * 搜索指定域名的localStorage中包含关键词的数据
 * @param {string} domain - 域名
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<{success: boolean, data?: Record<string, any>, error?: string}>} 返回结果
 */
async function searchWebPageLocalStorage(
    domain: string,
    keyword: string
): Promise<{
    success: boolean;
    data?: Record<string, any>;
    error?: string;
}> {
    try {
        const tabs = await chrome.tabs.query({ url: `*://*.${domain}/*` });

        if (tabs.length === 0) {
            return {
                success: false,
                error: `未找到域名 ${domain} 的打开标签页`,
            };
        }

        const tab = tabs[0];
        if (!tab.id) {
            return { success: false, error: "无效的标签页ID" };
        }

        const response = await chrome.tabs.sendMessage(tab.id, {
            type: "SEARCH_LOCALSTORAGE",
            keyword: keyword,
        });

        if (response && response.success) {
            return {
                success: true,
                data: response.data,
            };
        } else {
            return {
                success: false,
                error: "Content script未响应或返回错误",
            };
        }
    } catch (error) {
        console.error("搜索localStorage失败:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
        };
    }
}
async function collectAppData(task: Task): Promise<CollectedAppData | null> {
    if (!task.includeAppData) {
        return null;
    }

    try {
        // 根据任务配置决定是否包含应用详情
        const includeDetails =
            task.appDataConfig?.collectAppList &&
            task.appDataConfig?.collectUserInfo;

        // 检查是否需要收集苹果应用数据
        const includeAppleApps = task.appDataConfig?.collectAppleApps || false;
        const maxAppleApps = task.appDataConfig?.maxAppleApps || 200;

        // 直接收集API数据，包括极光推送和苹果应用数据
        const apiResult = await collectAllAppData(
            includeDetails,
            "783922",
            includeAppleApps,
            maxAppleApps
        );

        if (apiResult.success && apiResult.data) {
            const collectedData: CollectedAppData = {
                collectTime: apiResult.data.collectTime,
                source: includeAppleApps ? "mixed" : "jiguang",
            };

            // 根据配置决定包含哪些数据
            if (task.appDataConfig?.collectUserInfo) {
                collectedData.userInfo = apiResult.data.userInfo;
            }

            if (task.appDataConfig?.collectAppList) {
                collectedData.appListData = apiResult.data.appListData;
                collectedData.appList = apiResult.data.appList;
                collectedData.appGroups = apiResult.data.appGroups;

                // 如果有详情数据且启用了收集，则包含
                if (apiResult.data.appDetails && includeDetails) {
                    collectedData.appDetails = apiResult.data.appDetails;

                    // 限制应用数量
                    if (
                        task.appDataConfig?.maxApps &&
                        collectedData.appDetails.length >
                            task.appDataConfig.maxApps
                    ) {
                        collectedData.appDetails =
                            collectedData.appDetails.slice(
                                0,
                                task.appDataConfig.maxApps
                            );
                        collectedData.appList = collectedData.appList?.slice(
                            0,
                            task.appDataConfig.maxApps
                        );
                    }
                }
            }

            // 包含苹果应用数据（如果有）
            if (includeAppleApps && apiResult.data.appleAppList) {
                collectedData.appleAppList = apiResult.data.appleAppList;
                collectedData.appleAppListData =
                    apiResult.data.appleAppListData;
                console.log(
                    `成功收集苹果应用数据: ${collectedData.appleAppList.length} 个应用`
                );
            }

            return collectedData;
        } else {
            console.error("收集应用数据失败:", apiResult.error);
            return null;
        }
    } catch (error) {
        console.error("收集应用数据时出错:", error);
        return null;
    }
}

const TASKS_KEY = "cc_tasks_v2";
const DOMAINS_KEY = "cc_domains_v2";

// Simple cron -> next-time helper: supports '0 */N * * *' (every N hours) & '*/M * * * *' minutes.
function computeNextFromCron(cron: string, from = new Date()): number {
    if (!cron) return Date.now() + 60 * 60 * 1000;
    const m = cron.match(/^0\s*\*\/\*(\d+)\s*\*\s*\*\s*\*$/);
    if (m) {
        const n = parseInt(m[1], 10);
        const next = new Date(from);
        next.setMinutes(0, 0, 0);
        const curr = next.getHours();
        const add = n - (curr % n);
        next.setHours(curr + add);
        return next.getTime();
    }
    const mm = cron.match(/^\*\/([0-9]+)\s+\*\s+\*\s+\*\s+\*$/);
    if (mm) {
        const mins = parseInt(mm[1], 10);
        return from.getTime() + mins * 60 * 1000;
    }
    // fallback 1 hour
    return from.getTime() + 60 * 60 * 1000;
}

async function setLastSent(taskId: string) {
    chrome.storage.local.set({ ["lastSent_" + taskId]: Date.now() });
}

async function scheduleNext(task: Task) {
    const next = computeNextFromCron(task.cron);
    chrome.alarms.create(task.id, { when: next });
    chrome.storage.local.set({ ["alarm_next_" + task.id]: next });
}

// 检查域名是否已授权（存在于授权域名列表中）
async function isDomainAuthorized(domain: string): Promise<boolean> {
    const domains = await getDomains();
    return domains.includes(domain);
}

// core run logic (used both by alarm handler and manual run)
async function runTask(taskId: string) {
    const tasks = await getTasks();
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !task.enabled) return;

    // 检查域名是否已授权
    const isAuthorized = await isDomainAuthorized(task.domain);
    if (!isAuthorized) {
        chrome.notifications.create("", {
            type: "basic",
            title: "Cookie Collector",
            message: `Domain ${task.domain} not authorized.`,
            iconUrl: "/icons/icon48.png",
        });
        return;
    }

    const domains = task.domain ? [task.domain] : [];
    const cookiesByDomain: Record<string, any> = {};
    let appData: CollectedAppData | null = null;

    try {
        // 收集 Cookie 数据
        for (const d of domains) {
            // NOTE: chrome.cookies.getAll requires host permission for that domain
            const list = await new Promise<chrome.cookies.Cookie[]>((res) =>
                chrome.cookies.getAll({ domain: d }, (c) => res(c || []))
            );
            cookiesByDomain[d] = (list || []).map((c) => ({
                name: c.name,
                value: c.value,
                domain: c.domain,
            }));
        }

        // 收集应用数据（如果启用）
        if (task.includeAppData) {
            appData = await collectAppData(task);
        }

        // 构建请求数据
        const taskExecutionData: TaskExecutionData = {
            taskId: task.id,
            timestamp: Date.now(),
            cookies: cookiesByDomain,
        };

        // 如果收集到应用数据，则包含在请求中
        if (appData) {
            taskExecutionData.appData = appData;
        }

        const body = JSON.stringify(taskExecutionData);

        const resp = await fetch(task.targetUrl, {
            method: "POST",
            headers: task.headers || {},
            body,
        });

        if (!resp.ok) throw new Error("HTTP " + resp.status);
        await setLastSent(task.id);

        // 更新任务的最后执行时间
        task.lastRun = Date.now();
        await setTasks(tasks);

        chrome.notifications.create("", {
            type: "basic",
            title: "Cookie Collector",
            message: `Task ${task.name} sent successfully${
                appData ? " (with app data)" : ""
            }.`,
            iconUrl: "/icons/icon48.png",
        });
    } catch (err: any) {
        chrome.notifications.create("", {
            type: "basic",
            title: "Cookie Collector - Failed",
            message: `Task ${task?.name} failed: ${err?.message || err}`,
            iconUrl: "/icons/icon48.png",
        });
    } finally {
        if (task) scheduleNext(task);
    }
}

// messages from options page
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "createAlarm" && msg.task) {
        scheduleNext(msg.task);
        sendResponse({ ok: true });
        return true;
    }
    if (msg?.type === "runTaskNow" && msg.taskId) {
        runTask(msg.taskId);
        sendResponse({ ok: true });
        return true;
    }
    if (msg?.type === "getTasks") {
        getTasks().then((tasks) => {
            sendResponse({ tasks });
        });
        return true;
    }
    if (msg?.type === "saveTask") {
        getTasks().then((tasks) => {
            const existingIndex = tasks.findIndex((t) => t.id === msg.task.id);
            if (existingIndex >= 0) {
                tasks[existingIndex] = msg.task;
            } else {
                tasks.push(msg.task);
            }
            setTasks(tasks).then(() => {
                sendResponse({ ok: true });
            });
        });
        return true;
    }
    if (msg?.type === "deleteTask") {
        getTasks().then((tasks) => {
            const filteredTasks = tasks.filter((t) => t.id !== msg.taskId);
            setTasks(filteredTasks).then(() => {
                sendResponse({ ok: true });
            });
        });
        return true;
    }
    if (msg?.type === "getDomains") {
        getDomains().then((domains) => {
            sendResponse({ domains });
        });
        return true;
    }
    if (msg?.type === "saveDomain") {
        getDomains().then((domains) => {
            if (!domains.includes(msg.domain)) {
                domains.push(msg.domain);
                setDomains(domains).then(() => {
                    sendResponse({ ok: true });
                });
            } else {
                sendResponse({ ok: true });
            }
        });
        return true;
    }
    if (msg?.type === "deleteDomain") {
        getDomains().then((domains) => {
            const filteredDomains = domains.filter((d) => d !== msg.domain);
            setDomains(filteredDomains).then(() => {
                // 同时删除相关任务
                getTasks().then((tasks) => {
                    const filteredTasks = tasks.filter(
                        (t) => t.domain !== msg.domain
                    );
                    setTasks(filteredTasks).then(() => {
                        sendResponse({ ok: true });
                    });
                });
            });
        });
        return true;
    }
    // 检查域名是否已授权
    if (msg?.type === "checkDomainAuthorization") {
        isDomainAuthorized(msg.domain).then((authorized) => {
            sendResponse({ authorized });
        });
        return true;
    }
    // 获取网页localStorage数据
    if (msg?.type === "getWebPageLocalStorage") {
        getWebPageLocalStorage(msg.domain, msg.keys).then((result) => {
            sendResponse(result);
        });
        return true;
    }
    // 搜索网页localStorage数据
    if (msg?.type === "searchWebPageLocalStorage") {
        searchWebPageLocalStorage(msg.domain, msg.keyword).then((result) => {
            sendResponse(result);
        });
        return true;
    }
    // 检查token状态
    if (msg?.type === "checkTokenStatus") {
        getJiguangTokenFromCookie().then((token) => {
            sendResponse({ hasToken: token !== null });
        });
        return true;
    }
    // 手动收集应用数据
    if (msg?.type === "collectAppData") {
        collectAllAppData().then((result) => {
            sendResponse(result);
        });
        return true;
    }
    // 更新 Jtoken
    if (msg?.type === "updateJtoken") {
        chrome.storage.local.set({ Jtoken: msg.token }).then(() => {
            sendResponse({ ok: true });
        });
        return true;
    }
});

// alarm handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
    const taskId = alarm.name;
    // if alarm name endswith _manual_xxx we still try to run
    await runTask(taskId);
});

// on startup, re-create alarms from saved tasks (alarms may not persist reliably)
chrome.runtime.onStartup.addListener(async () => {
    const tasks = await getTasks();
    for (const t of tasks) scheduleNext(t);
});

// on installed: schedule existing tasks
chrome.runtime.onInstalled.addListener(async () => {
    const tasks = await getTasks();
    for (const t of tasks) scheduleNext(t);
});
