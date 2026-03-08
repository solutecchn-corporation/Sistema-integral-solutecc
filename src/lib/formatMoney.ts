/**
 * Formatea un número monetario con separador de miles y 2 decimales.
 * Ejemplo: 2003.01 → "2,003.01"
 */
export function formatMoney(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (isNaN(n)) return "0.00";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
