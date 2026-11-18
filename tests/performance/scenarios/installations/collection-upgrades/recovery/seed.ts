import { resolve } from "node:path";
import { runRecoveryWorker } from "../../recovery/worker";
import { assertUpgradeSeedScope } from "../../recovery/scope";
import { assertCondition } from "../../../queries/types";
import { ClientFailure } from "../../../../harness/clients/failure";
import type { CollectionUpgradeContext } from "../context";

let moduleBytes: Promise<string> | undefined;
function boundaryModule() {
    return (moduleBytes ??= (async () => {
        const build = await Bun.build({
            entrypoints: [resolve(import.meta.dir, "../../recovery/boundary.ts")],
            target: "bun",
            format: "esm",
        });
        if (!build.success || build.outputs.length !== 1) {
            throw new ClientFailure("collection-recovery-boundary-build-failed");
        }
        const bytes = await build.outputs[0]!.arrayBuffer();
        if (bytes.byteLength > 16 * 1024) {
            throw new ClientFailure("collection-recovery-boundary-byte-limit");
        }
        return `data:text/javascript;base64,${Buffer.from(bytes).toString("base64")}`;
    })().catch((error) => {
        moduleBytes = undefined;
        throw error;
    }));
}

/** Interrupt the real candidate service in a separate owned fixture process immediately after storage.begin. */
export async function seedCollectionRecovery(
    context: CollectionUpgradeContext,
    review: Readonly<Record<string, unknown>>,
    expectedId: string,
) {
    const stack = context.environment.stack;
    const site = context.state.site;
    assertUpgradeSeedScope(stack.id, stack.providerName, site.instanceId, site.url);
    assertCondition(
        review.status === "applicable" && /^sha256:[a-f0-9]{64}$/u.test(expectedId),
        "collection-recovery-review-scope",
    );
    const payload = JSON.stringify({
        canonicalJson: context.target.canonicalJson,
        digest: context.target.digest,
        repositoryId: context.to.repositoryId,
        assets: context.target.assets.map(({ id, bytes }) => ({ id, bytes: Buffer.from(bytes).toString("base64") })),
        planDigest: review.planDigest,
        expectedRevision: review.expectedRevision,
        expectedId,
    });
    assertCondition(Buffer.byteLength(payload) <= 64 * 1024, "collection-recovery-fixture-byte-limit");
    const script = `
        import { MongoClient } from "mongodb";
        import { NOOP_LOGGER } from "@bernouy/logging";
        import { EncryptedMongoSecretStore } from "@bernouy/secret-store/mongo";
        import { readProviderRuntimeEnv } from "/app/packages/runtimes/ulvia-provider-server/src/runtimeEnv";
        import { createEnvelopeSecretCrypto } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/stores/envelopeCrypto";
        import { EncryptedInstanceCredentials } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/authentication/EncryptedInstanceCredentials";
        import { MongoInstanceCredentialStore } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/authentication/MongoInstanceCredentialStore";
        import { MongoProviderInstanceRegistry } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/instances/MongoProviderInstanceRegistry";
        import { createProviderStores } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/stores/providerStores";
        import { instanceMongoUrl } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/stores/storageRoots";
        const {interruptPreparedUpgrade}=await import(${JSON.stringify(await boundaryModule())});
        const input=${payload};
        const env=readProviderRuntimeEnv(process.env);
        const client=new MongoClient(env.MONGO_URL);
        let stores;
        try {
            await client.connect();
            const instance=await new MongoProviderInstanceRegistry(client.db()).get(${JSON.stringify(site.instanceId)});
            if(!instance||instance.status!=="ready"||instance.cmsUrl!==${JSON.stringify(site.url)})throw Error("Collection recovery scope refused");
            const crypto=await createEnvelopeSecretCrypto(client.db(),env.CMS_KEK);
            const secrets=new EncryptedMongoSecretStore({scopeId:"ulvia-provider-control",collection:client.db().collection("ulvia_provider_secrets"),secretCrypto:crypto});
            const runtime=await new EncryptedInstanceCredentials(new MongoInstanceCredentialStore(client.db()),secrets).read(instance.id);
            if(!runtime)throw Error("Collection recovery credentials unavailable");
            stores=await createProviderStores({instanceId:instance.id,MONGO_URL:instanceMongoUrl(env.MONGO_URL,instance.storageKey),CMS_KEK:{activeKeyId:"instance",keysHex:{instance:runtime.kekHex},rotateOnStart:false},CMS_FILES_DIR:env.CMS_FILES_DIR+"/"+instance.storageKey,CMS_SESSION_SECRET:runtime.sessionSecret,CMS_PUBLIC_URL:instance.cmsUrl},NOOP_LOGGER);
            if(await stores.upgradeStorage.getActive("default"))throw Error("Collection recovery already active");
            if(await stores.upgradeStorage.get("default",input.expectedId,"collection"))throw Error("Collection recovery identity already exists");
            const imported=await stores.collections.importRelease(JSON.parse(input.canonicalJson),input.assets.map(asset=>({id:asset.id,bytes:new Uint8Array(Buffer.from(asset.bytes,"base64"))})));
            if(imported.digest!==input.digest)throw Error("Collection recovery artifact mismatch");
            const targets=[{digest:input.digest,repositoryId:input.repositoryId}];
            const plan=await stores.collectionUpgrades.plan("default",targets);
            if(plan.status!=="applicable"||plan.planDigest!==input.planDigest||plan.expectedRevision!==input.expectedRevision)throw Error("Collection recovery review changed");
            const prepared=await interruptPreparedUpgrade(stores.upgradeStorage,()=>stores.collectionUpgrades.apply("default",targets,plan.planDigest),intent=>{
                if(intent.id!==input.expectedId||intent.siteId!=="default"||intent.kind!=="collection"||intent.status!=="prepared"||intent.expectedRevision!==input.expectedRevision||intent.planDigest!==input.planDigest)throw Error("Collection recovery intent scope refused");
            });
            const saved=await stores.upgradeStorage.get("default",prepared.id,"collection");
            if(saved?.status!=="prepared")throw Error("Collection recovery was not durable");
            console.log(JSON.stringify({id:saved.id,status:saved.status,planDigest:saved.planDigest,expectedRevision:saved.expectedRevision}));
        }finally{await stores?.close();await client.close();}
    `;
    assertCondition(Buffer.byteLength(script) <= 96 * 1024, "collection-recovery-program-byte-limit");
    const saved = JSON.parse((await runRecoveryWorker(stack, script)).trim());
    assertCondition(
        saved.id === expectedId &&
            saved.status === "prepared" &&
            saved.planDigest === review.planDigest &&
            saved.expectedRevision === review.expectedRevision,
    );
}
