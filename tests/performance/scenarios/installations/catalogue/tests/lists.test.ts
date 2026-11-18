import { expect, test } from "bun:test";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { catalogueContract } from "../resources/contract";
import { catalogueProvider } from "../resources/provider";
import { availableProviderOracle, installedProviderOracle } from "../lists/oracle";
import type { FixtureConnection } from "../state/seed";

/** Admitted metadata and known writer receipts form the oracle; no list response is reused as expected data. */
test("Provider list oracles require every known approval, immutable catalogue coordinate, selected route and no private fields", async () => {
    const releases = new InMemoryReleaseCatalogue();
    const contract = await catalogueContract("performance-lists", 0, false);
    await releases.publish(contract.admission);
    const providers = await Promise.all(
        [0, 1].map((index) => catalogueProvider("performance-lists", index, 0, [contract], releases)),
    );
    const observedAt = new Date().toISOString();
    const connections: FixtureConnection[] = providers.map((resource, index) => ({
        id: `owned-${index}`,
        accountId: `account-${index}`,
        providerId: resource.id,
        instanceId: `instance:00000000-0000-4000-8000-00000000000${index}`,
        revision: 2,
        status: "enabled",
        manifestVersion: resource.version,
        observedAt,
    }));
    const selection = {
        contractId: contract.id,
        version: contract.version,
        digest: contract.digest,
        installationId: connections[0]!.id,
    };
    const state = {
        repositoryId: "owned-registry",
        resources: { providers },
        connections: {
            baseline: [],
            rows: new Map(connections.map((row, index) => [index, row])),
            revision: 3,
            selections: [selection],
        },
    };
    const catalogue = {
        items: providers.map((resource) => ({
            repositoryId: state.repositoryId,
            publisherId: resource.namespace,
            id: resource.id,
            version: resource.version,
            digest: resource.digest,
            name: resource.name,
        })),
    };
    const available = availableProviderOracle(state);
    expect(() => available(catalogue)).not.toThrow();
    expect(() => available({ items: catalogue.items.slice(1) })).toThrow();
    expect(() => available({ items: [catalogue.items[0], catalogue.items[0]] })).toThrow();
    expect(() => available({ items: [{ ...catalogue.items[0], name: "Wrong" }, catalogue.items[1]] })).toThrow();
    const installations = connections.map(({ instanceId: _instance, ...row }, index) => ({
        ...row,
        endpoint: "http://ulvia-provider:5103",
        selectionCount: index === 0 ? 1 : 0,
    }));
    const routes = [
        {
            contractId: contract.id,
            selectedInstallationId: selection.installationId,
            selectedDigest: contract.digest,
            options: connections.map((row) => ({
                providerId: row.providerId,
                accountId: row.accountId,
                status: "ready",
                selection: { ...selection, installationId: row.id },
            })),
        },
    ];
    const output = { selectionRevision: 3, installations, selections: [selection], routes };
    const installed = installedProviderOracle(state);
    expect(() => installed(output)).not.toThrow();
    for (const invalid of [
        { ...output, installations: installations.slice(1) },
        { ...output, installations: [{ ...installations[0], providerTokenRef: "private" }, installations[1]] },
        { ...output, installations: [{ ...installations[0], revision: 3 }, installations[1]] },
        { ...output, selectionRevision: 2 },
        { ...output, routes: [] },
        { ...output, routes: [{ ...routes[0], options: routes[0]!.options.slice(1) }] },
        { ...output, routes: [{ ...routes[0], selectedInstallationId: "foreign" }] },
    ]) {
        expect(() => installed(invalid)).toThrow();
    }
});
