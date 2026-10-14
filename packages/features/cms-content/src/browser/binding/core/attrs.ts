import {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    type CmsSourceMethod,
    type CmsSourceState,
    type CmsSourceTrigger,
} from "cms-content/blocs/core/markup/bindings/types";
import { isCmsSourceTrigger } from "cms-content/blocs/core/markup/bindings/sourceStatus";

export const BINDING_CORE_TAG = CMS_BINDING_CORE_TAG;
export const QUERY_ATTR = CMS_BINDING_ATTRIBUTES.query;
export const QUERY_INPUT_ATTR = CMS_BINDING_ATTRIBUTES.queryInput;
export const QUERY_LISTEN_ATTR = CMS_BINDING_ATTRIBUTES.queryListen;
export const QUERY_REFRESH_ATTR = CMS_BINDING_ATTRIBUTES.queryRefresh;
export const SOURCE_ATTR = CMS_BINDING_ATTRIBUTES.source;
export const SOURCE_INHERIT_QUERY_ATTR = CMS_BINDING_ATTRIBUTES.sourceInheritQuery;
export const SOURCE_IDEMPOTENCY_ATTR = CMS_BINDING_ATTRIBUTES.sourceIdempotency;
export const SOURCE_BODY_ATTR = CMS_BINDING_ATTRIBUTES.sourceBody;
export const SOURCE_DELAY_ATTR = CMS_BINDING_ATTRIBUTES.sourceDelay;
export const SOURCE_ID_ATTR = CMS_BINDING_ATTRIBUTES.sourceId;
export const SOURCE_TRIGGER_ATTR = CMS_BINDING_ATTRIBUTES.sourceTrigger;
export const SOURCE_METHOD_ATTR = CMS_BINDING_ATTRIBUTES.sourceMethod;
export const SOURCE_SUCCESS_RESET_ATTR = CMS_BINDING_ATTRIBUTES.sourceSuccessReset;
export const SOURCE_SUCCESS_RELOAD_ATTR = CMS_BINDING_ATTRIBUTES.sourceSuccessReload;
export const SOURCE_SERIALIZATION_ATTR = CMS_BINDING_ATTRIBUTES.sourceSerialization;
export const SOURCE_SUCCESS_REDIRECT_ATTR = CMS_BINDING_ATTRIBUTES.sourceSuccessRedirect;
export const SOURCE_SUCCESS_REDIRECT_PARAM_ATTR = CMS_BINDING_ATTRIBUTES.sourceSuccessRedirectParam;
export const REPEAT_ATTR = CMS_BINDING_ATTRIBUTES.repeat;
export const CONDITION_ATTR = CMS_BINDING_ATTRIBUTES.condition;
export const SYNC_ATTR = CMS_BINDING_ATTRIBUTES.sync;

export type SourceState = CmsSourceState;
export type SourceTrigger = CmsSourceTrigger;
export type SourceMethod = CmsSourceMethod;
export const isSourceTrigger = isCmsSourceTrigger;
