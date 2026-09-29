import { SharpImageTransformer } from "@bernouy/cms-gateway/media/sharp";
import type { SourceImageTransformer } from "../../interfaces/transformer";

/** Transitional Source adapter over the provider-neutral image transformer. */
export class SharpSourceImageTransformer extends SharpImageTransformer implements SourceImageTransformer {}
