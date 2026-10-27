// Normalises Indian and international numbers to E.164. Numbers without a country
// code are assumed to be Indian mobile numbers (+91), because Bulkskart's suppliers
// are primarily in India.
export function normalizePhone(input: string, defaultCountryCode = '91'): string | null {
  const digits = input.replace(/[\s\-().]/g, '');
  let candidate: string | null = null;
  if (/^\+[1-9]\d{7,14}$/.test(digits)) candidate = digits;
  else if (/^00[1-9]\d{7,13}$/.test(digits)) candidate = `+${digits.slice(2)}`;
  else if (/^0?[6-9]\d{9}$/.test(digits)) candidate = `+${defaultCountryCode}${digits.replace(/^0/, '').slice(-10)}`;
  else if (/^\d{10,15}$/.test(digits) && digits.startsWith(defaultCountryCode)) candidate = `+${digits}`;
  return candidate && /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
}
