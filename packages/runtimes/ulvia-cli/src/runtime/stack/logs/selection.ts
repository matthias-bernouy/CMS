export type RuntimeLogSelection = Readonly<{
    follow: boolean;
    components: readonly string[];
    services: readonly string[];
    levels: readonly string[];
}>;
const COMPONENTS = ["provider", "edge", "proxy", "mongo"];
const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"];

export function parseRuntimeLogSelection(args: readonly string[]): RuntimeLogSelection {
    let follow = false;
    const filters: Record<string, string[]> = { component: [], service: [], level: [] };
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === "--follow" && !follow) {
            follow = true;
            continue;
        }
        if (arg !== "--filter" || !args[index + 1]) {
            throw new Error("Usage: ulvia logs [--filter <component|service|level=value>] [--follow]");
        }
        const match = /^(component|service|level)=([a-z0-9-]{1,32})$/u.exec(args[++index]!);
        if (!match) {
            throw new Error("Invalid runtime log filter");
        }
        const key = match[1]!;
        const value = match[2]!;
        if (
            (key === "component" && !COMPONENTS.includes(value)) ||
            (key === "level" && !LEVELS.includes(value)) ||
            (key === "service" && !/^(?:provider|proxy|mongo|mongo-provision|edge-[1-9][0-9]?)$/u.test(value))
        ) {
            throw new Error("Invalid runtime log filter value");
        }
        if (filters[key]!.length >= 16) {
            throw new Error("Too many runtime log filters");
        }
        if (!filters[key]!.includes(value)) {
            filters[key]!.push(value);
        }
    }
    return { follow, components: filters.component!, services: filters.service!, levels: filters.level! };
}
export function logComponent(service: string): string {
    return service.startsWith("edge-") ? "edge" : service === "mongo-provision" ? "mongo" : service;
}
export function runtimeLogLevel(line: string): string | undefined {
    try {
        const row = JSON.parse(line);
        const level =
            row.level ??
            ({ D: "debug", I: "info", W: "warn", E: "error", F: "fatal" } as Record<string, string>)[row.s];
        const normalized = level === "warning" ? "warn" : level;
        return typeof normalized === "string" && LEVELS.includes(normalized) ? normalized : undefined;
    } catch {
        return undefined;
    }
}
