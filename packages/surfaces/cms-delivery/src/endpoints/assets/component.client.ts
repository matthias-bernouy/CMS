import { Component } from "@bernouy/components/base";
import {
    PROVIDER_IMAGE_WIDTHS,
    buildProviderImageAttributes,
    installProviderMediaImageRuntime,
    syncProviderMediaImage,
} from "@bernouy/cms-gateway/media/browser";

(window as any).cmsRuntime = {
    Component,
    PROVIDER_IMAGE_WIDTHS,
    buildProviderImageAttributes,
    syncProviderMediaImage,
};
installProviderMediaImageRuntime(document);
