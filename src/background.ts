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

async function collectAppData(task: Task): Promise<CollectedAppData | null> {
    if (!task.appDataConfig) {
        return null;
    }

    try {
        const config = task.appDataConfig || {};

        // 根据新的配置决定收集哪些数据
        const includeJiguangData = config.collectJiguangData || false;
        const includeAppleData = config.collectAppleData || false;

        // 极光数据需要收集用户信息和应用列表详情
        const includeDetails = includeJiguangData;
        const maxApps = config.maxApps || 50;
        const maxAppleApps = config.maxApps || 200;

        // 使用新的收集函数，根据参数有选择性地收集数据
        const apiResult = await collectAllAppData({
            includeJiguangData,
            includeAppleData,
            userId: "783922",
            maxAppleApps,
        });

        if (apiResult.success && apiResult.data) {
            const collectedData: CollectedAppData = {
                collectTime: apiResult.data.collectTime,
            };

            // 构建极光数据集合
            if (includeJiguangData) {
                const jiguangData: any = {};

                if (apiResult.data.userInfo) {
                    jiguangData.userInfo = apiResult.data.userInfo;
                }
                if (apiResult.data.appListData) {
                    jiguangData.appListData = apiResult.data.appListData;
                }
                if (apiResult.data.appList) {
                    jiguangData.appList = apiResult.data.appList;
                }
                if (apiResult.data.appGroups) {
                    jiguangData.appGroups = apiResult.data.appGroups;
                }
                if (apiResult.data.appDetails && includeDetails) {
                    let appDetails = apiResult.data.appDetails;
                    let appList = apiResult.data.appList;

                    // 限制应用数量
                    if (maxApps && appDetails.length > maxApps) {
                        appDetails = appDetails.slice(0, maxApps);
                        appList = appList?.slice(0, maxApps);
                    }

                    jiguangData.appDetails = appDetails;
                    jiguangData.appList = appList;
                }

                collectedData.jiguangData = jiguangData;
            }

            // 构建苹果数据集合
            if (includeAppleData) {
                const appleData: any = {};

                if (apiResult.data.appleAppList) {
                    appleData.appList = apiResult.data.appleAppList;
                }
                if (apiResult.data.appleAppList) {
                    appleData.appList = apiResult.data.appleAppList;
                }
                if (apiResult.data.appleActorList) {
                    appleData.actorList = apiResult.data.appleActorList;
                }

                collectedData.appleData = appleData;

                console.log(
                    `成功收集苹果应用数据: ${
                        appleData.appList?.length || 0
                    } 个应用`
                );
                console.log(
                    `成功收集苹果 Actor 数据: ${
                        appleData.actorList?.length || 0
                    } 个 Actor`
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
        if (task.appDataConfig) {
            appData = await collectAppData(task);
        }

        // 构建请求数据
        const taskExecutionData: TaskExecutionData = {
            taskId: task.id,
            timestamp: Date.now(),
            cookie: cookiesByDomain,
            account: "默认账号",
            type: "任务类型",
        };

        // 如果收集到应用数据，则包含在请求中
        if (appData) {
            taskExecutionData.content = appData;
        }

        const body = JSON.stringify(taskExecutionData);

        const resp = await fetch(task.targetUrl, {
            method: "POST",
            headers: Object.assign(
                { "content-type": "application/json" },
                task.headers || {}
            ),
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
        console.error("Failed to send task:", err);
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
    // 检查token状态
    if (msg?.type === "checkTokenStatus") {
        getJiguangTokenFromCookie().then((token) => {
            sendResponse({ hasToken: token !== null });
        });
        return true;
    }
    // 手动收集应用数据
    if (msg?.type === "collectAppData") {
        // 默认收集所有数据类型（向后兼容）
        collectAllAppData({
            includeJiguangData: true,
            includeAppleData: true,
        }).then((result) => {
            sendResponse(result);
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
