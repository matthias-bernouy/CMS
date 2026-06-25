import type { TextCapability } from "@bernouy/cms-content/editor";

export function parseTextCapability(raw: string | null): TextCapability {
    try {
        return JSON.parse(raw ?? "{}") as TextCapability;
    } catch {
        return { format: "richtext" };
    }
}
