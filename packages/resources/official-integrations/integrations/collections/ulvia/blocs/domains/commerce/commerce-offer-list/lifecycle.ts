import { readFilterParams, readMetadataFilters } from "./helpers";

export function connectOfferList(host) {
    host.setAttribute("data-commerce-offer-list", "");
    host.style.display = "contents";
    refreshOfferListFilters(host);
    host.page = host.readPage();
    host.filterSignature = host.currentFilterSignature();
    host.addEventListener("basic-pagination:change", host.onPageChange);
    host.addEventListener("commerce-offer-filter:state", host.onSchemaState);
    host.ownerDocument.addEventListener("cms-params:change", host.onParamsChange);
    host.ownerDocument.defaultView?.addEventListener("popstate", host.onPopState);
    const Observer = host.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
    host.observer = new Observer(() => {
        refreshOfferListFilters(host);
        host.syncSource();
    });
    host.observer.observe(host, { attributes: true, childList: true, subtree: true });
    host.syncPagination();
    queueMicrotask(() => {
        if (host.isConnected) {
            refreshOfferListFilters(host);
            host.syncSource();
        }
    });
}

export function disconnectOfferList(host) {
    host.removeEventListener("basic-pagination:change", host.onPageChange);
    host.removeEventListener("commerce-offer-filter:state", host.onSchemaState);
    host.ownerDocument.removeEventListener("cms-params:change", host.onParamsChange);
    host.ownerDocument.defaultView?.removeEventListener("popstate", host.onPopState);
    host.observer?.disconnect();
    host.observer = null;
}

export function refreshOfferListFilters(host) {
    host.filterParams = readFilterParams(host);
    host.metadataFilters = readMetadataFilters(host);
    host.filterSignature = host.currentFilterSignature();
}
