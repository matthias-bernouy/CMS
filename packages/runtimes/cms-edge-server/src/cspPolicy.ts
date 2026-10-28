import type { CspExtras } from "@bernouy/http-runner";
const FIELDS = {
    connect: "connectExtras",
    media: "mediaExtras",
    script: "scriptExtras",
    style: "styleExtras",
    frame: "frameExtras",
} as const;
export function parseCspPolicy(value: string | undefined): CspExtras {
    const result: CspExtras = { connectExtras: [], mediaExtras: [] };
    if (!value) {
        return result;
    }
    if (value.length > 16384) {
        throw new TypeError("CMS_CSP_ALLOWED_ORIGINS is too large");
    }
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError("Invalid CMS_CSP_ALLOWED_ORIGINS");
    }
    for (const [name, origins] of Object.entries(parsed)) {
        if (!Object.hasOwn(FIELDS, name) || !Array.isArray(origins) || origins.length > 32) {
            throw new TypeError("Invalid CSP origin list");
        }
        const key = FIELDS[name as keyof typeof FIELDS];
        result[key] = [
            ...new Set(
                origins.map((origin: unknown) => {
                    if (typeof origin !== "string" || origin.length > 512) {
                        throw new TypeError("Invalid CSP origin");
                    }
                    const url = new URL(origin);
                    if (!["https:", "http:"].includes(url.protocol) || url.origin !== origin) {
                        throw new TypeError("CSP entries must be exact HTTP origins");
                    }
                    return origin;
                }),
            ),
        ];
    }
    return result;
}
