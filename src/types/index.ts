// src/types/index.ts

export interface Task {
    id: number; // 使用时间戳或自增ID确保唯一性
    name: string;
    domain: string; // 关联的域名
    apiUrl: string;
}

export type Domain = string;
