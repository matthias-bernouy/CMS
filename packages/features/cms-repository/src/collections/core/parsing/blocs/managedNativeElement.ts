import type {
    CollectionManagedNativeElement,
    CollectionManagedNativeElementTag,
} from "../../../interfaces/CollectionBloc";
import { invalid } from "../../errors";
import { array, keys, record, unique } from "../../values";

export const COLLECTION_MANAGED_NATIVE_ELEMENT_TAGS = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "a",
    "button",
    "img",
    "svg",
    "span",
] as const satisfies readonly CollectionManagedNativeElementTag[];

const tags = new Set<string>(COLLECTION_MANAGED_NATIVE_ELEMENT_TAGS);

function parseTag(value: unknown, path: string): CollectionManagedNativeElementTag {
    if (typeof value !== "string" || !tags.has(value)) {
        invalid(`must be one of ${COLLECTION_MANAGED_NATIVE_ELEMENT_TAGS.join(", ")}`, path);
    }
    return value as CollectionManagedNativeElementTag;
}

export function parseManagedNativeElement(value: unknown, path: string): CollectionManagedNativeElement {
    const source = record(value, path);
    keys(source, ["accepts"], path);
    const accepts = array(source.accepts, COLLECTION_MANAGED_NATIVE_ELEMENT_TAGS.length, `${path}.accepts`).map(
        (tag, index) => parseTag(tag, `${path}.accepts[${index}]`),
    );
    if (accepts.length === 0) {
        invalid("must accept at least one native element tag", `${path}.accepts`);
    }
    unique(accepts, `${path}.accepts`);
    return { accepts };
}
