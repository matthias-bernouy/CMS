import { resourceName } from "@bernouy/cms-repository/contracts/protocol";
import { resolve } from "node:path";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { resolveFixtureContract } from "../../ulviaProviderFixture";

export const bootstrap = resolve(import.meta.dir, "../../../../../runtimes/ulvia-cli/dist/bootstrap");
export async function officialContract(id: string) {
    return admitContractReleaseJson(
        await Bun.file(resolve(bootstrap, "contracts/cms", resourceName(id), "definition.json")).text(),
    );
}
export async function resolvedContract(id: string) {
    return resolveFixtureContract(await officialContract(id));
}
export const context = (language = "en", contractVersion = "1.0.0") => ({
    requestId: crypto.randomUUID(),
    contractVersion,
    siteId: "default",
    providerId: "ulvia/primary-provider",
    http: { headers: new Headers({ "accept-language": language }) },
});

export async function invokeHttp(
    contract: Awaited<ReturnType<typeof resolvedContract>>,
    dispatcher: DefaultProviderCapabilityDispatcher,
    capabilityId: string,
    input: unknown,
    language = "fr",
    logger: Logger = NOOP_LOGGER,
) {
    const routes = compileProviderRoutes([contract]);
    const route = routes.find((item) => item.capability.id === capabilityId)!;
    const requestId = crypto.randomUUID();
    const relay = createProviderContractRelay(
        routes,
        dispatcher,
        { siteId: "default", providerId: "ulvia/primary-provider" },
        logger,
    );
    return (await relay(
        new Request(`https://provider.test${route.capability.binding.path}`, {
            method: route.capability.binding.method,
            headers: {
                "content-type": "application/json",
                "x-ulvia-request-id": requestId,
                "accept-language": language,
                ...(route.capability.behavior.effect === "command" && route.capability.behavior.idempotency === "keyed"
                    ? { "idempotency-key": "example--test--request" }
                    : {}),
            },
            body: JSON.stringify(input),
        }),
        {
            version: 1,
            requestId,
            instanceId: "instance-a",
            contractId: contract.release.contractId,
            contractVersion: contract.release.version,
            capabilityId,
            issuedAt: 0,
            expiresAt: 9999999999,
        },
    ))!;
}

import { NOOP_LOGGER } from "@bernouy/logging";
import type { Logger } from "@bernouy/logging";
import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import type { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { createProviderContractRelay } from "../../../src/transport/relay";
