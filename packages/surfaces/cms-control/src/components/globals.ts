import { Component } from "@bernouy/components/base";
import {
    PROVIDER_IMAGE_WIDTHS,
    buildProviderImageAttributes,
    installProviderMediaImageRuntime,
    syncProviderMediaImage,
} from "@bernouy/cms-gateway/browser";
import {
    observeSource,
    readSourceData,
    refreshSourceContext,
    setSourceContext,
    sourceFormRequest,
    SourceFormError,
} from "@bernouy/components/binding";
import { SOURCE_IMAGE_WIDTHS } from "@bernouy/cms-source-images/browser";
import {
    createResponsiveSourceImageBrowserApi,
    installBoundImageRuntime,
} from "@bernouy/cms-source-images/browser-host";

const sourceImages = createResponsiveSourceImageBrowserApi({ public: false, private: false });

(window as any).p9r = {
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
    SOURCE_IMAGE_WIDTHS,
    ...sourceImages,
};

installBoundImageRuntime(document, sourceImages);
installProviderMediaImageRuntime(document);
