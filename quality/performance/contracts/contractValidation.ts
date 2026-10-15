import {
    admitContractReleaseJson,
    parseContractReleaseJson,
    type AdmittedContractRelease,
} from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, planContractPublications } from "@bernouy/cms-repository/contracts/catalogue";
import { compareContractReleases, satisfiesVersionRange } from "@bernouy/cms-repository/contracts/compatibility";
import { assertMaximum, benchmark, printResults } from "../benchmark";
import { officialContractDocuments } from "../officialContracts";

export async function runContractValidationBenchmarks(): Promise<void> {
    const documents = await officialContractDocuments();
    const parsed = documents.map(({ json }) => parseContractReleaseJson(json));
    const largestIndex = parsed.reduce(
        (selected, release, index) =>
            release.capabilities.length > parsed[selected]!.capabilities.length ? index : selected,
        0,
    );
    const largest = documents[largestIndex]!;
    const admissions = await Promise.all(documents.map(({ json }) => admitContractReleaseJson(json)));
    const results = [
        await benchmark(`parse largest contract (${parsed[largestIndex]!.capabilities.length} capabilities)`, () =>
            parseContractReleaseJson(largest.json),
        ),
        await benchmark("admit largest contract", () => admitContractReleaseJson(largest.json)),
        await benchmark(`parse ${documents.length} official contracts`, () =>
            documents.map(({ json }) => parseContractReleaseJson(json)),
        ),
        await benchmark(`admit ${documents.length} official contracts`, () =>
            Promise.all(documents.map(({ json }) => admitContractReleaseJson(json))),
        ),
        await benchmark("compare largest contract with identical release", () =>
            compareContractReleases(parsed[largestIndex]!, parsed[largestIndex]!),
        ),
        await benchmark("plan all official contract publications", () => publicationPlan(admissions)),
        await benchmark("evaluate 10,000 version-range matches", versionRangeMatrix),
    ];
    printResults("Contract parsing, admission and compatibility", results);
    for (const result of results) {
        assertMaximum(`${result.name} p95`, result.p95Ms, 3_000);
    }
}

async function publicationPlan(admissions: readonly AdmittedContractRelease[]): Promise<void> {
    const catalogue = new InMemoryReleaseCatalogue();
    await planContractPublications(catalogue, admissions);
}

function versionRangeMatrix(): void {
    for (let index = 0; index < 10_000; index += 1) {
        satisfiesVersionRange(`${index % 4}.${index % 10}.${index % 20}`, "^2.3.0 || >=3.5.0 <4.0.0");
    }
}
