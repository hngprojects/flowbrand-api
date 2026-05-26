export const ALLOWED_SSA_COUNTRIES = [
  'Benin',
  'Burkina Faso',
  'Cape Verde',
  'Gambia',
  'Ghana',
  'Guinea',
  'Guinea-Bissau',
  'Ivory Coast',
  'Liberia',
  'Mali',
  'Mauritania',
  'Niger',
  'Nigeria',
  'Senegal',
  'Sierra Leone',
  'Togo',
] as const;

export type WestAfricanCountry = (typeof ALLOWED_SSA_COUNTRIES)[number];