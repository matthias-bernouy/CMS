import { MongoClient } from "mongodb";
import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import { OfficialInstanceProfiles } from "@bernouy/ulvia-provider";
import { readProviderRuntimeEnv } from "./runtimeEnv";
import { MongoProviderInstanceRegistry } from "./runtime/instances/MongoProviderInstanceRegistry";
import { MongoInstanceTransitionStore } from "./runtime/instances/MongoInstanceTransitionStore";
import { loadOfficialArtifacts } from "./runtime/instances/profiles/artifacts";
import { assertHostedReleaseRetention, managedReleaseReader } from "./runtime/instances/profiles/retention";

// One-shot deployment preflight: read pins only, without starting workers or changing stored state.
const env = readProviderRuntimeEnv(process.env);
const mongo = new MongoClient(env.MONGO_URL);
try {
    await mongo.connect();
    const options = { allowInsecureHttp: env.CMS_REPOSITORY_ALLOW_INSECURE_HTTP };
    const artifacts = await loadOfficialArtifacts(
        new HttpProviderRepository("retention-check", env.CMS_REPOSITORY_URL, options),
        new HttpCollectionRepository("retention-check", env.CMS_REPOSITORY_URL, options),
    );
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
