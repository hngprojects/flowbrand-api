/**
 * Types and constants for the BE-306 template fallback engine.
 *
 * Stage names are normalized across all 8 industries to BE-306's canonical
 * four: Get Noticed, Spark Interest, Make First Sale, Bring Them Back.
 * AC-01 asserts this.
 *
 * Each TemplateDefinition is keyed by an `id` (`<industry>:<sub_type>`) and
 * carries the businessType values that should resolve to it. Selection
 * priority is: exact businessType match -> first template in the matched
 * industry -> default template.
 */

export const STAGE_NAMES = ['Get Noticed', 'Spark Interest', 'Make First Sale', 'Bring Them Back'] as const;

export type StageName = (typeof STAGE_NAMES)[number];

export type StagePosition = 1 | 2 | 3 | 4;

export interface TemplateStageDefinition {
  position: StagePosition;
  name: StageName;
  channel: string;
  explanation: string;
  actionPrompt: string;
  tasks: readonly string[];
}

export interface TemplateDefinition {
  id: string;
  industry: string;
  businessType: readonly string[];
  channelMatch?: readonly string[];
  stages: readonly [TemplateStageDefinition, TemplateStageDefinition, TemplateStageDefinition, TemplateStageDefinition];
}
