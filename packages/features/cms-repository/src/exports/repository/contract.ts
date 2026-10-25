import definition from "cms-repository/repository/capabilities/contract";
import { admitContractRelease } from "cms-repository/exports/contracts/index";

export function admitRepositoryContract() {
    return admitContractRelease(definition);
}

export { RepositoryCapabilityService, RepositoryCapabilityError } from "cms-repository/repository/capabilities/service";
export type { RepositoryCapabilityPorts } from "cms-repository/repository/capabilities/interfaces";
