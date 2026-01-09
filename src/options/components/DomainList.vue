<template>
    <n-space vertical>
        <!-- 导入按钮 -->
        <n-space>
            <n-button @click="openImportDialog" type="primary">
                <template #icon>
                    <n-icon><CloudUploadOutline /></n-icon>
                </template>
                导入Cookie
            </n-button>
        </n-space>

        <!-- 域名列表 -->
        <n-data-table
            :columns="domainColumns"
            :data="domainStore.getDomains()"
            :pagination="false"
            bordered
            striped
        />
    </n-space>

    <!-- 分享对话框 -->
    <n-modal
        v-model:show="shareDialogVisible"
        preset="dialog"
        title="分享Cookie"
        style="width: 500px"
        :mask-closable="false"
    >
        <n-space vertical>
            <!-- 加载状态 -->
            <n-spin :show="shareLoading">
                <!-- 成功信息 -->
                <div v-if="shareSuccess" style="text-align: center; padding: 20px;">
                    <n-icon size="48" color="#18a058">
                        <CheckmarkCircleOutline />
                    </n-icon>
                    <n-text style="display: block; margin-top: 12px; font-size: 16px;">
                        Cookie文件已生成
                    </n-text>
                    <n-text depth="3" style="display: block; margin-top: 8px;">
                        文件名: {{ exportedFilename }}
                    </n-text>
                    <n-text depth="3" style="display: block; margin-top: 4px;">
                        数据大小: {{ shareDataSize }} 字节
                    </n-text>
                </div>

                <!-- 错误提示 -->
                <n-alert v-if="shareError" type="error" closable style="margin-bottom: 12px;">
                    {{ shareError }}
                </n-alert>
            </n-spin>
        </n-space>

        <template #action>
            <n-space>
                <n-button @click="downloadCookieFile" type="primary" :disabled="!shareSuccess || shareLoading">
                    <template #icon>
                        <n-icon><DownloadOutline /></n-icon>
                    </template>
                    下载文件
                </n-button>
                <n-button @click="shareDialogVisible = false">
                    关闭
                </n-button>
            </n-space>
        </template>
    </n-modal>

    <!-- 导入对话框 -->
    <n-modal
        v-model:show="importDialogVisible"
        preset="dialog"
        title="导入Cookie"
        style="width: 600px"
        :mask-closable="false"
    >
        <n-space vertical>
            <!-- 导入方式选择 -->
            <n-radio-group v-model:value="importMethod">
                <n-space>
                    <n-radio value="file">选择文件</n-radio>
                    <n-radio value="paste">粘贴数据</n-radio>
                </n-space>
            </n-radio-group>

            <!-- 文件选择方式 -->
            <div v-if="importMethod === 'file'">
                <n-upload
                    :accept="acceptExtensions"
                    :max="1"
                    :on-change="handleFileChange"
                    :show-file-list="true"
                >
                    <n-button>
                        <template #icon>
                            <n-icon><FolderOpenOutline /></n-icon>
                        </template>
                        选择 .cookie 文件
                    </n-button>
                </n-upload>
            </div>

            <!-- 粘贴方式 -->
            <div v-if="importMethod === 'paste'">
                <n-input
                    v-model:value="pasteData"
                    type="textarea"
                    placeholder="请粘贴Cookie数据（Base64格式）"
                    :autosize="{ minRows: 4, maxRows: 8 }"
                />
                <n-button
                    @click="parseFromPaste"
                    type="primary"
                    style="margin-top: 12px;"
                    :loading="importLoading"
                    :disabled="!pasteData.trim()"
                >
                    解析数据
                </n-button>
            </div>

            <!-- 导入信息预览 -->
            <div v-if="importPreview">
                <n-divider />
                <n-text strong>待导入的Cookie信息：</n-text>
                <n-space vertical style="margin-top: 12px;">
                    <n-text>域名: {{ importPreview.domain }}</n-text>
                    <n-text>Cookie数量: {{ importPreview.cookieCount }}</n-text>
                </n-space>
            </div>

            <!-- 错误提示 -->
            <n-alert v-if="importError" type="error" closable style="margin-bottom: 12px;">
                {{ importError }}
            </n-alert>

            <!-- 加载状态 -->
            <n-spin :show="importLoading" />
        </n-space>

        <template #action>
            <n-space>
                <n-button @click="importDialogVisible = false">
                    取消
                </n-button>
                <n-button
                    @click="confirmImport"
                    type="primary"
                    :disabled="!importPreview || importLoading"
                    :loading="importLoading"
                >
                    确认导入
                </n-button>
            </n-space>
        </template>
    </n-modal>
</template>

<script setup>
import { h, ref } from "vue";
import {
    NButton,
    NDataTable,
    NSpace,
    NModal,
    NInput,
    NAlert,
    NSpin,
    NRadioGroup,
    NRadio,
    NDivider,
    NText,
    NIcon,
    NUpload,
} from "naive-ui";
import { 
    CloudUploadOutline, 
    DownloadOutline, 
    FolderOpenOutline,
    CheckmarkCircleOutline 
} from "@vicons/ionicons5";
import { domainStore } from "../store";
import { cookieSharingService } from "../../services/CookieSharingService";
import { cookieFileExporter } from "../../services/CookieFileExporter";

// 状态管理
const shareDialogVisible = ref(false);
const importDialogVisible = ref(false);
const shareLoading = ref(false);
const importLoading = ref(false);
const selectedDomain = ref("");
const shareSuccess = ref(false);
const shareDataSize = ref(0);
const exportedFilename = ref("");
const shareError = ref("");
const importMethod = ref("file");
const pasteData = ref("");
const importPreview = ref(null);
const importError = ref("");
const selectedFile = ref(null);
const pendingCookies = ref(null);

// 获取支持的文件扩展名
const acceptExtensions = cookieSharingService.getAcceptAttribute();

// 简单的消息提示函数
const showMessage = (text, type = 'info') => {
    console.log(`[${type}] ${text}`);
};

// 移除域名
const removeDomain = (domain) => {
    domainStore.removeDomain(domain);
};

// 打开分享对话框
const openShareDialog = async (domain) => {
    selectedDomain.value = domain;
    shareSuccess.value = false;
    shareDataSize.value = 0;
    exportedFilename.value = "";
    shareError.value = "";
    shareDialogVisible.value = true;

    // 生成分享文件
    shareLoading.value = true;
    try {
        const result = await cookieSharingService.generateShareFile(domain);
        shareSuccess.value = true;
        shareDataSize.value = result.dataSize;
        exportedFilename.value = result.file.filename;
        // 保存文件信息以供下载
        selectedFile.value = result.file;
        showMessage(`成功生成${domain}的Cookie文件`, 'success');
    } catch (error) {
        shareError.value = error.message || "生成分享文件失败";
        showMessage(shareError.value, 'error');
    } finally {
        shareLoading.value = false;
    }
};

// 下载Cookie文件
const downloadCookieFile = () => {
    if (selectedFile.value) {
        try {
            cookieFileExporter.download(selectedFile.value);
            showMessage("文件已开始下载", 'success');
        } catch (error) {
            showMessage("下载失败: " + error.message, 'error');
        }
    }
};

// 打开导入对话框
const openImportDialog = () => {
    pasteData.value = "";
    importPreview.value = null;
    importError.value = "";
    importMethod.value = "file";
    selectedFile.value = null;
    pendingCookies.value = null;
    importDialogVisible.value = true;
};

// 处理文件选择
const handleFileChange = async ({ file, fileList }) => {
    if (file.status === 'removed') {
        importPreview.value = null;
        pendingCookies.value = null;
        return;
    }

    if (!file.file) return;

    importLoading.value = true;
    importError.value = "";
    
    try {
        // 预览导入文件
        const result = await cookieSharingService.previewImport(file.file);
        importPreview.value = {
            domain: result.domain,
            cookieCount: result.cookieCount,
        };
        pendingCookies.value = result.cookies;
        showMessage("文件解析成功", 'success');
    } catch (error) {
        importError.value = error.message || "解析文件失败";
        importPreview.value = null;
        pendingCookies.value = null;
        showMessage(importError.value, 'error');
    } finally {
        importLoading.value = false;
    }
};

// 从粘贴数据解析
const parseFromPaste = async () => {
    if (!pasteData.value.trim()) {
        importError.value = "请输入数据";
        return;
    }

    importLoading.value = true;
    importError.value = "";
    
    try {
        const result = await cookieSharingService.importFromBase64(pasteData.value.trim());
        importPreview.value = {
            domain: result.domain,
            cookieCount: result.cookieCount,
        };
        // 数据已经被导入了，标记为已完成
        pendingCookies.value = null;
        showMessage("数据解析并导入成功", 'success');
        importDialogVisible.value = false;
    } catch (error) {
        importError.value = error.message || "解析数据失败";
        showMessage(importError.value, 'error');
    } finally {
        importLoading.value = false;
    }
};

// 确认导入
const confirmImport = async () => {
    if (!importPreview.value) return;

    importLoading.value = true;
    try {
        // 如果有待导入的Cookie数据，进行导入
        if (pendingCookies.value && importPreview.value.domain) {
            await cookieSharingService.setCookies(importPreview.value.domain, pendingCookies.value);
        }
        
        showMessage(`成功导入 ${importPreview.value.domain} 的 ${importPreview.value.cookieCount} 个Cookie`, 'success');
        importDialogVisible.value = false;
    } catch (error) {
        importError.value = error.message || "导入失败";
        showMessage(importError.value, 'error');
    } finally {
        importLoading.value = false;
    }
};

// 表格列定义
const domainColumns = [
    {
        title: "序号",
        key: "index",
        render: (row, index) => index + 1,
        width: 80,
    },
    {
        title: "域名",
        key: "domain",
        render: (row) => h("span", row),
    },
    {
        title: "操作",
        key: "actions",
        render: (row) =>
            h(
                NSpace,
                { size: "small" },
                {
                    default: () => [
                        h(
                            NButton,
                            {
                                size: "small",
                                type: "primary",
                                tertiary: true,
                                onClick: () => openShareDialog(row),
                            },
                            { default: () => "分享" }
                        ),
                        h(
                            NButton,
                            {
                                size: "small",
                                type: "error",
                                tertiary: true,
                                onClick: () => removeDomain(row),
                            },
                            { default: () => "移除" }
                        ),
                    ],
                }
            ),
        width: 150,
    },
];
</script>
