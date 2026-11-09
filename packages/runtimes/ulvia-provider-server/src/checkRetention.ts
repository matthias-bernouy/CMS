import { MongoClient } from "mongodb";
import { SystemBootstrap } from "./runtime/instances/system/execution/SystemBootstrap";
import { ProviderExecutionSupport } from "./runtime/instances/system/execution/support";
import { readProviderRuntimeEnv } from "./runtimeEnv";
import { MongoProviderInstanceRegistry } from "./runtime/instances/MongoProviderInstanceRegistry";
import { MongoInstanceTransitionStore } from "./runtime/instances/MongoInstanceTransitionStore";
import { bundledBootstrapSources } from "./runtime/instances/system/bootstrap";
import { assertHostedReleaseRetention, managedReleaseReader } from "./runtime/instances/system/retention";

// One-shot deployment preflight: read pins only, without starting workers or changing stored state.
const env = readProviderRuntimeEnv(process.env);
const mongo = new MongoClient(env.MONGO_URL);
try {
    await mongo.connect();
    const bootstrap = bundledBootstrapSources(env.ULVIA_BOOTSTRAP_DIR);
    const system = new SystemBootstrap(bootstrap);
    const support = new ProviderExecutionSupport();
    const instances = new MongoProviderInstanceRegistry(mongo.db());
    const transitions = new MongoInstanceTransitionStore(mongo.db());
    await assertHostedReleaseRetention(
        support,
        {
            instances: instances.scan(),
            transitions: (id) => transitions.scanRetained(id),
            hasUnstagedUpgrade: (id) => transitions.hasUnstagedUpgrade(id),
        },
        managedReleaseReader(mongo, support, env.ULVIA_PROVIDER_PUBLIC_URL),
        system,
    );
} finally {
    await mongo.close();
}
