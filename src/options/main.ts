import { createApp } from "vue";
import App from "./App.vue";
// 导入所需组件
import {
    NButton,
    NDialog,
    NInput,
    NList,
    NListItem,
    NSpace,
    NLayoutHeader,
    NCard,
    NModal,
} from "naive-ui";

const app = createApp(App);

// 正确注册组件（使用 component 而非 use）
app.component("NButton", NButton)
    .component("NDialog", NDialog)
    .component("NInput", NInput)
    .component("NList", NList)
    .component("NListItem", NListItem)
    .component("NSpace", NSpace)
    .component("NLayoutHeader", NLayoutHeader)
    .component("NCard", NCard)
    .component("NModal", NModal);

app.mount("#app");
