<template>
    <n-data-table
        :columns="domainColumns"
        :data="domainStore.getDomains()"
        :pagination="false"
        bordered
        striped
    />
</template>

<script setup>
import { h } from "vue";
import { NButton, NDataTable } from "naive-ui";
import { domainStore } from "../store";

const removeDomain = (domain) => {
    domainStore.removeDomain(domain);
};

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
                NButton,
                {
                    size: "small",
                    type: "error",
                    tertiary: true,
                    onClick: () => removeDomain(row),
                },
                { default: () => "移除" }
            ),
        width: 100,
    },
];
</script>
