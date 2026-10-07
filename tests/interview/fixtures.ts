import { type Answers, EMPTY_ANSWERS } from "@/lib/interview/types";

export const answers = (patch: Partial<Answers> = {}): Answers => ({ ...EMPTY_ANSWERS, ...patch });
