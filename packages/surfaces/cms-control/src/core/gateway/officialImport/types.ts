import type { Source } from "@bernouy/cms-sources";

export type OfficialProviderImportResult = {
    source: Source;
    secrets: Array<{ key: string; value: string }>;
};
