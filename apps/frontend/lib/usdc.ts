/** USDC uses 6 decimals. Human-readable amount (e.g. "10.25") → raw units (bigint). */
export const USDC_DECIMALS = 6;

/**
 * Parses a human-readable USDC amount (e.g. "10.25", "1", "0.5") to raw units (6 decimals).
 * Avoids float precision issues by parsing integer and decimal parts separately.
 * @returns bigint in raw units, or null if input is invalid
 */
export function parseUsdcAmount(input: string): bigint | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('.');
  if (parts.length > 2) return null;
  const intPart = (parts[0] ?? '').replace(/^0+/, '') || '0';
  const decPart = (parts[1] ?? '').slice(0, USDC_DECIMALS);
  if (!/^\d+$/.test(intPart) || !/^\d*$/.test(decPart)) return null;
  const intBig = BigInt(intPart) * 10n ** BigInt(USDC_DECIMALS);
  const decBig = BigInt((decPart + '0'.repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS));
  return intBig + decBig;
}

/**
 * Formats raw USDC units (bigint) to a human-readable string (e.g. "10.25").
 */
export function formatUsdcAmount(raw: bigint): string {
  const str = raw.toString().padStart(USDC_DECIMALS + 1, '0');
  const intPart = str.slice(0, -USDC_DECIMALS) || '0';
  const decPart = str.slice(-USDC_DECIMALS).replace(/0+$/, '');
  return decPart ? `${intPart}.${decPart}` : intPart;
}
