import { expect, test } from "bun:test";
import { repositoryApplication } from "../../../../../../../tests/fixtures/repository/application";
import { recipeFixture } from "./fixture";

test("the admitted public recipe QUERY exposes only indexed summaries and rejects foreign-locale cursors", async () => {
    const f = await recipeFixture();
    const artifact = await f.add();
    await f.add("1.0.0", true, "other");
    const app = repositoryApplication(f.root);
    const query = (body: unknown) =>
        app.handle(
            new Request("https://repository.example/.cms/call/ulvia/repository/v1/recipes", {
                method: "QUERY",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            }),
        );
    try {
        const first = await query({ limit: 1, locale: "fr" });
        expect(first.status).toBe(200);
        const result = await first.json();
        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toMatchObject({ label: "Administration française", root: { digest: artifact.digest } });
        expect(JSON.stringify(result)).not.toContain("markup");
        const stale = await query({ limit: 1, locale: "en", cursor: result.cursor });
        expect(stale.status).toBe(409);
        const invalid = await query({ limit: 1, instanceId: "another-instance" });
        expect(invalid.ok).toBe(false);
    } finally {
        await app.close();
    }
});
