import { installationsImplementation } from "./implementations/repository/installations";
import { repositoryImplementation } from "./implementations/repository/registry";
import { authoringImplementation } from "./implementations/repository/authoring";
import { contentImplementation } from "./implementations/content";
import { accessImplementation } from "./implementations/access";
import { observabilityImplementation } from "./implementations/observability";
import { filesImplementation } from "./implementations/files";
import { secretsImplementation } from "./implementations/secrets";
import { smtpEmailerImplementation } from "./implementations/emailer";

import { providerConnectionsImplementation } from "./implementations/connections";
import { providerCmsInstancesFeature } from "./provider/instances/feature";
import type { ContractImplementation, FeatureDefinition } from "@bernouy/ulvia-sdk";
import type { UlviaProviderFeatureServices } from "../../ports/index";

type OfficialFeatureSource =
    | { readonly implementation: ContractImplementation<UlviaProviderFeatureServices> }
    | { readonly definition: FeatureDefinition };

/** One inventory distinguishes executable implementations from published protocol templates. */
const officialFeatureInventory: readonly OfficialFeatureSource[] = Object.freeze([
    { implementation: smtpEmailerImplementation },
    { implementation: accessImplementation },
    { implementation: contentImplementation },
    { implementation: authoringImplementation },
    { implementation: secretsImplementation },
    { implementation: filesImplementation },
    { implementation: observabilityImplementation },
    { implementation: providerConnectionsImplementation },
    { implementation: repositoryImplementation },
    { implementation: installationsImplementation },
    { definition: providerCmsInstancesFeature },
]);
export const officialFeatureImplementations = officialFeatureInventory.flatMap((source) =>
    "implementation" in source ? [source.implementation] : [],
);
export const officialFeatureTemplates = officialFeatureInventory.flatMap((source) =>
    "definition" in source ? [source.definition] : [],
);
