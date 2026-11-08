import { invalid } from "../../errors";
import { array, identifier, string, unique } from "../../values";

export function parseBlocExampleMetadata(source: Record<string, unknown>, path: string) {
    string(source.description, 4096, `${path}.description`);
    if (!Array.isArray(source.categories) || source.categories.length === 0) {
        invalid("must contain at least one category", `${path}.categories`);
    }
    const metadata: { categories: string[]; examples?: string[]; defaultExample?: string } = { categories: [] };
    for (const field of ["categories", "examples"] as const) {
        if (source[field] !== undefined) {
            metadata[field] = array(source[field], 64, `${path}.${field}`).map((value, i) =>
                field === "examples"
                    ? identifier(value, `${path}.${field}[${i}]`)
                    : string(value, 120, `${path}.${field}[${i}]`),
            );
            unique(metadata[field]!, `${path}.${field}`);
        }
    }
    if (source.defaultExample !== undefined) {
        metadata.defaultExample = identifier(source.defaultExample, `${path}.defaultExample`);
    }
    return metadata;
}
