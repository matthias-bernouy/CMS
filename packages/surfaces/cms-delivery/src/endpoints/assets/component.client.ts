import { Component, Composition } from "@bernouy/components/base";
import { SOURCE_IMAGE_WIDTHS } from "@bernouy/cms-source-images/browser";
import {
    createResponsiveSourceImageBrowserApi,
    installBoundImageRuntime,
} from "@bernouy/cms-source-images/browser-host";

const sourceImages = createResponsiveSourceImageBrowserApi({
    public: __CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED__,
    private: __CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED__,
});

(window as any).p9r = {
    Component,
    Composition,
    SOURCE_IMAGE_WIDTHS,
    ...sourceImages,
};
installBoundImageRuntime(document, sourceImages);

declare const __CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED__: boolean;
declare const __CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED__: boolean;
