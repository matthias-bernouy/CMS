import { Buffer } from "node:buffer";

export function decodeDefaultContent(source: Record<string, string> | undefined): string | undefined {
    if (!source) {
        return undefined;
    }
    const manifestRaw = source["manifest.json"];
    if (!manifestRaw) {
        return undefined;
    }
    const manifest = JSON.parse(Buffer.from(manifestRaw, "base64").toString("utf-8")) as { defaultContent?: string };
    if (!manifest.defaultContent) {
        return undefined;
    }
    const path = manifest.defaultContent.replace(/^\.\//, "");
    const encoded = source[path];
    return encoded ? Buffer.from(encoded, "base64").toString("utf-8") : undefined;
}

export function decodeSource(value: string | undefined): string {
    return value ? Buffer.from(value, "base64").toString("utf-8") : "";
}
