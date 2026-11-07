import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";

export const emailErrorSchema = z.strictObject({ message: contractString({ minLength: 1, maxLength: 2048 }) });
