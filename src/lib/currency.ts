import type { City } from "@/lib/branches";

/**
 * What a city's money is called, and how it is written.
 *
 * The CK delivery note headed its total "Delivery Total (PHP)" and printed a
 * peso sign, in a module whose city selector has offered Dubai all along. A
 * note handed to a Dubai branch stating pesos is not a rounding error — it is
 * the wrong currency on a signed document.
 */
export const CITY_CURRENCY: Record<City, { code: string; symbol: string; locale: string }> = {
  dubai: { code: "AED", symbol: "AED", locale: "en-AE" },
  manila: { code: "PHP", symbol: "₱", locale: "en-PH" },
};

export function cityOf(v: string | null | undefined): City {
  return String(v || "").trim().toLowerCase() === "dubai" ? "dubai" : "manila";
}

export function currencyOf(city: string | null | undefined) {
  return CITY_CURRENCY[cityOf(city)];
}

/** "AED 116.54" / "₱ 1,234.00" — symbol, a space, two decimals. */
export function money(city: string | null | undefined, n: number | null | undefined): string {
  const c = currencyOf(city);
  const v = Number(n || 0);
  return `${c.symbol} ${v.toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
