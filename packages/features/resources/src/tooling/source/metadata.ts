import { contractString } from "@bernouy/ulvia-sdk";
import { z } from "zod";
import { isResourceId } from "@bernouy/ulvia-contracts/protocol";
import { localeSchema } from "resources/artifacts/archive/schemas";
import { sourceJson } from "./tree";

export const definitionSchema = z.strictObject({
    format: z.literal("ulvia-resource-source/v1"),
    namespace: z.string().refine(isResourceId),
    locale: localeSchema,
    states: z.array(z.unknown()).max(128),
});
export function translations(files: ReadonlyMap<string, Uint8Array>) {
    const result: Record<string, Record<string, string>> = {};
    for (const path of files.keys()) {
        if (!path.startsWith("translations/")) {
            continue;
        }
        const locale = localeSchema.parse(path.split("/")[1]);
        if (!path.endsWith(".json")) {
            throw new TypeError("Translations must be JSON files");
        }
        const fragment = z
            .record(
                z
                    .string()
                    .max(160)
                    .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u)
                    .refine((key) => !["constructor", "prototype"].includes(key)),
                contractString({ maxLength: 4096 }).refine((value) => Boolean(value.trim()) && !/[{}]/u.test(value)),
            )
            .parse(sourceJson(files, path));
        const values = (result[locale] ??= {});
        for (const [key, value] of Object.entries(fragment)) {
            if (Object.hasOwn(values, key)) {
                throw new TypeError("Duplicate resource translation: " + key);
            }
            values[key] = value;
        }
    }
    return result;
}
export function translate(
    source: {
        readonly locale: string;
        readonly translations: Readonly<Record<string, Readonly<Record<string, string>>>>;
    },
    key: string,
    locale: string,
): string {
    for (const candidate of new Set([locale, locale.split("-")[0]!, source.locale])) {
        const value = source.translations[candidate]?.[key];
        if (value !== undefined) {
            return value;
        }
    }
    throw new TypeError("Missing resource translation: " + key);
}
