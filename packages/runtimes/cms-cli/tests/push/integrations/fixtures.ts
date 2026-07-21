import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { LocalIntegration, LocalIntegrationImport } from "cms-cli/push/integrations/scan";
import type { PushState } from "cms-cli/push/shared/state";

export function makeSite(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "p9r-int-"));
    mkdirSync(join(root, "integrations"));
    for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(root, "integrations", name), content);
    }
    return root;
}

export const emptyState = (): PushState => ({
    tenant: "",
    lastPulled: "",
    entities: {},
});

export const localIntegration = (id: string, hash: string): LocalIntegration => ({
    id,
    slug: id.replace(/[^a-z0-9]+/gi, "-"),
    file: `integrations/${id.replace(/[^a-z0-9]+/gi, "-")}.json`,
    request: manualSourceImport("test"),
    hash,
});

const SOURCE_URL = "https://api.example.com/items";

const MANUAL_SOURCE_DEFINITION = {
    kind: "manual-source",
    label: "Manual source",
    inputs: [
        { name: "id", label: "Source id", type: "text", required: true },
        { name: "targetUrl", label: "Target URL", type: "url", required: true },
    ],
    artifacts: [
        {
            type: "source",
            source: {
                id: "{{answers.id}}",
                meta: { name: "Manual source" },
                endpoints: [
                    {
                        endpointId: "list",
                        method: "GET",
                        targetUrl: "{{answers.targetUrl}}",
                        params: [],
                    },
                ],
            },
        },
    ],
} satisfies NonNullable<LocalIntegrationImport["definition"]>;

export function manualSourceImport(id = "shop", targetUrl = SOURCE_URL): LocalIntegrationImport {
    return {
        kind: "manual-source",
        definition: MANUAL_SOURCE_DEFINITION,
        answers: { id, targetUrl },
    };
}

export function encode(value: string): string {
    return Buffer.from(value, "utf-8").toString("base64");
}

export async function withFetch(
    handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
    run: () => Promise<void>,
): Promise<void> {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
    try {
        await run();
    } finally {
        globalThis.fetch = originalFetch;
    }
}
