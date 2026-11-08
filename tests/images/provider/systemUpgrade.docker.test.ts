import { expect, test } from "bun:test";
import { mcpContainers, docker, waitForHttp } from "../../integration/instance/containers";
import { repositoryApi } from "../../integration/instance/repository/client";

const baseline = process.env.ULVIA_UPGRADE_BASELINE_PROVIDER_IMAGE;
const candidate = process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE;
const edge = process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE;

test.skipIf(!baseline || !candidate || !edge)(
    "explicit system upgrade preserves old site data and enables bounded collection discovery",
    async () => {
        let stack: Awaited<ReturnType<typeof mcpContainers>> | undefined;
        try {
            stack = await mcpContainers(
                { provider: baseline!, edge: edge! },
                async () => undefined,
                undefined,
                undefined,
                true,
            );
            const site = repositoryApi(stack.cmsUrl);
            let session = await site.session(stack.administrator.email, stack.administrator.password);
            const pages = await (
                await site.request("ulvia/cms.content", "/pages/list", "QUERY", { limit: 100 }, session)
            ).json();
            expect(pages.items.length).toBeGreaterThan(0);
            const snapshots = await Promise.all(
                pages.items.map((page: { id: string }) =>
                    site
                        .request("ulvia/cms.content", "/pages/get", "QUERY", { id: page.id }, session)
                        .then((response) => response.json()),
                ),
            );
            const installed = await (
                await site.request(
                    "ulvia/cms.installations",
                    "/list-collection-installations",
                    "GET",
                    undefined,
                    session,
                )
            ).json();
            const inspected = JSON.parse((await docker(["inspect", stack.providerName])).stdout)[0];
            const token = inspected.Config.Env.find((value: string) =>
                value.startsWith("ULVIA_PROVIDER_OPERATOR_TOKEN="),
            )
                .split("=")
                .slice(1)
                .join("=");
            await stack.upgradeProvider(candidate!, "1.0.0");
            const administratorSub = session.accountId;
            session = await site.session(stack.administrator.email, stack.administrator.password);
            expect(session.accountId).toBe(administratorSub);
            const control = await stack.providerUrl();
            const operator = async (id: string, suffix = "", body?: unknown) => {
                const response = await fetch(`${control}/ulvia/operator/instances/${encodeURIComponent(id)}${suffix}`, {
                    method: body === undefined ? "GET" : "POST",
                    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
                    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                    signal: AbortSignal.timeout(120_000),
                });
                return { status: response.status, body: await response.json() };
            };
            const before = await operator(stack.instanceId);
            const manifest = await docker(
                [
                    "exec",
                    stack.providerName,
                    "bun",
                    "--no-macros",
                    "-e",
                    'const {SystemBootstrap}=await import("./packages/runtimes/ulvia-provider-server/src/runtime/instances/system/execution/SystemBootstrap.ts");const {bundledBootstrapSources}=await import("./packages/runtimes/ulvia-provider-server/src/runtime/instances/system/bootstrap.ts");console.log(JSON.stringify(await new SystemBootstrap(bundledBootstrapSources()).available()))',
                ],
                true,
            );
            expect(manifest.code, manifest.stderr).toBe(0);
            const plan = JSON.parse(manifest.stdout.trim());
            const input = {
                expectedRevision: before.body.revision,
                administratorSub: session.accountId,
                manifestDigest: plan.manifest.digest,
            };
            const refused = await operator(stack.instanceId, "/system/plan", {
                ...input,
                administratorSub: "local:foreign",
            });
            expect(refused.status).toBe(403);
            expect((await operator(stack.instanceId)).body).toEqual(before.body);
            const review = await operator(stack.instanceId, "/system/plan", input);
            expect(review.status, JSON.stringify(review.body)).toBe(200);
            expect(review.body.source.manifest.version).toBe("1.0.0");
            expect(review.body.target.manifest.version).toBe("1.3.0");
            expect(
                review.body.target.contracts.some(
                    (pin: { contractId: string }) => pin.contractId === "ulvia/repository",
                ),
            ).toBe(false);
            const tampered = await operator(stack.instanceId, "/system", {
                ...input,
                planDigest: `sha256:${"0".repeat(64)}`,
            });
            expect(tampered.status).toBe(400);
            expect((await operator(stack.instanceId)).body).toEqual(before.body);
            const applied = await operator(stack.instanceId, "/system", {
                ...input,
                planDigest: review.body.planDigest,
            });
            expect(applied.status, JSON.stringify(applied.body)).toBe(200);
            expect(applied.body.status).toBe("ready");
            expect(applied.body.repository).toEqual(before.body.repository);
            await docker(["restart", stack.edgeName]);
            await waitForHttp(`${stack.cmsUrl}/readyz`);
            const catalogue = await site.request(
                "ulvia/cms.installations",
                "/collections/catalogue",
                "QUERY",
                { limit: 1 },
                session,
            );
            // The test has no remote Repository, so the bounded route must exist even when discovery fails.
            expect(catalogue.status).toBe(503);
            expect(
                await (
                    await site.request(
                        "ulvia/cms.installations",
                        "/list-collection-installations",
                        "GET",
                        undefined,
                        session,
                    )
                ).json(),
            ).toEqual(installed);
            expect(
                await (await site.request("ulvia/cms.content", "/pages/list", "QUERY", { limit: 100 }, session)).json(),
            ).toEqual(pages);
            expect(
                await Promise.all(
                    pages.items.map((page: { id: string }) =>
                        site
                            .request("ulvia/cms.content", "/pages/get", "QUERY", { id: page.id }, session)
                            .then((response) => response.json()),
                    ),
                ),
            ).toEqual(snapshots);
            await stack.restartProvider();
            expect((await operator(stack.instanceId)).body.systemPlan).toEqual(review.body.target);
            const registry = repositoryApi(stack.repositoryUrl);
            const registrySession = await registry.session(
                stack.repository.administrator.email,
                stack.repository.administrator.password,
            );
            const identity = await (await registry.request("ulvia/repository", "/v1/info")).json();
            const claim = await registry.request(
                "ulvia/repository",
                "/v1/namespace-actions/claim",
                "POST",
                { namespace: "upgrade-proof" },
                stack.repository.pat,
            );
            expect(claim.status).toBe(200);
            const inventory = await (
                await registry.request("ulvia/repository", "/v1/namespaces", "GET", undefined, stack.repository.pat)
            ).json();
            const registryId = stack.repository.instance.instance.id;
            const registryBefore = await operator(registryId);
            const registryInput = {
                ...input,
                expectedRevision: registryBefore.body.revision,
                administratorSub: registrySession.accountId,
            };
            const registryReview = await operator(registryId, "/system/plan", registryInput);
            expect(registryReview.status, JSON.stringify(registryReview.body)).toBe(200);
            expect(
                registryReview.body.target.contracts.find(
                    (pin: { contractId: string }) => pin.contractId === "ulvia/repository",
                ).version,
            ).toBe("1.1.0");
            const registryApplied = await operator(registryId, "/system", {
                ...registryInput,
                planDigest: registryReview.body.planDigest,
            });
            expect(registryApplied.status, JSON.stringify(registryApplied.body)).toBe(200);
            await docker(["restart", stack.repository.name]);
            await waitForHttp(`${stack.repositoryUrl}/readyz`);
            expect(await (await registry.request("ulvia/repository", "/v1/info")).json()).toEqual(identity);
            expect(
                await (
                    await registry.request("ulvia/repository", "/v1/namespaces", "GET", undefined, stack.repository.pat)
                ).json(),
            ).toEqual(inventory);
        } catch (error) {
            throw new Error(`${String(error)}\n${await stack?.diagnostics()}`);
        } finally {
            await stack?.close();
        }
    },
    300_000,
);
