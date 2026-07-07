import type { IntegrationDefinition } from "../../model";
import { fillIcon } from "../templates";

export function integrationIcon(definition: IntegrationDefinition | undefined, fallback: string): HTMLElement {
    const icon = document.createElement("span");
    icon.className = "integration-icon";
    icon.dataset.tone = toneFor(definition);
    icon.append(svgFor(definition?.kind ?? fallback));
    return icon;
}

export function iconForResourceType(type: string): string {
    const normalized = type.toLowerCase();
    if (normalized === "dashboard") return "table";
    if (normalized === "source") return "receipt";
    if (normalized === "bloc") return "grid";
    if (normalized === "function") return "spark";
    if (normalized === "secret") return "key";
    if (normalized === "connector") return "truck";
    return "grid";
}

function svgFor(kind: string): Node {
    const icons: Record<string, string> = {
        orders: "receipt",
        products: "cube",
        offers: "tag",
        newsletter: "mail",
        "user-account": "user",
        "stripe-connect": "card",
        "mondial-relay": "truck",
        ban: "pin",
    };
    const host = document.createElement("span");
    fillIcon(host, ":scope", icons[kind] ?? "grid");
    return host.firstChild ?? document.createTextNode("");
}

function toneFor(definition: IntegrationDefinition | undefined): string {
    const category = (definition?.category ?? "").toLowerCase();
    if (["commerce", "payments", "delivery", "users", "marketing", "data", "blocks"].includes(category)) return category;
    return "default";
}
