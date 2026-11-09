import { ProviderIdentityAliases } from "@bernouy/cms-gateway/identity";
import { MongoIdentityService } from "@bernouy/cms-gateway/identity/mongo";
import { MongoAdministratorGrantStore } from "@bernouy/cms-gateway/access/mongo";
import { MongoCollectionStorage, MongoInitializationStateStore } from "@bernouy/repository/collections/mongo";
import { instanceDatabaseName } from "../../../src/runtime/stores/storageRoots";
import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { hostingRuntimeFixture } from "../runtime-fixture";

const mongoUrl = process.env.ULVIA_HOSTING_MONGO_URL;
const integration = mongoUrl ? test : test.skip;

integration(
    "real Provider composition provisions empty Control from the exact admitted plan and reopens without its bootstrap file",
    async () => {
        const f = await hostingRuntimeFixture(mongoUrl!);
        try {
            const control = await f.hosting.initialize();
            expect(control.installation.phase).toBe("ready");
            expect(control.instance.status).toBe("ready");
            expect(control.instance.systemPlan?.contracts.some((pin) => pin.contractId === "ulvia/cms.hosting")).toBe(
                true,
            );
            expect(await f.credentials.readAdministrator(control.instance.id)).toBeNull();
            expect(await f.hosting.domains.resolve("control.localhost")).toMatchObject({
                instanceId: control.instance.id,
                origin: "http://control.localhost",
            });
            const runtime = await f.host.runtime(control.instance);
            try {
                expect(
                    runtime.resource.report.implementations.some(
                        (pin) => pin.contractId === "ulvia/cms.hosting" && pin.status === "ready",
                    ),
                ).toBe(true);
                expect(
                    runtime.resource.contracts.some((contract) => contract.release.contractId === "ulvia/cms.hosting"),
                ).toBe(true);
            } finally {
                runtime.release();
            }
            await rm(f.bootstrapFile);
            const reopened = await f.hosting.initialize();
            expect(reopened).toEqual(control);
            expect((await f.instances.list()).map((instance) => instance.id)).toEqual([control.instance.id]);
            const controlDb = f.client.db(instanceDatabaseName(control.instance.storageKey));
            const [sub] = await new MongoAdministratorGrantStore(controlDb).list();
            const alias = await new ProviderIdentityAliases(new MongoIdentityService(controlDb)).getOrCreate(
                { providerId: control.instance.systemPlan!.manifest.providerId },
                sub!,
            );
            const actor = { instanceId: control.instance.id, subjectId: alias };
            const sites = [];
            for (const name of ["one", "two"]) {
                const created = await f.hosting.services.instances.create(actor, {
                    requestId: crypto.randomUUID(),
                    label: name,
                    origin: `http://${name}.localhost`,
                    administrator: { email: `${name}@example.test`, password: "isolated-site-password" },
                });
                expect(created.instance.status).toBe("ready");
                expect(await f.hosting.domains.resolve(`${name}.localhost`)).toMatchObject({
                    instanceId: created.instance.id,
                });
                const record = (await f.instances.get(created.instance.id))!;
                expect(record.creationAuthority).toEqual({ kind: "control", actor });
                expect(record.systemPlan?.contracts.some((pin) => pin.contractId === "ulvia/cms.hosting")).toBe(false);
                sites.push(record);
            }
            for (const record of [control.instance, ...sites]) {
                const db = f.client.db(instanceDatabaseName(record.storageKey));
                expect((await new MongoCollectionStorage(db).readSite("default")).installations).toEqual([]);
                expect((await new MongoInitializationStateStore(db).read("default"))?.status).toBe("pending");
            }
            await expect(
                f.hosting.services.instances.list({ ...actor, instanceId: sites[0]!.id }, null, 10),
            ).rejects.toMatchObject({ code: "FORBIDDEN" });
            expect((await f.hosting.services.instances.list(actor, null, 10)).items).toHaveLength(3);
            const grants = new MongoAdministratorGrantStore(controlDb);
            await grants.set("replacement-admin", true);
            await grants.set(sub!, false);
            const before = await f.instances.get(sites[0]!.id);
            await expect(f.provisioner.provision(sites[0]!.id)).rejects.toMatchObject({ status: 403 });
            expect(await f.instances.get(sites[0]!.id)).toEqual(before);
        } finally {
            await f.close();
        }
    },
    60_000,
);
