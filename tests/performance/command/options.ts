export type PerformanceOptions = Readonly<{
    list: boolean;
    scenarioIds: readonly string[];
    referenceId?: string;
}>;

const USAGE = "Usage: bun run perf [--list] [--scenario <exact-id> ...] [--reference <run-id>]";

export function performanceOptions(args: readonly string[]): PerformanceOptions {
    const scenarioIds = new Set<string>();
    let list = false;
    let referenceId: string | undefined;
    for (let index = 0; index < args.length; index++) {
        const flag = args[index];
        if (flag === "--list" && !list) {
            list = true;
            continue;
        }
        if (flag !== "--scenario" && flag !== "--reference") {
            throw new Error(USAGE);
        }
        const value = args[++index];
        if (!value || value.startsWith("-") || !value.trim()) {
            throw new Error(USAGE);
        }
        if (flag === "--scenario") {
            scenarioIds.add(value);
        } else {
            if (referenceId) {
                throw new Error(USAGE);
            }
            referenceId = value;
        }
    }
    if (list && referenceId) {
        throw new Error(USAGE);
    }
    return { list, scenarioIds: [...scenarioIds], ...(referenceId ? { referenceId } : {}) };
}
