import { DEFAULT_SHELL } from "cms-content/interfaces/settings";
import type { TSystem } from "cms-content/interfaces/settings";

export function defaultSystem(): TSystem {
    return {
        initializationStep: 0,
        site: {
            name:        "",
            favicon:     "",
            visible:     true,
            host:        "",
            language:    "",
            theme:       "",
            notFound:    null,
            serverError: null,
        },
        editor:   { layoutCategory: "", shell: DEFAULT_SHELL },
        security: { connectExtras: [], mediaExtras: [] },
    };
}

export function mergeSystemUpdate(current: TSystem, update: Partial<TSystem>): TSystem {
    const merged = { ...current };
    for (const [section, value] of Object.entries(update) as [keyof TSystem, unknown][]) {
        if (section === "initializationStep") {
            merged.initializationStep = value as number;
        } else if (typeof value === "object" && value !== null) {
            (merged as any)[section] = {
                ...(current as any)[section],
                ...value,
            };
        }
    }
    return merged;
}
