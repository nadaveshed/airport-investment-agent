/** US Census divisions plus a few common groupings analysts use. Keys are lower-case for lookup. */
export const REGIONS: Record<string, readonly string[]> = {
  'new england': ['CT', 'ME', 'MA', 'NH', 'RI', 'VT'],
  'mid-atlantic': ['NJ', 'NY', 'PA'],
  'east north central': ['IL', 'IN', 'MI', 'OH', 'WI'],
  'west north central': ['IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD'],
  'south atlantic': ['DE', 'DC', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'WV'],
  'east south central': ['AL', 'KY', 'MS', 'TN'],
  'west south central': ['AR', 'LA', 'OK', 'TX'],
  mountain: ['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY'],
  pacific: ['AK', 'CA', 'HI', 'OR', 'WA'],
  'west coast': ['CA', 'OR', 'WA'],
  midwest: ['IL', 'IN', 'MI', 'OH', 'WI', 'IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD'],
  northeast: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NJ', 'NY', 'PA'],
  south: [
    'DE',
    'DC',
    'FL',
    'GA',
    'MD',
    'NC',
    'SC',
    'VA',
    'WV',
    'AL',
    'KY',
    'MS',
    'TN',
    'AR',
    'LA',
    'OK',
    'TX',
  ],
};

export const REGION_NAMES = Object.keys(REGIONS);

export function statesForRegion(region: string): readonly string[] | undefined {
  return REGIONS[region.trim().toLowerCase()];
}
