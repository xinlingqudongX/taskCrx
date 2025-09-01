<template>
    <n-space vertical>
        <!-- 顶部栏 -->
        <n-layout-header bordered>
            <n-space align="center" style="padding: 12px">
                <n-button @click="openInfoModal">
                    <template #icon>
                        <n-icon><InformationCircleOutline /></n-icon>
                    </template>
                    插件功能介绍
                </n-button>
                <n-button @click="openAuthModal" type="primary">
                    <template #icon>
                        <n-icon><AddOutline /></n-icon>
                    </template>
                    添加授权域名
                </n-button>
                <n-button @click="openAddTaskModal" type="info">
                    <template #icon>
                        <n-icon><AddOutline /></n-icon>
                    </template>
                    添加任务
                </n-button>
                <n-button @click="exportTasks" type="success">
                    <template #icon>
                        <n-icon><CloudDownloadOutline /></n-icon>
                    </template>
                    导出任务
                </n-button>
                <n-button @click="importTasks" type="warning">
                    <template #icon>
                        <n-icon><CloudUploadOutline /></n-icon>
                    </template>
                    导入任务
                </n-button>
                <input
                    ref="fileInput"
                    type="file"
                    accept=".json"
                    @change="handleFileImport"
                    style="display: none"
                />
            </n-space>
        </n-layout-header>

        <!-- 域名授权列表 -->
        <n-card title="已授权域名">
            <domain-list />
        </n-card>

        <!-- 任务区域 -->
        <n-card title="任务列表">
            <task-list />
        </n-card>
    </n-space>

    <!-- 功能介绍弹窗 -->
    <n-modal
        v-model:show="infoModalVisible"
        preset="dialog"
        title="插件功能介绍"
    >
        <p>此插件用于收集用户授权域名的 Cookie，并以 JSON 格式提交。</p>
        <p>使用方法：</p>
        <n-ul>
            <n-li>点击"添加授权域名"按钮添加需要收集 Cookie 的域名</n-li>
            <n-li>点击"添加任务"按钮为域名创建收集任务</n-li>
            <n-li>可以设置任务的执行时间、API端点和请求头</n-li>
            <n-li>插件会自动收集已授权域名的 Cookie 信息</n-li>
            <n-li>任务状态会在"任务列表"中显示</n-li>
            <n-li>可以使用"导入/导出"功能备份和恢复任务配置</n-li>
        </n-ul>
        <template #action>
            <n-button @click="infoModalVisible = false">关闭</n-button>
        </template>
    </n-modal>

    <!-- 授权域名弹窗 -->
    <n-modal
        v-model:show="authModalVisible"
        preset="dialog"
        title="添加授权域名"
    >
        <n-form :model="formValue" :rules="rules" ref="formRef">
            <n-form-item label="域名" path="domain">
                <n-input
                    v-model:value="formValue.domain"
                    placeholder="请输入域名，如 example.com"
                />
            </n-form-item>
        </n-form>
        <template #action>
            <n-space>
                <n-button @click="authModalVisible = false">取消</n-button>
                <n-button @click="handleAddDomain" type="primary"
                    >添加</n-button
                >
            </n-space>
        </template>
    </n-modal>

    <!-- 添加/编辑任务弹窗 -->
    <n-modal
        v-model:show="taskModalVisible"
        preset="dialog"
        :title="editingTask ? '编辑任务' : '添加任务'"
        style="width: 600px"
    >
        <n-form :model="taskFormValue" :rules="taskRules" ref="taskFormRef">
            <n-form-item label="域名" path="domain">
                <n-select
                    v-model:value="taskFormValue.domain"
                    :options="domainOptions"
                    placeholder="请选择域名"
                    :disabled="!!editingTask"
                />
            </n-form-item>
            <n-form-item label="任务名称" path="name">
                <n-input
                    v-model:value="taskFormValue.name"
                    placeholder="请输入任务名称"
                />
            </n-form-item>
            <n-form-item label="Cron表达式" path="cron">
                <n-input
                    v-model:value="taskFormValue.cron"
                    placeholder="例如: */30 * * * * (每30分钟执行一次)"
                />
            </n-form-item>
            <n-form-item label="API端点" path="apiEndpoint">
                <n-input
                    v-model:value="taskFormValue.apiEndpoint"
                    placeholder="请输入API端点URL"
                />
            </n-form-item>
            <n-form-item label="请求头 (JSON格式)" path="headers">
                <n-input
                    v-model:value="taskFormValue.headers"
                    type="textarea"
                    placeholder='{"Content-Type": "application/json", "Authorization": "Bearer token"}'
                    :autosize="{ minRows: 3 }"
                />
            </n-form-item>
            <n-form-item label="状态" path="enabled">
                <n-switch v-model:value="taskFormValue.enabled">
                    <template #checked>启用</template>
                    <template #unchecked>禁用</template>
                </n-switch>
            </n-form-item>
            
            <n-form-item label="收集极光数据信息" path="collectJiguangData">
                <n-switch v-model:value="taskFormValue.appDataConfig.collectJiguangData">
                    <template #checked>启用</template>
                    <template #unchecked>禁用</template>
                </n-switch>
                <n-text depth="3" style="margin-left: 12px; font-size: 12px;">
                    启用后将收集极光推送的用户信息和应用列表数据
                </n-text>
            </n-form-item>
            
            <n-form-item label="收集苹果数据信息" path="collectAppleData">
                <n-switch v-model:value="taskFormValue.appDataConfig.collectAppleData">
                    <template #checked>启用</template>
                    <template #unchecked>禁用</template>
                </n-switch>
                <n-text depth="3" style="margin-left: 12px; font-size: 12px;">
                    启用后将收集苹果开发者的应用列表和团队信息
                </n-text>
            </n-form-item>
            
            <n-form-item label="最大应用数量" path="maxApps">
                <n-input-number
                    v-model:value="taskFormValue.appDataConfig.maxApps"
                    :min="1"
                    :max="1000"
                    placeholder="请输入最大应用数量"
                    style="width: 200px;"
                />
                <n-text depth="3" style="margin-left: 12px; font-size: 12px;">
                    限制收集的应用数量，防止请求过大
                </n-text>
            </n-form-item>
        </n-form>
        <template #action>
            <n-space>
                <n-button @click="taskModalVisible = false">取消</n-button>
                <n-button @click="handleSaveTask" type="primary">保存</n-button>
            </n-space>
        </template>
    </n-modal>
</template>

<script setup>
import { ref, reactive, computed } from "vue";
import {
    NButton,
    NCard,
    NLayoutHeader,
    NModal,
    NSpace,
    NInput,
    NInputNumber,
    NForm,
    NFormItem,
    NIcon,
    NUl,
    NLi,
    NTag,
    NSelect,
    NSwitch,
    NDivider,
    NText,
} from "naive-ui";
import {
    InformationCircleOutline,
    AddOutline,
    CloudDownloadOutline,
    CloudUploadOutline,
} from "@vicons/ionicons5";
import DomainList from "./components/DomainList.vue";
import TaskList from "./components/TaskList.vue";
import { domainStore } from "./store";

const formRef = ref(null);
const taskFormRef = ref(null);
const fileInput = ref(null);

const infoModalVisible = ref(false);
const authModalVisible = ref(false);
const taskModalVisible = ref(false);
const editingTask = ref(null);

const formValue = reactive({
    domain: "",
});

const taskFormValue = reactive({
    domain: null,
    name: "",
    cron: "*/30 * * * *",
    apiEndpoint: "http://127.0.0.1",
    headers: "",
    enabled: true,
    appDataConfig: {
        collectJiguangData: false,
        collectAppleData: false,
        maxApps: 50,
    },
});

const rules = {
    domain: {
        required: true,
        trigger: ["input", "blur"],
        validator(rule, value) {
            if (!value) {
                return new Error("请输入域名");
            }
            // 简单的域名验证
            const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!domainRegex.test(value)) {
                return new Error("请输入有效的域名格式");
            }
            return true;
        },
    },
};

const taskRules = {
    domain: {
        required: true,
        trigger: ["input", "blur"],
        validator(rule, value) {
            if (!value) {
                return new Error("请选择域名");
            }
            return true;
        },
    },
    name: {
        required: true,
        trigger: ["input", "blur"],
        validator(rule, value) {
            if (!value) {
                return new Error("请输入任务名称");
            }
            return true;
        },
    },
    cron: {
        trigger: ["input", "blur"],
        validator(rule, value) {
            if (
                value &&
                !/^(\*\/[0-9]+|\*|\d+)(\s+(\*\/[0-9]+|\*|\d+)){4}$/.test(value)
            ) {
                return new Error("请输入有效的Cron表达式，如: */30 * * * *");
            }
            return true;
        },
    },
    apiEndpoint: {
        trigger: ["input", "blur"],
        validator(rule, value) {
            if (value && !/^https?:\/\/.+/.test(value)) {
                return new Error("请输入有效的URL");
            }
            return true;
        },
    },
    headers: {
        trigger: ["input", "blur"],
        validator(rule, value) {
            if (value) {
                try {
                    JSON.parse(value);
                    return true;
                } catch (e) {
                    return new Error("请输入有效的JSON格式");
                }
            }
            return true;
        },
    },
};

// 计算属性：为下拉框提供域名选项
const domainOptions = computed(() => {
    return domainStore.getDomains().map((domain) => ({
        label: domain,
        value: domain,
    }));
});

const openInfoModal = () => {
    infoModalVisible.value = true;
};

const openAuthModal = () => {
    authModalVisible.value = true;
};

const openAddTaskModal = () => {
    editingTask.value = null;
    // 重置表单
    taskFormValue.domain = null;
    taskFormValue.name = "";
    taskFormValue.cron = "*/30 * * * *";
    taskFormValue.apiEndpoint = "http://127.0.0.1";
    taskFormValue.headers = "";
    taskFormValue.enabled = true;
    taskFormValue.appDataConfig = {
        collectJiguangData: false,
        collectAppleData: false,
        maxApps: 50,
    };
    taskModalVisible.value = true;
};

const openEditTaskModal = (task) => {
    editingTask.value = task;
    // 填充表单
    taskFormValue.domain = task.domain;
    taskFormValue.name = task.name;
    taskFormValue.cron = task.cron || "";
    taskFormValue.apiEndpoint = task.apiEndpoint || "";
    taskFormValue.headers = task.headers
        ? JSON.stringify(task.headers, null, 2)
        : "";
    taskFormValue.enabled = task.enabled;
    taskFormValue.appDataConfig = task.appDataConfig || {
        collectJiguangData: false,
        collectAppleData: false,
        maxApps: 50,
    };
    taskModalVisible.value = true;
};

const handleAddDomain = (e) => {
    e.preventDefault();
    formRef.value?.validate(async (errors) => {
        if (!errors) {
            // 使用状态管理添加域名
            const success = await domainStore.addDomain(formValue.domain);
            if (success) {
                authModalVisible.value = false;
                formValue.domain = "";
            } else {
                // 可以添加用户提示，比如使用naive-ui的message组件
                console.log("域名添加失败或用户拒绝了权限请求");
            }
        } else {
            console.error("请检查输入");
        }
    });
};

const handleSaveTask = async (e) => {
    e.preventDefault();
    // 直接在options页面请求权限
    // const url = URL.parse(taskFormValue.apiEndpoint);
    // const domain = url.host;
    // const granted = await chrome.permissions.request({
    //     origins: [`*://*.${domain}/*`],
    // });

    // if (!granted) {
    //     console.log(`用户拒绝了对域名 ${domain} 的权限请求`);
    //     return false;
    // }
    taskFormRef.value?.validate((errors) => {
        if (!errors) {
            // 解析请求头
            let headers = {};
            if (taskFormValue.headers) {
                try {
                    headers = JSON.parse(taskFormValue.headers);
                } catch (e) {
                    console.error("请求头解析错误", e);
                }
            }

            if (editingTask.value) {
                // 更新任务
                domainStore.updateTask(editingTask.value.domain, {
                    name: taskFormValue.name,
                    cron: taskFormValue.cron,
                    apiEndpoint: taskFormValue.apiEndpoint,
                    headers: headers,
                    enabled: taskFormValue.enabled,
                    status: taskFormValue.enabled ? "启用" : "禁用",
                    appDataConfig: taskFormValue.appDataConfig,
                });
            } else {
                // 添加新任务
                domainStore.addTask({
                    domain: taskFormValue.domain,
                    name: taskFormValue.name,
                    cron: taskFormValue.cron,
                    apiEndpoint: taskFormValue.apiEndpoint,
                    headers: headers,
                    enabled: taskFormValue.enabled,
                    status: taskFormValue.enabled ? "启用" : "禁用",
                    appDataConfig: taskFormValue.appDataConfig,
                });
            }

            taskModalVisible.value = false;
        } else {
            console.error("请检查输入");
        }
    });
};

// 导出任务
const exportTasks = () => {
    domainStore
        .exportTasks()
        .then((jsonData) => {
            const blob = new Blob([jsonData], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `cookie-collector-tasks-${new Date()
                .toISOString()
                .slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        })
        .catch((error) => {
            alert(`导出失败: ${error.message}`);
        });
};

// 导入任务
const importTasks = () => {
    fileInput.value.click();
};

const handleFileImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const jsonData = e.target.result;
            domainStore.importTasks(jsonData).then((result) => {
                if (result.success) {
                    alert(`成功导入 ${result.count} 个任务`);
                } else {
                    alert(`导入失败: ${result.error}`);
                }
            });
        } catch (error) {
            alert(`导入失败: ${error.message}`);
        }
        // 重置文件输入
        event.target.value = "";
    };
    reader.readAsText(file);
};

// 暴露方法给子组件
defineExpose({
    openEditTaskModal,
});
</script>
