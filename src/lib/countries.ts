export const COUNTRY_NAMES: string[] = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'New Zealand',
  'Ireland', 'Germany', 'France', 'Italy', 'Spain', 'Portugal', 'Netherlands',
  'Belgium', 'Switzerland', 'Austria', 'Sweden', 'Norway', 'Denmark', 'Finland',
  'Iceland', 'Poland', 'Czech Republic', 'Hungary', 'Romania', 'Bulgaria',
  'Greece', 'Croatia', 'Slovenia', 'Slovakia', 'Lithuania', 'Latvia', 'Estonia',
  'Russia', 'Ukraine', 'Belarus', 'Turkey', 'Georgia', 'Armenia', 'Azerbaijan',
  'Japan', 'South Korea', 'China', 'Taiwan', 'Hong Kong', 'Singapore',
  'Malaysia', 'Thailand', 'Vietnam', 'Philippines', 'Indonesia', 'India',
  'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Kazakhstan', 'Uzbekistan',
  'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Venezuela', 'Ecuador',
  'Bolivia', 'Uruguay', 'Paraguay', 'Mexico', 'Cuba', 'Dominican Republic',
  'Puerto Rico', 'Jamaica', 'Trinidad and Tobago', 'Bahamas', 'Barbados',
  'South Africa', 'Nigeria', 'Kenya', 'Ghana', 'Egypt', 'Morocco', 'Algeria',
  'Tunisia', 'Ethiopia', 'Tanzania', 'Uganda', 'Cameroon', 'Senegal',
  'Ivory Coast', 'Zimbabwe', 'Zambia', 'Namibia', 'Botswana', 'Madagascar',
  'Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Bahrain',
  'Oman', 'Jordan', 'Lebanon', 'Israel', 'Palestine', 'Iraq', 'Iran',
  'Afghanistan',
];

export function countryShortName(name: string | null | undefined): string | null {
  if (!name) return null;
  const map: Record<string, string> = {
    'United States': 'U.S.',
    'United Kingdom': 'U.K.',
  };
  return map[name] ?? name;
}
