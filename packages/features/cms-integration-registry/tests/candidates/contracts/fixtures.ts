import type { IntegrationVerificationEnvelopeV1 } from "@bernouy/cms-integration-verification";
import { publicationPackage, type registryFixture } from "../../publication/fixtures";
import { verificationContractCatalog } from "../finalization/contractCatalog";
import { completePassedCandidate } from "../finalization/fixtures";
import { planningPolicy, verificationCandidate } from "../planning/fixtures";

export async function passedContractRelease(
    fixture: ReturnType<typeof registryFixture>,
    input: Readonly<{
        candidateId: string;
        kind?: string;
        version: string;
        contracts?: IntegrationVerificationEnvelopeV1["manifest"]["contracts"];
    }>,
) {
    const candidate = await verificationCandidate(await publicationPackage(input.kind ?? "demo", input.version), {
        contracts: input.contracts ?? [],
    });
    return await completePassedCandidate(fixture, input.candidateId, candidate, await planningPolicy());
}

export function publicApiContract(range: string) {
    return [{ contractId: "public-api", entrypoint: "tests/contract.ts", activeMajorRange: range }];
}

export { verificationContractCatalog };
