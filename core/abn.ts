/** Australian Business Number checksum (ATO algorithm). Pure, safe for client and server. */
const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

export function normaliseAbn(input: string) {
  return input.replace(/\s+/g, "");
}

export function isValidAbn(input: string) {
  const abn = normaliseAbn(input);
  if (!/^\d{11}$/.test(abn)) return false;
  const digits = abn.split("").map(Number);
  digits[0] -= 1;
  const total = digits.reduce((sum, d, i) => sum + d * WEIGHTS[i], 0);
  return total % 89 === 0;
}

export function formatAbn(input: string) {
  const a = normaliseAbn(input);
  return a.length === 11 ? `${a.slice(0, 2)} ${a.slice(2, 5)} ${a.slice(5, 8)} ${a.slice(8)}` : input;
}
