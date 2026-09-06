import { request, loadBlocs, loadSiteCollections } from "./api";
import { collectBlocs } from "./collections";
import type { LibraryData } from "./model";
import type { IntegrationInstallationRow } from "../../Integrations/model";

export const LIBRARY_DATA_EVENT = "cms-blocs:data";
let data: LibraryData | undefined;
let pending: Promise<LibraryData> | undefined;

export function loadLibrary(refresh = false): Promise<LibraryData> {
    if (pending) {
        return refresh ? pending.catch(() => undefined).then(() => loadLibrary(true)) : pending;
    }
    if (data && !refresh) {
        return Promise.resolve(data);
    }
    pending = Promise.all([
        loadSiteCollections(),
        loadBlocs(),
        request<IntegrationInstallationRow[]>("/api/integrations/installations"),
    ])
        .then(([sites, blocs, installations]) => {
            data = { blocs, collections: collectBlocs(sites, blocs, installations) };
            window.dispatchEvent(new CustomEvent(LIBRARY_DATA_EVENT, { detail: data }));
            return data;
        })
        .finally(() => {
            pending = undefined;
        });
    return pending;
}
