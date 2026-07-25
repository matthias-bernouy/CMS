import { prepareNetworkInertBindings } from "@bernouy/components/binding-dom";
import { parseHTML } from "linkedom";

/** Builds the execution representation before markup reaches an active iframe. */
export function networkInertHtml(html: string): string {
    const { document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
    document.body.innerHTML = html;
    prepareNetworkInertBindings(document.body);
    return document.body.innerHTML;
}
