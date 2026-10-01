import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import { createOfficialProviderHandler } from "../src/http/handler";
import { FileSubmissionStore } from "../src/local-fs/FileSubmissionStore";

test("the official provider accepts canonical gateway paths and declared error envelopes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-official-provider-"));
    try {
        const contract = await admitContractReleaseJson(
            await readFile(resolve(import.meta.dir, "../../../resources/contracts/forms.submissions/definition.json")),
        );
        const report = {
            protocol: "ulvia-provider/v1",
            providerId: "ulvia.official",
            account: { id: "local-dev", label: "Local" },
            buildVersion: "test",
            manifest: { version: "0.1.0", digest: `sha256:${"0".repeat(64)}` },
            implementations: [],
        } as ProviderRuntimeReport;
        const handler = createOfficialProviderHandler({
            token: "test-token",
            report,
            forms: contract.release,
            submissions: new FileSubmissionStore(root),
        });
        const request = (path: string, init: RequestInit = {}) =>
            handler(
                new Request(`http://127.0.0.1${path}`, { ...init, headers: { authorization: "Bearer test-token" } }),
            );
        expect((await handler(new Request("http://127.0.0.1/v1/catalog/items"))).status).toBe(401);
        const created = await request("/v1/forms/submissions", {
            method: "POST",
            body: JSON.stringify({ email: "test@example.com", message: "Hello" }),
        });
        expect(created.status).toBe(201);
        const { id } = (await created.json()) as { id: string };
        const receipt = await request(`/v1/forms/submissions/${encodeURIComponent(JSON.stringify(id))}`);
        expect(receipt.status).toBe(200);
        expect(await receipt.json()).toEqual({ id, email: "test@example.com", message: "Hello" });
        const missing = await request(`/v1/catalog/items/${encodeURIComponent(JSON.stringify("missing"))}`);
        expect(missing.status).toBe(404);
        expect(await missing.json()).toEqual({ error: { code: "NOT_FOUND" } });
        const media = await request(`/v1/media/${encodeURIComponent(JSON.stringify("starter-mark"))}`);
        expect(media.status).toBe(200);
        expect(media.headers.get("content-type")).toBe("image/svg+xml");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
