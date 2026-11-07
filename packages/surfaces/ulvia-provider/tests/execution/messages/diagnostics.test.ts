import { expect, test } from "bun:test";
import { createMemoryLogger } from "@bernouy/logging/testing";
import { mountContentForTest } from "../../capabilities/content/mount";
import {
    DefaultProviderCapabilityDispatcher,
    MemoryProviderOperationStore,
    ProviderOperationExecutor,
    ProviderCapabilityDispatchError,
} from "@bernouy/ulvia-provider";
import { officialFailure } from "../../../src/dispatch/errors/failure";
import { context, invokeHttp, resolvedContract } from "./fixtures";

test("HTTP refusals log stable reasons once without request fields, parameters or translated output", async () => {
    const contract = await resolvedContract("ulvia/cms.content");
    const memory = createMemoryLogger({ service: "provider" });
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    let writes = 0;
    await mountContentForTest(dispatcher, {
        repo: {
            insertPage: async () => {
                writes++;
            },
        },
    } as never);
    await Promise.all(
        ["fr", "en"].map(async (language) => {
            const response = await invokeHttp(
                contract,
                dispatcher,
                "pages.create",
                { title: "   ", path: "/private-path" },
                language,
                memory.logger,
            );
            expect(response.status).toBe(422);
            expect(await response.json()).toHaveProperty("error.output.message");
        }),
    );
    const records = memory.records.filter((record) => record.event === "provider.capability.rejected");
    expect(records).toHaveLength(2);
    for (const record of records) {
        expect(record.attributes).toMatchObject({
            errorCode: "INVALID_PAGE",
            reason: "page.title_empty",
            capabilityId: "pages.create",
        });
        expect(record.attributes?.invocationId).toBeString();
    }
    expect(JSON.stringify(records)).not.toContain("private-path");
    expect(JSON.stringify(records)).not.toContain("message");
    expect(writes).toBe(0);
});

test("reason metadata survives localization and async schema projection without persisting diagnostic parameters", async () => {
    const contract = await resolvedContract("ulvia/cms.installations");
    const store = new MemoryProviderOperationStore();
    const observations: unknown[] = [];
    const executor = new ProviderOperationExecutor(store, undefined, {
        contracts: [contract],
        onFailure: (observation) => {
            observations.push(observation);
        },
    });
    executor.register("ulvia/cms.installations", "apply-collection-upgrade", async () => {
        throw officialFailure("REVISION_CONFLICT", 409, undefined, {
            code: "connection.changed",
            parameters: { secret: "private-parameter" },
        });
    });
    const operation = await executor.enqueue(
        "ulvia/cms.installations",
        "apply-collection-upgrade",
        {},
        { ...context("fr", contract.release.version), idempotencyKey: "reason" },
    );
    await executor.stop();
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
        reason: "connection.changed",
        errorCode: "REVISION_CONFLICT",
        kind: "handler-rejected",
    });
    expect(JSON.stringify(observations)).not.toContain("private-parameter");
    const record = await store.get("default", operation.operationId);
    expect(record).toMatchObject({ status: "failed", errorCode: "REVISION_CONFLICT" });
    expect(JSON.stringify(record)).not.toContain("private-parameter");
    expect(record?.errorOutput).not.toHaveProperty("reason");
});

test("unknown business reasons and malformed SDK diagnostic identifiers cannot enter the reason tag", () => {
    const source = Object.assign(new Error("private diagnostic"), {
        issue: { code: "secret.value", parameters: { token: "private" } },
    });
    expect(officialFailure("INVALID_INPUT", 422, source).reason).toBeUndefined();
    for (const reason of ["secret\nvalue", "x".repeat(129), "Bearer secret"]) {
        expect(
            new ProviderCapabilityDispatchError("INVALID_INPUT", 422, undefined, {}, undefined, reason).reason,
        ).toBeUndefined();
    }
});
