import type { IntegrationDefinition } from "../../model";
import { route } from "../../api";
import { cloneIcon } from "../templates";

export function integrationIcon(definition: IntegrationDefinition | undefined): HTMLElement {
    const icon = document.createElement("span");
    icon.className = "integration-icon";
    const path = definition?.icon?.path;
    if (definition && path) {
        const image = document.createElement("img");
        image.src = integrationAssetUrl(definition, path);
        image.alt = "";
        image.decoding = "async";
        image.addEventListener("error", () => icon.replaceChildren(fallbackIcon()));
        icon.append(image);
    } else {
        icon.append(fallbackIcon());
    }
    return icon;
}

export function iconForResourceType(type: string): string {
    const normalized = type.toLowerCase();
    if (normalized === "dashboard") {
        return "table";
    }
    if (normalized === "source") {
        return "receipt";
    }
    if (normalized === "bloc") {
        return "grid";
    }
    if (normalized === "function") {
        return "spark";
    }
    if (normalized === "trigger") {
        return "share";
    }
    if (normalized === "secret") {
        return "key";
    }
    if (normalized === "connector") {
        return "truck";
    }
    return "grid";
}

function fallbackIcon(): Node {
    return cloneIcon("grid");
}

function integrationAssetUrl(definition: IntegrationDefinition, path: string): string {
    const params = new URLSearchParams({ kind: definition.kind, path });
    if (definition.version) {
        params.set("version", definition.version);
    }
    return route(`/api/integrations/asset?${params.toString()}`);
}
