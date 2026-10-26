import type { CollectionResourceDeprecation } from "../../../interfaces/CollectionRelease";
import { invalid } from "../../errors";
import { keys, record, string } from "../../values";

export function resourceMetadata(
    source: Record<string, unknown>,
    path: string,
): { deprecation?: CollectionResourceDeprecation } {
    if (source.deprecation === undefined) {
        return {};
    }
    const value = record(source.deprecation, `${path}.deprecation`);
    keys(value, ["reason", "replacedBy", "sunsetAt"], `${path}.deprecation`);
    const reason = string(value.reason, 120, `${path}.deprecation.reason`);
    if (!reason.trim()) {
        invalid("reason must be a nonblank translation key", path);
    }
    const replacedBy =
        value.replacedBy === undefined ? undefined : string(value.replacedBy, 512, `${path}.deprecation.replacedBy`);
    const sunsetAt =
        value.sunsetAt === undefined ? undefined : string(value.sunsetAt, 24, `${path}.deprecation.sunsetAt`);
    if (
        sunsetAt &&
        (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(sunsetAt) ||
            !Number.isFinite(Date.parse(sunsetAt)) ||
            new Date(sunsetAt).toISOString() !== sunsetAt)
    ) {
        invalid("sunsetAt must be a canonical UTC timestamp", `${path}.deprecation.sunsetAt`);
    }
    return {
        deprecation: {
            reason,
            ...(replacedBy === undefined ? {} : { replacedBy }),
            ...(sunsetAt === undefined ? {} : { sunsetAt }),
        },
    };
}
