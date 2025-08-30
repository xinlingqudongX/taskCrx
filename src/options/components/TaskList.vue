<template>
    <n-data-table
        :columns="taskColumns"
        :data="domainStore.getTasks()"
        :pagination="false"
        bordered
        striped
    />
</template>

<script setup>
import { h, onMounted, ref, watch } from "vue";
import { NButton, NTag, NDataTable, NText, NSwitch } from "naive-ui";
import { domainStore } from "../store";

// 存储域名授权状态
const domainAuthStatus = ref({});

// 检查所有任务域名的授权状态
const checkAllDomainAuthorizations = async () => {
    const tasks = domainStore.getTasks();
    for (const task of tasks) {
        const authorized = await domainStore.checkDomainAuthorization(
            task.domain
        );
        domainAuthStatus.value[task.domain] = authorized;
    }
};

// 监听任务列表变化，重新检查授权状态
watch(
    () => domainStore.getTasks(),
    () => {
        checkAllDomainAuthorizations();
    },
    { deep: true }
);

onMounted(() => {
    checkAllDomainAuthorizations();
});

const removeTask = (domain) => {
    if (confirm(`确定要删除任务 ${domain} 吗？`)) {
        domainStore.removeTask(domain);
    }
};

const executeTask = async (domain) => {
    // 检查域名是否已授权
    const authorized = await domainStore.checkDomainAuthorization(domain);
    if (!authorized) {
        alert(`域名 ${domain} 未授权，无法执行任务`);
        return;
    }

    // 通过background脚本执行任务
    try {
        const result = await domainStore.executeTask(domain);
        if (result && result.ok) {
            console.log(`任务 ${domain} 已发送到background脚本执行`);
        } else {
            console.error(`任务 ${domain} 执行失败`, result?.error);
        }
    } catch (error) {
        console.error(`任务 ${domain} 执行出错:`, error);
    }
};

const toggleTaskStatus = async (domain) => {
    await domainStore.toggleTaskStatus(domain);
};

const editTask = (task) => {
    // 获取父组件实例并调用编辑方法
    const app = document.querySelector("#app").__vue_app__;
    const appInstance = app._instance;
    appInstance.exposed.openEditTaskModal(task);
};

const formatDate = (date) => {
    if (!date) return "从未执行";
    return new Date(date).toLocaleString("zh-CN");
};

const getStatusType = (status) => {
    switch (status) {
        case "启用":
            return "success";
        case "进行中":
            return "warning";
        case "禁用":
            return "error";
        default:
            return "default";
    }
};

const getAuthStatusType = (authorized) => {
    return authorized ? "success" : "error";
};

const taskColumns = [
    {
        title: "序号",
        key: "index",
        render: (row, index) => index + 1,
        width: 60,
    },
    {
        title: "域名",
        key: "domain",
        render: (row) => h("span", row.domain),
        width: 150,
    },
    {
        title: "名称",
        key: "name",
        render: (row) => h("span", row.name),
        width: 150,
    },
    {
        title: "状态",
        key: "status",
        render: (row) =>
            h(
                NTag,
                {
                    type: getStatusType(row.status),
                },
                { default: () => row.status }
            ),
        width: 100,
    },
    {
        title: "授权状态",
        key: "authStatus",
        render: (row) => {
            const authorized = domainAuthStatus.value[row.domain] ?? false;
            return h(
                NTag,
                {
                    type: getAuthStatusType(authorized),
                },
                { default: () => (authorized ? "已授权" : "未授权") }
            );
        },
        width: 100,
    },
    {
        title: "启用",
        key: "enabled",
        render: (row) =>
            h(NSwitch, {
                value: row.enabled,
                onUpdateValue: () => toggleTaskStatus(row.domain),
                checkedValue: true,
                uncheckedValue: false,
                size: "small",
            }),
        width: 80,
    },
    {
        title: "上次执行",
        key: "lastRun",
        render: (row) =>
            h(
                NText,
                { depth: row.lastRun ? 1 : 3 },
                { default: () => formatDate(row.lastRun) }
            ),
        width: 180,
    },
    {
        title: "Cron表达式",
        key: "cron",
        render: (row) =>
            h(
                "div",
                {
                    style: "max-width: 150px; overflow: hidden; text-overflow: ellipsis;",
                },
                row.cron || "未设置"
            ),
        width: 150,
    },
    {
        title: "应用数据",
        key: "includeAppData",
        render: (row) => {
            if (!row.includeAppData) {
                return h(
                    NTag,
                    {
                        type: "default",
                        size: "small",
                    },
                    { default: () => "未启用" }
                );
            }
            
            const config = row.appDataConfig || {};
            const features = [];
            if (config.collectUserInfo) features.push("用户信息");
            if (config.collectAppList) features.push("应用列表");
            if (config.maxApps) features.push(`限制${config.maxApps}个`);
            
            const tooltip = features.length > 0 ? features.join(", ") : "基础配置";
            
            return h(
                "div",
                {
                    title: tooltip,
                    style: "cursor: help;",
                },
                [
                    h(
                        NTag,
                        {
                            type: "info",
                            size: "small",
                        },
                        { default: () => "已启用" }
                    ),
                    features.length > 0 && h(
                        "div",
                        {
                            style: "font-size: 11px; color: #999; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;",
                        },
                        tooltip
                    )
                ]
            );
        },
        width: 100,
    },
    {
        title: "API端点",
        key: "apiEndpoint",
        render: (row) =>
            h(
                "div",
                {
                    style: "max-width: 200px; overflow: hidden; text-overflow: ellipsis;",
                },
                row.apiEndpoint || "未设置"
            ),
    },
    {
        title: "操作",
        key: "actions",
        render: (row) =>
            h("div", [
                h(
                    NButton,
                    {
                        size: "small",
                        type: "primary",
                        tertiary: true,
                        style: "margin-right: 5px;",
                        onClick: () => editTask(row),
                    },
                    { default: () => "编辑" }
                ),
                h(
                    NButton,
                    {
                        size: "small",
                        type: "info",
                        tertiary: true,
                        style: "margin-right: 5px;",
                        onClick: () => executeTask(row.domain),
                        disabled: !domainAuthStatus.value[row.domain],
                    },
                    { default: () => "执行" }
                ),
                h(
                    NButton,
                    {
                        size: "small",
                        type: "error",
                        tertiary: true,
                        onClick: () => removeTask(row.domain),
                    },
                    { default: () => "删除" }
                ),
            ]),
        width: 180,
    },
];
</script>
