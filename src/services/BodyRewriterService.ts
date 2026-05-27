import type { BodyRewriteRule } from "../types/index";

export class BodyRewriterService {
    private rules: BodyRewriteRule[] = [];

    addRule(rule: BodyRewriteRule): void {
        this.rules.push(rule);
    }

    removeRule(ruleId: string): void {
        this.rules = this.rules.filter((r) => r.id !== ruleId);
    }

    updateRule(ruleId: string, updates: Partial<BodyRewriteRule>): void {
        const rule = this.rules.find((r) => r.id === ruleId);
        if (rule) Object.assign(rule, updates);
    }

    getRules(): BodyRewriteRule[] {
        return [...this.rules];
    }

    getEnabledRules(): BodyRewriteRule[] {
        return this.rules.filter((r) => r.enabled);
    }

    matchesUrl(rule: BodyRewriteRule, url: string): boolean {
        try {
            const pattern = rule.urlPattern.replace(/\*/g, ".*");
            return new RegExp(`^${pattern}$`).test(url);
        } catch {
            return url.includes(rule.urlPattern);
        }
    }

    rewrite(body: string, url: string, target: "request" | "response"): string | null {
        const applicable = this.rules.filter(
            (r) => r.enabled && r.target === target && this.matchesUrl(r, url)
        );

        if (applicable.length === 0) return null;

        let result = body;

        for (const rule of applicable) {
            try {
                switch (rule.matchType) {
                    case "text":
                        result = result.split(rule.matchPattern).join(rule.replaceWith);
                        break;
                    case "regex":
                        result = result.replace(new RegExp(rule.matchPattern, "g"), rule.replaceWith);
                        break;
                    case "json":
                        result = this.rewriteJson(result, rule.matchPattern, rule.replaceWith);
                        break;
                }
            } catch (error) {
                console.warn(`规则 ${rule.name} 执行失败:`, error);
            }
        }

        return result === body ? null : result;
    }

    private rewriteJson(body: string, path: string, newValue: string): string {
        const obj = JSON.parse(body);
        const keys = path.split(".");
        let current: any = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            if (current[keys[i]] === undefined) return body;
            current = current[keys[i]];
        }

        const lastKey = keys[keys.length - 1];
        try {
            current[lastKey] = JSON.parse(newValue);
        } catch {
            current[lastKey] = newValue;
        }

        return JSON.stringify(obj);
    }

    setRules(rules: BodyRewriteRule[]): void {
        this.rules = rules;
    }

    clearRules(): void {
        this.rules = [];
    }
}

export const bodyRewriter = new BodyRewriterService();
