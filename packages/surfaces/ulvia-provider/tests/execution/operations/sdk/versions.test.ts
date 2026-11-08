import { expect, test } from "bun:test";
import { operationFixture } from "./fixture";
import { contractId } from "./feature";

test("one durable worker registration routes multiple exact versions without duplicate host registration", async () => {
    const f = await operationFixture({ versions: ["1.0.0", "2.0.0"] });
    try {
        expect(f.registrations).toHaveLength(1);
        expect(f.registrations[0]!.versions.map(({ version }) => version)).toEqual(["1.0.0", "2.0.0"]);
        const ids: string[] = [];
        for (const version of ["1.0.0", "2.0.0"]) {
            const response = await f.call({ version });
            expect(response.status).toBe(202);
            ids.push((await response.json()).operationId);
        }
        expect(ids[0]).not.toBe(ids[1]);
        f.store.held = false;
        await f.executor.recover();
        for (const [index, version] of ["1.0.0", "2.0.0"].entries()) {
            expect((await f.store.get("site-a", ids[index]!))?.result).toEqual({ marker: version });
        }
    } finally {
        await f.executor.stop();
    }
});

test("durable inherited routes retain their requested parent version instead of adopting the concrete release", async () => {
    const f = await operationFixture({ inherited: true });
    try {
        expect(f.registrations.map(({ contractId }) => contractId).sort()).toEqual(
            [contractId, "example/specialized-jobs"].sort(),
        );
        const response = await f.call();
        expect(response.status).toBe(202);
        const { operationId } = await response.json();
        const record = (await f.store.get("site-a", operationId))!;
        expect(record.contractId).toBe(contractId);
        expect(record.context.contractVersion).toBe("1.0.0");
        f.store.held = false;
        await f.executor.recover();
        expect((await f.store.get("site-a", operationId))?.result).toEqual({ marker: "1.0.0" });
        f.store.held = true;
        f.control.fail = true;
        const failedResponse = await f.call({
            key: "inherited-failure",
            path: "/review/jobs",
            headers: { "accept-language": "fr" },
        });
        expect(failedResponse.status).toBe(202);
        const failedId = (await failedResponse.json()).operationId;
        f.store.held = false;
        await f.executor.recover();
        const failed = (await f.store.get("site-a", failedId))!;
        expect(failed.status).toBe("failed");
        expect(failed.errorCode).toBe("REFUSED");
        expect(failed.errorContentLanguage).toBe("fr");
        expect(f.presentations).toEqual([422]);
    } finally {
        await f.executor.stop();
    }
});
