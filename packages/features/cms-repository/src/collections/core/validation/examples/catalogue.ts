import { invalid } from "../../errors";
import { array, identifier, string, unique } from "../../values";

export function parseBlocExampleMetadata(source: Record<string, unknown>, path: string, modern: boolean) {
    if (modern) {
        for (const field of ["category", "thumbnail", "defaultContent"]) {
            if (source[field] !== undefined) {
                invalid("is not supported in collection v2", `${path}.${field}`);
            }
        }
        string(source.description, 4096, `${path}.description`);
        if (!Array.isArray(source.categories) || source.categories.length === 0) {
            invalid("must contain at least one category", `${path}.categories`);
        }
        if (source.catalogue !== "hidden") {
            string(source.defaultExample, 96, `${path}.defaultExample`);
        }
    } else if (["categories", "examples", "defaultExample"].some((field) => source[field] !== undefined)) {
        invalid("example metadata requires collection v2", path);
    }
    const metadata: { categories?: string[]; examples?: string[]; defaultExample?: string } = {};
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
