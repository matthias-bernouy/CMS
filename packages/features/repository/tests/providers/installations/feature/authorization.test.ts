import { expect, test } from "bun:test";
import { installationsFeature } from "@bernouy/repository/features/installations";
import { executeCapability } from "@bernouy/ulvia-sdk/provider";
import { context, services } from "./fixture";
const execute = (
    id: (typeof installationsFeature.capabilities)[number]["id"],
    input: unknown,
    ports = services(),
    actor = {},
) => executeCapability(installationsFeature, id, { input, services: ports, context: { ...context, ...actor } });
const denied = { code: "FORBIDDEN", output: { message: "The installation request was refused." } };
test("all eleven gateway control executors refuse untrusted actors before inspecting service ports", async () => {
    const examples = {
        "gateway.audit.append": { event: "{}" },
        "gateway.delegation.close": { context: { siteId: "site-a", ticket: "t", requestId: "req" } },
        "gateway.delegation.issue": {
            source: {
                siteId: "site-a",
                requestId: "req",
                installationId: "installation",
                contractId: "ulvia/cms.files",
                version: "1.0.0",
                digest: "sha256:" + "a".repeat(64),
                capabilityId: "files.get",
                actor: { kind: "anonymous" },
                deadline: 1,
            },
        },
        "gateway.invocation.issue": {
            requestId: "00000000-0000-4000-8000-000000000001",
            installationId: "installation",
            contractId: "ulvia/cms.files",
            contractVersion: "1.0.0",
            capabilityId: "files.get",
        },
        "gateway.dispatch.prepare": {
            invocation: {
                requestId: "00000000-0000-4000-8000-000000000001",
                installationId: "installation",
                contractId: "ulvia/cms.files",
                contractVersion: "1.0.0",
                capabilityId: "files.get",
            },
            actor: { kind: "anonymous" },
            deadline: 1,
        },
        "gateway.provider.prepare": {
            invocation: {
                requestId: "00000000-0000-4000-8000-000000000001",
                installationId: "installation",
                contractId: "ulvia/cms.files",
                contractVersion: "1.0.0",
                capabilityId: "files.get",
            },
            deadline: 1,
            token: "x".repeat(32),
        },
        "gateway.identity.resolve": { providerId: "ulvia/provider", subjectId: "subject" },
        "gateway.provider.resolve": { token: "x".repeat(32) },
        "gateway.provider.authorize": {
            sourceInstallationId: "source",
            targetInstallationId: "target",
            contractId: "ulvia/cms.files",
            capabilityId: "files.get",
            version: "1.0.0",
            sourceCredentialFingerprint: "a".repeat(64),
        },
        "gateway.delegation.check": {
            target: {
                siteId: "site-a",
                sourceInstallationId: "source",
                contractId: "ulvia/cms.files",
                capabilityId: "files.get",
                ticket: "t",
                sourceCredentialFingerprint: "a".repeat(64),
            },
        },
        "gateway.route.get": { contractId: "ulvia/cms.files" },
    } as const;
    expect(Object.keys(examples)).toHaveLength(11);
    for (const [id, input] of Object.entries(examples)) {
        const capability = installationsFeature.capabilities.find((capability) => capability.id === id)!;
        const parsed = capability.input.safeParse(input);
        expect(parsed.error?.message ?? id).toBe(id);
        await expect(execute(id as keyof typeof examples, input)).rejects.toMatchObject(denied);
    }
});
test("provider administration refuses system actors and unsigned source actors without touching domain services", async () => {
    let calls = 0;
    const ports = services({
        management: {
            administration: {
                catalogue: async () => {
                    calls++;
                    return [];
                },
            },
        },
    });
    for (const actor of [
        {},
        { subjectId: "admin", systemServiceId: "worker" },
        { subjectId: "admin", sourceInstallationId: "remote" },
    ]) {
        await expect(execute("list-available-providers", {}, ports, actor)).rejects.toMatchObject(denied);
    }
    expect(calls).toBe(0);
    expect(
        await execute("list-available-providers", {}, ports, {
            subjectId: "admin",
            sourceInstallationId: "remote",
            rootRequestId: "root",
        }),
    ).toEqual({ items: [] });
    expect(calls).toBe(1);
});
