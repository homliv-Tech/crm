import { z } from "zod";
import { PROJECT_PHASES, type ProjectPhase } from "./projects";
import { dealInput } from "./validation";

export const projectDetailsInput = dealInput
  .extend({
    stage: z.enum(PROJECT_PHASES).optional(),
    expectedStage: z.enum(PROJECT_PHASES).optional(),
  })
  .refine(
    (value) => value.stage === undefined || value.expectedStage !== undefined,
    {
      message: "The original project phase is required when changing it.",
      path: ["expectedStage"],
    },
  );
export const projectPhaseInput = z.object({
  id: z.uuid(),
  stage: z.enum(PROJECT_PHASES),
  expectedStage: z.enum(PROJECT_PHASES),
});

export function projectDetailsPayload(
  values: Record<string, unknown>,
  originalStage: ProjectPhase,
) {
  const { stage, ...details } = values;
  return stage === originalStage
    ? details
    : { ...details, stage, expectedStage: originalStage };
}
