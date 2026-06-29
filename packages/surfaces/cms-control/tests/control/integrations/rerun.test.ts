import { describe, expect, test } from "bun:test";
import postIntegrationImport from "cms-control/api/integrations/import.post";
import postIntegrationInstanceRerun from "cms-control/api/integrations/instances/rerun.post";
import { makeCms, postImport, postRerun } from "./helpers";

describe("POST /api/integrations/instances/rerun", () => {
    test("reruns a tracked integration instance with stored secrets", async () => {
        const { cms, sources } = makeCms();

        await postIntegrationImport(postImport({
            kind: "stripe",
            answers: { id: "stripe-main", apiKey: "sk_test" },
        }), cms);

        const res = await postIntegrationInstanceRerun(postRerun("stripe:stripe-main"), cms);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.artifacts).toEqual([{ type: "source", id: "urn:stripe-main", action: "updated" }]);
        expect(body.instance.runCount).toBe(2);
        expect((await sources.getSource("urn:stripe-main"))?.endpoints).toHaveLength(1);
        expect(JSON.stringify(body)).not.toContain("sk_test");
    });

    test("accepts rerun answer overrides", async () => {
        const { cms } = makeCms();

        await postIntegrationImport(postImport({
            kind: "stripe",
            answers: { id: "stripe-main", apiKey: "sk_old" },
        }), cms);

        const res = await postIntegrationInstanceRerun(postRerun("stripe:stripe-main", {
            answers: { apiKey: "sk_new" },
        }), cms);
        const body = await res.json();

        expect(body.instance.runCount).toBe(2);
        expect(JSON.stringify(body)).not.toContain("sk_new");
    });

    test("requires an instance id", async () => {
        const { cms } = makeCms();

        await expect(postIntegrationInstanceRerun(postRerun(), cms)).rejects.toThrow(/Missing param id/);
    });
});
