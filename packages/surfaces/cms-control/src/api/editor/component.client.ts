import { Component } from "@bernouy/components/base";
import {
    PROVIDER_IMAGE_WIDTHS,
    buildProviderImageAttributes,
    installProviderMediaImageRuntime,
    syncProviderMediaImage,
} from "@bernouy/cms-gateway/browser";

(window as any).p9r = {
    ...(window as any).p9r,
    Component,
    PROVIDER_IMAGE_WIDTHS,
    buildProviderImageAttributes,
    syncProviderMediaImage,
};
installProviderMediaImageRuntime(document);
installCompositionControllerSync(document);

function installCompositionControllerSync(document: Document): void {
    const hostAttribute = "data-p9r-composition";
    const controllerAttribute = "data-p9r-composition-controller-runtime";
    new MutationObserver((records) => {
        for (const record of records) {
            if (record.type !== "attributes" || !record.attributeName) {
                continue;
            }
            const host = record.target as HTMLElement;
            if (!host.hasAttribute(hostAttribute) || record.attributeName.startsWith("data-p9r-composition")) {
                continue;
            }
            const controller = host.querySelector<HTMLElement>(`[${controllerAttribute}]`);
            const value = host.getAttribute(record.attributeName);
            if (value === null) {
                controller?.removeAttribute(record.attributeName);
            } else {
                controller?.setAttribute(record.attributeName, value);
            }
        }
    }).observe(document, { attributes: true, subtree: true });
}
