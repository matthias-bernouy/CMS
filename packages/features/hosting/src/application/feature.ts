import { defineFeature } from "@bernouy/ulvia-sdk";
import { createInstance, listInstances, getInstance, disableInstance } from "./capabilities/instances";
import { claimDomain, listDomains, verifyDomain, disableDomain } from "./capabilities/domains";
import { mapHostingError } from "./capabilities/policy";
import { claimZone, verifyZone, listZones, disableZone } from "./capabilities/zones";
import { electPrimaryDomain } from "./capabilities/primary";

export const hostingFeature = defineFeature({
    contractId: "ulvia/cms.hosting",
    name: "CMS Hosting",
    version: "1.2.0",
    publisherId: "ulvia",
    description:
        "Provider-owned instance and domain administration authorized by the persisted Control identity and its current administrator grants.",
    catalogue: { icon: "server", categories: ["administration", "infrastructure"] },
    documents: new URL("../../docs/management/", import.meta.url),
    mapError: mapHostingError,
    capabilities: [
        createInstance,
        listInstances,
        getInstance,
        disableInstance,
        electPrimaryDomain,
        claimDomain,
        listDomains,
        verifyDomain,
        disableDomain,
        claimZone,
        verifyZone,
        listZones,
        disableZone,
    ],
});
export type { HostingServices } from "hosting/interfaces/services";
