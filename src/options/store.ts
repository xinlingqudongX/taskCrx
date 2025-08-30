import { reactive } from "vue";
import type { Task as BackgroundTask, AppDataConfig } from "../types/index";

// 定义前端任务接口（继承后端类型并添加前端特有字段）
interface Task extends Omit<BackgroundTask, "targetUrl" | "lastRun"> {
    status: string; // 前端显示用的状态
    lastRun: Date | null; // 前端使用 Date 对象
    nextRun: Date | null;
    apiEndpoint: string; // 对应 targetUrl
}

class DomainStore {
    public state: any;
    constructor() {
        this.state = reactive({
            domains: [] as string[],
            tasks: [] as Task[],
        });

        // 初始化时从background获取数据
        this.initData();
    }

    async initData() {
        try {
            // 获取域名列表
            const domainsResponse = await chrome.runtime.sendMessage({
                type: "getDomains",
            });
            if (domainsResponse && domainsResponse.domains) {
                this.state.domains = domainsResponse.domains;
            }

            // 获取任务列表
            const tasksResponse = await chrome.runtime.sendMessage({
                type: "getTasks",
            });
            if (tasksResponse && tasksResponse.tasks) {
                this.state.tasks = tasksResponse.tasks.map((task: any) => ({
                    ...task,
                    name: task.name || task.domain,
                    status: task.enabled ? "启用" : "禁用",
                    lastRun: task.lastRun ? new Date(task.lastRun) : null,
                    nextRun: null, // 这个信息在background中维护
                    apiEndpoint: task.targetUrl || "",
                    // 支持应用数据相关字段
                    includeAppData: task.includeAppData || false,
                    appDataConfig: task.appDataConfig || {
                        collectUserInfo: false,
                        collectAppList: false,
                        maxApps: 50,
                    },
                }));
            }
        } catch (error) {
            console.error("初始化数据失败", error);
            // 使用默认数据
            this.state.domains = ["example.com", "test.com"];
            this.state.tasks = [
                {
                    id: "1",
                    domain: "example.com",
                    name: "example.com",
                    status: "启用",
                    lastRun: null,
                    nextRun: null,
                    apiEndpoint: "",
                    headers: {},
                    enabled: true,
                    includeAppData: false,
                    appDataConfig: {
                        collectUserInfo: false,
                        collectAppList: false,
                        maxApps: 50,
                        collectAppleApps: false,
                        maxAppleApps: 200,
                    },
                },
                {
                    id: "2",
                    domain: "test.com",
                    name: "test.com",
                    status: "禁用",
                    lastRun: new Date("2023-01-01T10:00:00"),
                    nextRun: null,
                    apiEndpoint: "",
                    headers: {},
                    enabled: false,
                    includeAppData: false,
                    appDataConfig: {
                        collectUserInfo: false,
                        collectAppList: false,
                        maxApps: 50,
                        collectAppleApps: false,
                        maxAppleApps: 200,
                    },
                },
            ];
        }
    }

    async addDomain(domain: string) {
        if (!this.state.domains.includes(domain)) {
            try {
                // 直接在options页面请求权限
                const granted = await chrome.permissions.request({
                    origins: [`*://*.${domain}/*`],
                });

                if (!granted) {
                    console.log(`用户拒绝了对域名 ${domain} 的权限请求`);
                    return false;
                }

                // 权限获取成功后保存域名到background
                await chrome.runtime.sendMessage({
                    type: "saveDomain",
                    domain: domain,
                });
                this.state.domains.push(domain);
                console.log(`成功添加域名: ${domain}`);
                return true;
            } catch (error) {
                console.error("添加域名失败", error);
                return false;
            }
        }
        console.log(`域名已存在: ${domain}`);
        return false;
    }

    async removeDomain(domain: string) {
        try {
            await chrome.runtime.sendMessage({
                type: "deleteDomain",
                domain: domain,
            });
            this.state.domains = this.state.domains.filter(
                (d: string) => d !== domain
            );
            this.state.tasks = this.state.tasks.filter(
                (t: Task) => t.domain !== domain
            );
            console.log(`已移除域名: ${domain}`);
            return true;
        } catch (error) {
            console.error("删除域名失败", error);
            return false;
        }
    }

    getDomains() {
        return this.state.domains;
    }

    getTasks() {
        return this.state.tasks;
    }

    async addTask(taskData: Partial<Task>) {
        const domain = taskData.domain;
        if (!domain) return null;

        const taskExists = this.state.tasks.some(
            (task: Task) => task.domain === domain
        );
        if (!taskExists) {
            const newTask: Task = {
                id: Date.now().toString(),
                domain,
                name: taskData.name || domain,
                status: taskData.status || "启用",
                lastRun: taskData.lastRun || null,
                nextRun: taskData.nextRun || null,
                apiEndpoint: taskData.apiEndpoint || "",
                headers: taskData.headers || {},
                cron: taskData.cron || "",
                enabled:
                    taskData.status === "启用" || taskData.enabled !== false,
                includeAppData: taskData.includeAppData || false,
                appDataConfig: taskData.appDataConfig || {
                    collectUserInfo: false,
                    collectAppList: false,
                    maxApps: 50,
                    collectAppleApps: false,
                    maxAppleApps: 200,
                },
            };

            try {
                await chrome.runtime.sendMessage({
                    type: "saveTask",
                    task: {
                        id: newTask.id,
                        domain: newTask.domain,
                        name: newTask.name,
                        cron: newTask.cron,
                        targetUrl: newTask.apiEndpoint,
                        headers: newTask.headers,
                        enabled: newTask.enabled,
                        includeAppData: newTask.includeAppData,
                        appDataConfig: newTask.appDataConfig,
                    },
                });
                this.state.tasks.push(newTask);
                console.log(`成功添加任务: ${domain}`);
                return newTask;
            } catch (error) {
                console.error("添加任务失败", error);
                return null;
            }
        }
        console.log(`任务已存在: ${domain}`);
        return null;
    }

    async removeTask(domain: string) {
        const task = this.state.tasks.find((t: Task) => t.domain === domain);
        if (task) {
            try {
                await chrome.runtime.sendMessage({
                    type: "deleteTask",
                    taskId: task.id,
                });
                this.state.tasks = this.state.tasks.filter(
                    (t: Task) => t.domain !== domain
                );
                console.log(`已删除任务: ${domain}`);
                return true;
            } catch (error) {
                console.error("删除任务失败", error);
                return false;
            }
        }
        return false;
    }

    async updateTask(domain: string, updates: Partial<Task>) {
        const task = this.state.tasks.find((t: Task) => t.domain === domain);
        if (task) {
            // 更新本地状态
            Object.assign(task, updates);

            // 如果状态字段被更新，同步enabled字段
            if (updates.status !== undefined) {
                task.enabled = updates.status === "启用";
            }

            // 同步到background
            try {
                await chrome.runtime.sendMessage({
                    type: "saveTask",
                    task: {
                        id: task.id,
                        domain: task.domain,
                        name: task.name || task.domain,
                        cron: task.cron,
                        targetUrl: task.apiEndpoint,
                        headers: task.headers,
                        enabled: task.enabled,
                        includeAppData: task.includeAppData,
                        appDataConfig: task.appDataConfig,
                    },
                });
                console.log(`更新任务配置: ${domain}`);
                return true;
            } catch (error) {
                console.error("更新任务配置失败", error);
                return false;
            }
        }
        return false;
    }

    async toggleTaskStatus(domain: string) {
        const task = this.state.tasks.find((t: Task) => t.domain === domain);
        if (task) {
            const newStatus = task.status === "启用" ? "禁用" : "启用";
            return await this.updateTask(domain, { status: newStatus });
        }
        return false;
    }

    async executeTask(domain: string) {
        const task = this.state.tasks.find((t: Task) => t.domain === domain);
        if (task) {
            task.lastRun = new Date();
            task.status = "进行中";
            console.log(`执行任务: ${domain}`);

            try {
                const response = await chrome.runtime.sendMessage({
                    type: "runTaskNow",
                    taskId: task.id,
                });
                console.log("任务执行请求已发送到background脚本", response);
                return response;
            } catch (error) {
                console.error("发送任务执行请求失败", error);
                return { ok: false, error: (error as Error).message };
            }
        }
        return { ok: false, error: "任务不存在" };
    }

    // 检查域名是否已授权
    async checkDomainAuthorization(domain: string): Promise<boolean> {
        try {
            const response = await chrome.runtime.sendMessage({
                type: "checkDomainAuthorization",
                domain: domain,
            });
            return response.authorized || false;
        } catch (error) {
            console.error("检查域名授权失败", error);
            return false;
        }
    }

    async exportTasks() {
        try {
            const domainsResponse = await chrome.runtime.sendMessage({
                type: "getDomains",
            });
            const tasksResponse = await chrome.runtime.sendMessage({
                type: "getTasks",
            });

            const exportData = {
                version: "2.0",
                exportTime: new Date().toISOString(),
                domains: domainsResponse.domains || [],
                tasks: tasksResponse.tasks || [],
            };
            return JSON.stringify(exportData, null, 2);
        } catch (error) {
            console.error("导出任务失败", error);
            throw error;
        }
    }

    async importTasks(jsonData: string) {
        try {
            const data = JSON.parse(jsonData);

            if (!data.domains || !data.tasks) {
                throw new Error("无效的数据格式");
            }

            // 保存域名
            for (const domain of data.domains) {
                await chrome.runtime.sendMessage({
                    type: "saveDomain",
                    domain: domain,
                });
            }

            // 保存任务
            for (const task of data.tasks) {
                await chrome.runtime.sendMessage({
                    type: "saveTask",
                    task: task,
                });
            }

            // 更新本地状态
            this.state.domains = data.domains;
            this.state.tasks = data.tasks.map((task: any) => ({
                ...task,
                name: task.name || task.domain,
                status: task.enabled ? "启用" : "禁用",
                lastRun: task.lastRun ? new Date(task.lastRun) : null,
                nextRun: task.nextRun ? new Date(task.nextRun) : null,
                apiEndpoint: task.targetUrl || "",
                // 支持应用数据相关字段
                includeAppData: task.includeAppData || false,
                appDataConfig: task.appDataConfig || {
                    collectUserInfo: false,
                    collectAppList: false,
                    maxApps: 50,
                },
            }));

            console.log(`成功导入 ${data.tasks.length} 个任务`);
            return { success: true, count: data.tasks.length };
        } catch (error) {
            console.error("导入任务失败", error);
            return { success: false, error: (error as Error).message };
        }
    }
}

// 创建全局单例
export const domainStore = new DomainStore();
