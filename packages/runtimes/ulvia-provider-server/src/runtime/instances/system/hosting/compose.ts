import { HostedTransport } from "./transport/HostedTransport";
import { RoutingAuthority } from "@bernouy/hosting/routing";
import { createHmac } from "node:crypto";
import { Resolver } from "node:dns/promises";
import {
    ControlAuthority,
    ControlBootstrap,
    DomainAdmissionPolicy,
    DomainRegistry,
    InstanceManagement,
    ZoneRegistry,
} from "@bernouy/hosting";
import { MongoHostingStore, MongoHostingZoneStore } from "@bernouy/hosting/mongo";
import { ProviderInstanceLifecycle } from "@bernouy/hosting/instances";
import type { HostingServices } from "@bernouy/hosting/feature";
import type { Db } from "mongodb";
import type { Logger } from "@bernouy/logging";
import { composeTlsDelivery } from "./tls/compose";
import type {
    OfficialInstanceProvisioner,
    ProviderInstanceCredentials,
    ProviderInstanceRegistry,
} from "@bernouy/hosting/instances";
import type { ProviderInstanceHost } from "../../composition/ProviderInstanceHost";
import type { SystemBootstrap } from "../execution/SystemBootstrap";
import type { readHostingConfiguration } from "./configuration";
import { readControlAdministrator } from "./configuration";
import { isPristineHostingDatabase } from "./pristine";

type HostingConfiguration = ReturnType<typeof readHostingConfiguration>;
export async function composeHosting(options: {
    db: Db;
    host: ProviderInstanceHost;
    instances: ProviderInstanceRegistry;
    credentials: ProviderInstanceCredentials;
    provisioner: OfficialInstanceProvisioner;
    system: SystemBootstrap;
    idempotencySecret: string;
    lifecycle: ProviderInstanceLifecycle;
    configuration: HostingConfiguration;
    logger: Logger;
    resourceRevision: (storageKey: string) => Promise<string>;
}) {
    const { db, host, instances, credentials, provisioner, system, lifecycle, configuration } = options;
    const store = new MongoHostingStore(db);
    await store.init();
    const zoneStore = new MongoHostingZoneStore(db);
    await zoneStore.init();
    if (configuration.proxyUrl) {
        host.transport = new HostedTransport(configuration.proxyUrl, store, { getInstance: (id) => instances.get(id) });
    }
    const authority = new ControlAuthority(store, (id, subject) => host.isCurrentAdministrator(id, subject));
    const proofSecret = createHmac("sha256", options.idempotencySecret)
        .update("ulvia-hosting-domain-proof/v1")
        .digest("base64url");
    const zones = new ZoneRegistry(zoneStore, authority, proofSecret, verifyTxt);
    const admission = new DomainAdmissionPolicy(configuration.managedSuffixes, configuration.localDevelopment, zones);
    const domains = new DomainRegistry(
        store,
        { getInstance: (id) => instances.get(id) },
        authority,
        proofSecret,
        verifyTxt,
        admission,
    );
    const controlLifecycle = new ProviderInstanceLifecycle(
        instances,
        credentials,
        provisioner,
        { current: () => system.control() },
        options.idempotencySecret,
    );
    const bootstrap = new ControlBootstrap(
        store,
        store,
        instances,
        controlLifecycle,
        credentials,
        provisioner,
        domains,
        () => isPristineHostingDatabase(db),
    );
    const services: HostingServices["hosting"] = {
        authority,
        domains,
        zones,
        instances: new InstanceManagement(lifecycle, store, store, authority, admission, proofSecret),
    };
    const delivery = await composeTlsDelivery(
        store,
        { getInstance: (id) => instances.get(id) },
        domains,
        configuration.tls,
        options.logger,
    );
    return {
        store,
        domains,
        delivery,
        routing: new RoutingAuthority(
            domains,
            createHmac("sha256", options.idempotencySecret).update("ulvia-edge-control-signing/v1").digest("base64url"),
            async (instanceId) => {
                const instance = await instances.get(instanceId);
                if (!instance || instance.status !== "ready") {
                    throw new Error("The resource revision requires a ready hosting instance");
                }
                return options.resourceRevision(instance.storageKey);
            },
        ),
        services,
        initialize: async () => {
            const current = await store.readInstallation();
            const administrator =
                current?.phase === "ready" ? undefined : await readControlAdministrator(configuration.bootstrapFile);
            const deadline = Date.now() + 120_000;
            for (;;) {
                const result = await bootstrap.initialize(configuration.origin, administrator);
                if (result.installation.phase === "ready") {
                    return result;
                }
                if (Date.now() >= deadline) {
                    throw new Error("Control provisioning is still pending; restart to resume its durable transition");
                }
                await Bun.sleep(250);
            }
        },
    };
}

async function verifyTxt(name: string, value: string) {
    const resolver = new Resolver({ timeout: 2000, tries: 2 });
    const timeout = setTimeout(() => resolver.cancel(), 5000);
    try {
        return (await resolver.resolveTxt(name)).some((chunks) => chunks.join("") === value);
    } catch (error) {
        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            ["ENODATA", "ENOTFOUND"].includes(String(error.code))
        ) {
            return false;
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
