import type { Provider } from "@bernouy/cms-gateway";

export type OfficialProviderImportResult = {
    provider: Provider;
    secrets: Array<{ key: string; value: string }>;
};
