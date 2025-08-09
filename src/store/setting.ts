// src/store/settings.ts

import { defineStore } from "pinia";
import type { Domain, Task } from "@/types";

// Omit<'id', Task> 表示创建一个新类型，它拥有 Task 的所有属性，除了 'id'
type TaskPayload = Omit<Task, "id" | "domain">;

export const useSettingsStore = defineStore("settings", {
    state: () => ({
        domains: [] as Domain[],
        tasks: [] as Task[],
    }),

    getters: {
        // 创建一个 getter 来根据域名筛选任务，非常高效
        tasksByDomain: (state) => {
            return (domain: Domain): Task[] =>
                state.tasks.filter((task) => task.domain === domain);
        },
    },

    actions: {
        // 从 chrome.storage 加载设置
        async loadSettings() {
            const result = await chrome.storage.sync.get(["domains", "tasks"]);
            this.domains = result.domains || [];
            this.tasks = result.tasks || [];
        },

        // 保存设置到 chrome.storage
        async saveSettings() {
            await chrome.storage.sync.set({
                domains: this.domains,
                tasks: this.tasks,
            });
        },

        // --- 域名操作 ---
        async addDomain(domain: Domain) {
            if (domain && !this.domains.includes(domain)) {
                this.domains.push(domain);
                await this.saveSettings();
            }
        },

        async removeDomain(domainToRemove: Domain) {
            this.domains = this.domains.filter((d) => d !== domainToRemove);
            // 同时删除该域名下的所有任务
            this.tasks = this.tasks.filter(
                (task) => task.domain !== domainToRemove
            );
            await this.saveSettings();
        },

        // --- 任务操作 ---
        async addTask(domain: Domain, taskPayload: TaskPayload) {
            const newTask: Task = {
                id: Date.now(), // 使用时间戳作为唯一ID
                domain: domain,
                ...taskPayload,
            };
            this.tasks.push(newTask);
            await this.saveSettings();
        },

        async removeTask(taskId: number) {
            this.tasks = this.tasks.filter((task) => task.id !== taskId);
            await this.saveSettings();
        },
    },
});
