import { MongoClient } from "mongodb";
import { OfficialInstanceProfiles } from "@bernouy/ulvia-provider";
import { readProviderRuntimeEnv } from "./runtimeEnv";
import { MongoProviderInstanceRegistry } from "./runtime/instances/MongoProviderInstanceRegistry";
import { MongoInstanceTransitionStore } from "./runtime/instances/MongoInstanceTransitionStore";
import { loadOfficialArtifacts } from "./runtime/instances/profiles/artifacts";
import { bundledBootstrapSources } from "./runtime/instances/profiles/bootstrap";
import { assertHostedReleaseRetention, managedReleaseReader } from "./runtime/instances/profiles/retention";

// One-shot deployment preflight: read pins only, without starting workers or changing stored state.
const env = readProviderRuntimeEnv(process.env);
const mongo = new MongoClient(env.MONGO_URL);
try {
    await mongo.connect();
    const bootstrap = bundledBootstrapSources(env.ULVIA_BOOTSTRAP_DIR);
    const artifacts = await loadOfficialArtifacts(bootstrap.providers, bootstrap.collections);
    const profiles = new OfficialInstanceProfiles(artifacts.profiles, artifacts.defaultProfile);
    const instances = await new MongoProviderInstanceRegistry(mongo.db()).list();
    const transitions = await new MongoInstanceTransitionStore(mongo.db()).listRetained();
    await assertHostedReleaseRetention(
        profiles,
        instances,
        transitions,
        managedReleaseReader(mongo, profiles, instances),
    );
} finally {
    await mongo.close();
}
