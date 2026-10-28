import { parseRequirements } from "../../parsing/requirements";
import type { CollectionExample, CollectionExamplePreview } from "../../../interfaces/CollectionExample";
import type { CollectionLimits } from "../../limits";
import { invalid } from "../../errors";
import { array, identifier, integer, keys, record, string, unique } from "../../values";

export function parseCollectionExamples(
    value: unknown,
    limits: Readonly<CollectionLimits>,
): readonly CollectionExample[] {
    const result = array(value, limits.maxBlocs * 4, "$.examples").map((entry, index) => {
        const path = `$.examples[${index}]`;
        const source = record(entry, path);
        keys(source, ["id", "label", "description", "document", "previews", "requires"], path);
        const document = record(source.document, `${path}.document`);
        keys(document, ["html"], `${path}.document`);
        const previews = array(source.previews, 16, `${path}.previews`).map((entry, i) =>
            parsePreview(entry, `${path}.previews[${i}]`),
        );
        if (previews.length === 0) {
            invalid("must contain at least one preview", `${path}.previews`);
        }
        unique(
            previews.map((preview) => preview.id),
            `${path}.previews`,
        );
        return {
            id: identifier(source.id, `${path}.id`),
            label: string(source.label, 120, `${path}.label`),
            description: string(source.description, 4096, `${path}.description`),
            document: { html: string(document.html, limits.maxMarkupLength, `${path}.document.html`) },
            requires: parseRequirements(source.requires, `${path}.requires`, limits),
            previews,
        };
    });
    unique(
        result.map((example) => example.id),
        "$.examples",
    );
    return result.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function parsePreview(value: unknown, path: string): CollectionExamplePreview {
    const source = record(value, path);
    keys(source, ["id", "frame"], path);
    const frame = record(source.frame, `${path}.frame`);
    keys(frame, ["width", "height"], `${path}.frame`);
    const width = integer(frame.width, 1, 4096, `${path}.frame.width`);
    const height = integer(frame.height, 1, 4096, `${path}.frame.height`);
    return { id: identifier(source.id, `${path}.id`), frame: { width, height } };
}
