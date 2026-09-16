import type { BlocRecord } from "@bernouy/cms-content";
import { parseHTML } from "linkedom";
import { resolveDefaultContent } from "./sourceBundle";

export type BlocDefaultAttribute = {
    name: string;
    value: string;
    hasValue: boolean;
};

export function blocDefaultAttributes(record: Pick<BlocRecord, "tag" | "artifact">): BlocDefaultAttribute[] {
    const content = resolveDefaultContent(record.artifact?.source).content;
    if (!content) {
        return [];
    }
    const { document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
    document.body.innerHTML = content;
    const root = Array.from(document.body.children).find((element) => element.localName === record.tag);
    if (!root) {
        return [];
    }
    return Array.from(root.attributes).map(({ name, value }) => ({ name, value, hasValue: value.length > 0 }));
}
