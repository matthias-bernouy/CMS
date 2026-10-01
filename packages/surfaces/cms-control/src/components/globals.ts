import { Component } from "@bernouy/components/base";
import {
    PROVIDER_IMAGE_WIDTHS,
    buildProviderImageAttributes,
    installProviderMediaImageRuntime,
    syncProviderMediaImage,
} from "@bernouy/cms-gateway/media/browser";
import {
    observeSource,
    readSourceData,
    refreshSourceContext,
    setSourceContext,
    sourceFormRequest,
    SourceFormError,
} from "@bernouy/components/binding";

(window as any).cmsRuntime = {
    Component,
    PROVIDER_IMAGE_WIDTHS,
    buildProviderImageAttributes,
    syncProviderMediaImage,
    observeSource,
    readSourceData,
    refreshSourceContext,
    setSourceContext,
    sourceFormRequest,
    SourceFormError,
};
installProviderMediaImageRuntime(document);
