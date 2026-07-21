import type { Suggestion } from "../types";

export const filterSuggestions = (pool: Suggestion[], current: string[], query: string): Suggestion[] => {
    const filtered = pool.filter((s) => !current.includes(s.value));
    if (query === "") {
        return filtered.slice(0, 8);
    }
    return filtered.filter((s) => s.value.toLowerCase().includes(query)).slice(0, 8);
};

export const computeValueString = (mode: string, tags: string[]): string => {
    if (mode === "multiple") {
        return tags.join(",");
    }
    return tags[0] ?? "";
};

export const parseValueString = (mode: string, v: string): string[] => {
    if (mode === "multiple") {
        return v
            ? v
                  .split(",")
                  .map((t) => t.trim())
                  .filter((t) => t !== "")
            : [];
    }
    return v ? [v.trim()] : [];
};
