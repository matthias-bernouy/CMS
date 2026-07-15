import { IntegrationInputError, MissingIntegrationParam } from "../errors";
import type { IntegrationIcon } from "../../interfaces/Integration";
import { isRecord, text } from "./values";

export function parseIntegrationIcon(value: unknown, name = "definition.icon"): IntegrationIcon | undefined {
    if (value === undefined || value === null) return undefined;
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");

    const path = text(value.path);
    if (!path) throw new MissingIntegrationParam(`${name}.path`);

    return { path };
}

export function parseArtifactIcon(value: unknown, name: string): string | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const icon = text(value);
    if (icon) {
        if (icon.startsWith("assets/") || icon.startsWith("assets\\")) assertSvgAssetPath(icon, name);
        return icon;
    }
    if (isRecord(value)) {
        const path = parseIntegrationIcon(value, name)?.path;
        if (path) assertSvgAssetPath(path, `${name}.path`);
        return path;
    }
    throw new IntegrationInputError(name, "must be a string or an object");
}

function assertSvgAssetPath(path: string, name: string): void {
    const segments = path.split("/");
    if (
        !path.startsWith("assets/") ||
        !path.toLowerCase().endsWith(".svg") ||
        path.includes("\\") ||
        segments.some(segment => segment === "" || segment === "." || segment === "..")
    ) {
        throw new IntegrationInputError(name, "must reference an SVG inside assets/");
    }
}
