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

const removeTask = (taskId, domain) => {
    if (confirm(`确定要删除任务 ${domain} 吗？`)) {
        domainStore.removeTask(taskId);
    }
};

const executeTask = async (taskId, domain) => {
    // 检查任务是否启用
    const task = domainStore.getTasks().find(t => t.id === taskId);
    if (task && !task.enabled) {
        alert(`任务 ${domain} 未启用，无法执行`);
        return;
    }

    // 检查任务是否正在执行中
    if (task && task.status === "进行中") {
        alert(`任务 ${domain} 正在执行中，请稍候`);
        return;
    }
    
    // 检查域名是否已授权
    const authorized = await domainStore.checkDomainAuthorization(domain);
    if (!authorized) {
        alert(`域名 ${domain} 未授权，无法执行任务`);
        return;
    }

    // 通过background脚本执行任务
    try {
        const result = await domainStore.executeTask(taskId);
        if (result && result.ok) {
            console.log(`任务 ${domain} 执行成功`);
            // 可以添加一个成功提示
        } else {
            console.error(`任务 ${domain} 执行失败`, result?.error);
            alert(`任务 ${domain} 执行失败: ${result?.error || "未知错误"}`);
        }
    } catch (error) {
        console.error(`任务 ${domain} 执行出错:`, error);
        alert(`任务 ${domain} 执行出错: ${error.message || "未知错误"}`);
    }
};

const toggleTaskStatus = async (taskId) => {
    await domainStore.toggleTaskStatus(taskId);
};

const editTask = (task) => {
    // 使用事件总线调用父组件的编辑方法
    if (window.eventBus) {
        window.eventBus.emit('editTask', task);
    } else {
        console.error("事件总线未初始化，无法编辑任务");
    }
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
                onUpdateValue: () => toggleTaskStatus(row.id),
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
        key: "appDataConfig",
        render: (row) => {
            const config = row.appDataConfig || {};
            const features = [];
            
            // 判断是否启用极光数据收集
            if (config.collectJiguangData) {
                features.push("极光数据");
            }
            
            // 判断是否启用苹果数据收集
            if (config.collectAppleData) {
                features.push("苹果数据");
            }
            
            // 如果没有启用任何数据收集
            if (features.length === 0) {
                return h(
                    NTag,
                    {
                        type: "default",
                        size: "small",
                    },
                    { default: () => "未启用" }
                );
            }
            
            const tooltip = features.join(", ");
            
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
                    h(
                        "div",
                        {
                            style: "font-size: 11px; color: #999; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px;",
                        },
                        tooltip
                    )
                ]
            );
        },
        width: 120,
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
                        onClick: () => executeTask(row.id, row.domain),
                        disabled: !domainAuthStatus.value[row.domain] || !row.enabled || row.status === "进行中",
                        loading: row.status === "进行中",
                    },
                    { default: () => row.status === "进行中" ? "执行中..." : "执行" }
                ),
                h(
                    NButton,
                    {
                        size: "small",
                        type: "error",
                        tertiary: true,
                        onClick: () => removeTask(row.id, row.domain),
                    },
                    { default: () => "删除" }
                ),
            ]),
        width: 180,
    },
];
</script>
