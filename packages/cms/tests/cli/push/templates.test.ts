import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import { scanTemplates } from "src/cli/push/templates/scan";
import { classifyTemplates } from "src/cli/push/templates/classify";
import type { LocalTemplate } from "src/cli/push/templates/scan";
import type { PushState } from "src/cli/push/shared/state";

function makeSite(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "p9r-test-"));
    mkdirSync(join(root, "templates"));
    for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(root, "templates", name), content);
    }
    return root;
}

function template(identifier: string, hash: string): LocalTemplate {
    return {
        identifier,
        file:    `templates${sep}${identifier}.html`,
        meta:    { name: identifier, description: "", category: "" },
        content: "",
        hash,
    };
}

const emptyState = (): PushState => ({ tenant: "", lastPulled: "", entities: {} });

describe("scanTemplates", () => {
    test("derives identifier from filename and parses frontmatter", async () => {
        const dir = makeSite({
            "step-section-3.html": `---
name: "Section 3 étapes"
description: "Trio of cards"
category: "Sections"
---
<cs-step-section></cs-step-section>`,
        });
        const templates = await scanTemplates(dir);
        expect(templates).toHaveLength(1);
        expect(templates[0]?.identifier).toBe("step-section-3");
        expect(templates[0]?.meta.name).toBe("Section 3 étapes");
        expect(templates[0]?.meta.category).toBe("Sections");
    });
});

describe("classifyTemplates", () => {
    test("matches by identifier even when remote id is opaque", async () => {
        const out = await classifyTemplates(
            [template("hero-v1", "loc")],
            [{ id: "uuid-123", identifier: "hero-v1" }],
            emptyState(),
            async () => "loc",   // remote returns same hash
            false,
        );
        expect(out[0]?.status).toBe("unchanged");
        expect(out[0]?.remoteId).toBe("uuid-123");
    });

    test("--force overrides conflict", async () => {
        const state: PushState = {
            tenant: "", lastPulled: "",
            entities: { "template:hero-v1": { hash: "old", lastSeenRemote: "old" } },
        };
        const out = await classifyTemplates(
            [template("hero-v1", "loc")],
            [{ id: "u", identifier: "hero-v1" }],
            state,
            async () => "drifted",
            true,
        );
        expect(out[0]?.status).toBe("update");
    });
});
