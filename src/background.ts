// src/background.ts
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

type Task = {
    id: string;
    domain: string;
    name: string;
    cron: string;
    targetUrl: string;
    headers: Record<string, string>;
    enabled: boolean;
    concurrent?: number;
    lastRun?: number;
};

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
    try {
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
        const body = JSON.stringify({
            taskId: task.id,
            timestamp: Date.now(),
            cookies: cookiesByDomain,
        });
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
            message: `Task ${task.name} sent successfully.`,
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
