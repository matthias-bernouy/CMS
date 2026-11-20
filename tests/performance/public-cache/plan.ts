export const scenarioIds = [
    "public.warm",
    "public.reload.no-cache",
    "public.reload.max-age-zero",
    "public.response-expiry",
    "public.context-idle",
    "public.edge-restart",
    "public.provider-edge-restart",
    "public.write-invalidation",
    "public.styles-after-restart",
    "public.private-response",
] as const;
export type ScenarioId = (typeof scenarioIds)[number];
export type CacheOptions = { list: boolean; scenarios: ScenarioId[]; samples: number; epochs: number };

/** Exact selection is resolved before building images or acquiring containers. */
export function cacheOptions(args: readonly string[]): CacheOptions {
    const selected = new Set<string>();
    const options = { list: false, samples: 30, epochs: 3 };
    for (let index = 0; index < args.length; index++) {
        const key = args[index]!;
        if (key === "--list") {
            options.list = true;
            continue;
        }
        const value = args[++index];
        if (!value || !["--scenario", "--samples", "--epochs"].includes(key)) {
            throw new Error(`Unsupported public-cache argument: ${key}`);
        }
        if (key === "--scenario") {
            if (!scenarioIds.some((id) => id === value)) {
                throw new Error(`Unknown public-cache scenario: ${value}`);
            }
            selected.add(value);
        } else {
            const limit = key === "--samples" ? 200 : 30;
            if (!/^[1-9][0-9]*$/u.test(value) || Number(value) > limit) {
                throw new Error(`${key} must be an integer between 1 and ${limit}`);
            }
            options[key === "--samples" ? "samples" : "epochs"] = Number(value);
        }
    }
    return { ...options, scenarios: scenarioIds.filter((id) => !selected.size || selected.has(id)) };
}
