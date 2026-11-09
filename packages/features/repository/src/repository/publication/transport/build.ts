import { randomUUID } from "node:crypto";
import type { RepositoryConnection } from "./connection";
import { RepositoryRequestError } from "../../core/errors";
import { RepositoryHttpError } from "repository/repository-http/errors";
import { publicationBuildStatusOutputSchema } from "repository/application/registry/schemas/publications/builds";

/** Each request is short. The host's durable operation continues across client disconnects. */
export async function publishSourceBuild(
    connection: RepositoryConnection,
    input: { namespace: string; namespaceRevision: number; uploadId: string },
) {
    const receipt = await connection.readJson(
        await connection.request(
            "v1/uploads/build",
            {
                method: "POST",
                body: JSON.stringify(input),
                headers: {
                    "content-type": "application/json",
                    "idempotency-key": `collection-build:${input.uploadId}:${randomUUID()}`,
                },
            },
            true,
        ),
    );
    const operationId = (receipt as { operationId?: unknown })?.operationId;
    if (typeof operationId !== "string" || !/^[a-f0-9-]{36}$/u.test(operationId)) {
        throw new Error("Repository returned an invalid build operation receipt");
    }
    const deadline = Date.now() + 15 * 60_000;
    for (;;) {
        const operation = publicationBuildStatusOutputSchema.parse(
            await connection.json("v1/uploads/build-status", "QUERY", { ...input, operationId }, true),
        );
        if (operation.operationId !== operationId) {
            throw new Error("Repository build operation identity changed");
        }
        if (operation.status === "succeeded" && operation.result) {
            return operation.result;
        }
        if (operation.status === "failed") {
            if (!["REJECTED", "NOT_FOUND", "ACTOR_UNAVAILABLE"].includes(operation.errorCode ?? "")) {
                throw new RepositoryHttpError(503);
            }
            if (operation.errorOutput) {
                await connection.readJson(
                    Response.json({ error: { code: "REJECTED", output: operation.errorOutput } }, { status: 409 }),
                );
            }
            throw new RepositoryRequestError(
                "REJECTED",
                `Repository build failed (${operation.errorCode ?? "unknown"})`,
            );
        }
        if (Date.now() >= deadline) {
            throw new Error(`Repository build ${operationId} is still pending; retry the exact publication to resume`);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
}
