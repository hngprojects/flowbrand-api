/**
 * Master template library for BE-306 fallback engine.
 *
 * 24 templates across 8 industries, sourced from PM-authored templates and
 * normalized to the BE-306 canonical 4-stage funnel:
 *   Get Noticed, Spark Interest, Make First Sale, Bring Them Back.
 *
 * Industries (with template counts):
 *   - construction:    5  (building_contractor, architecture_design, building_materials, real_estate_developer, facility_management)
 *   - education:       5  (online_course, tutoring, vocational, school, edtech)
 *   - hospitality:     5  (restaurant, event_catering, bakery, food_delivery, food_truck)
 *   - beauty:          1  (general)
 *   - agriculture:     4  (agro_input, livestock_poultry, fresh_produce, crop_processing)
 *   - fintech:         4  (digital_wallet, loan, investment_savings, cross_country_payment)
 *   - renewable:       4  (solar_installation, biogas, clean_cookstove, mini_grid)
 *   - health_fitness:  3  (gym_coach, nutrition, wellness_coach)
 *
 * Selection (FunnelTemplateService):
 *   1. Exact businessType match against TemplateDefinition.businessType[]
 *   2. Industry-level match against TemplateDefinition.industry (first template wins)
 *   3. Fallback to DEFAULT_TEMPLATE
 */

import { AGRICULTURE_TEMPLATES } from './agriculture.templates';
import { BEAUTY_TEMPLATES } from './beauty.templates';
import { CONSTRUCTION_TEMPLATES } from './construction.templates';
import { EDUCATION_TEMPLATES } from './education.templates';
import { FINTECH_TEMPLATES } from './fintech.templates';
import { HEALTH_FITNESS_TEMPLATES } from './health-fitness.templates';
import { HOSPITALITY_TEMPLATES } from './hospitality.templates';
import { RENEWABLE_TEMPLATES } from './renewable.templates';
import type { TemplateDefinition } from './funnel-templates.types';

export const TEMPLATE_LIBRARY: readonly TemplateDefinition[] = [
  ...CONSTRUCTION_TEMPLATES,
  ...EDUCATION_TEMPLATES,
  ...HOSPITALITY_TEMPLATES,
  ...BEAUTY_TEMPLATES,
  ...AGRICULTURE_TEMPLATES,
  ...FINTECH_TEMPLATES,
  ...RENEWABLE_TEMPLATES,
  ...HEALTH_FITNESS_TEMPLATES,
] as const;

// Fallback when nothing else matches: Hospitality / Local Restaurant has the
// broadest applicability across small businesses in the SEIL target market.
export const DEFAULT_TEMPLATE: TemplateDefinition = HOSPITALITY_TEMPLATES[0];

export type { TemplateDefinition, TemplateStageDefinition, StageName, StagePosition } from './funnel-templates.types';
export { STAGE_NAMES } from './funnel-templates.types';
