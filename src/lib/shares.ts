/**
 * Share arithmetic for a building's unit registry.
 *
 * A unit's share (udział) is its floor area as a fraction of the whole building. S-03
 * weighs a vote by that share and S-05 measures the 50% threshold against the sum of all
 * of them, so two properties matter more than elegance here:
 *
 *   1. The shares must total exactly 100.00%. Not "to within rounding" -- exactly, because
 *      the threshold comparison is `sum_for * 2 > total`, and a total that drifts moves
 *      the bar under a vote that has already been cast.
 *   2. The same input must always produce the same output. The confirm step re-parses the
 *      uploaded CSV and recomputes rather than trusting the shares a browser posts back,
 *      which is only safe if recomputation is reproducible to the basis point.
 *
 * Both fall out of doing the whole thing in integers. Nothing here is a float: areas
 * arrive as an integer number of hundredths of a square metre (from src/lib/units-csv.ts)
 * and shares leave as an integer number of basis points -- hundredths of a percent, 10000
 * to the building.
 */

/** Basis points in a whole building. 10000 bps = 100.00%. */
export const TOTAL_BPS = 10000;

export type ShareResult = number[] | { error: string };

/**
 * Distributes TOTAL_BPS across units in proportion to their floor areas, by the largest
 * remainder method.
 *
 * Every unit first takes the whole basis points its area earns outright. That always
 * leaves a few over -- each unit discarded a fraction of a basis point, and those
 * fractions add up to the leftover. The leftover goes one basis point at a time to the
 * units that discarded the most, which is what makes the result both fair and exact.
 *
 * @param areaHundredths Floor areas in hundredths of a square metre, in file order.
 * @returns Shares in basis points, in the same order and totalling exactly TOTAL_BPS; or
 *          an error message (Polish, shown to the administrator verbatim).
 */
export function computeShareBps(areaHundredths: number[]): ShareResult {
  if (areaHundredths.length === 0) {
    return { error: "Plik nie zawiera żadnego lokalu." };
  }

  let totalArea = 0;
  for (const area of areaHundredths) {
    if (!Number.isSafeInteger(area) || area <= 0) {
      return { error: "Metraż lokalu musi być liczbą dodatnią." };
    }
    totalArea += area;
  }

  // The exact fraction of the building each unit holds is area / totalArea, so its exact
  // share is (area * TOTAL_BPS) / totalArea. Splitting that one division into quotient
  // and remainder gives both halves of the largest remainder method at once, with no
  // rounding step in between to argue about: `base` is the share earned outright, and
  // `remainder` is precisely how much was discarded, as an integer.
  //
  // Safe in doubles by a wide margin: an area caps at 10000 m2 (1e6 hundredths), so the
  // numerator caps at 1e10 -- nearly six orders of magnitude below Number.MAX_SAFE_INTEGER.
  const shares: number[] = [];
  const remainders: number[] = [];
  let distributed = 0;

  for (const area of areaHundredths) {
    const numerator = area * TOTAL_BPS;
    const base = Math.floor(numerator / totalArea);

    shares.push(base);
    remainders.push(numerator % totalArea);
    distributed += base;
  }

  // Each unit discarded strictly less than one basis point, so the leftover is strictly
  // less than the number of units: no unit ever receives more than one extra.
  const leftover = TOTAL_BPS - distributed;

  const order = shares.map((_, index) => index);
  order.sort((a, b) => {
    const byRemainder = remainders[b] - remainders[a];
    // Ties break by file order, and deliberately so. Any other tie-break -- by area, by
    // name, by anything float-derived -- would still be deterministic, but file order is
    // the only one an administrator can see for themselves in the file they uploaded.
    return byRemainder === 0 ? a - b : byRemainder;
  });

  for (let i = 0; i < leftover; i++) {
    shares[order[i]] += 1;
  }

  // A unit at zero basis points can never affect a vote, and the units_share_positive
  // check constraint would reject it at the database anyway. Refusing here means the
  // administrator gets a Polish sentence naming the position in their file instead of a
  // constraint violation surfacing from the import.
  //
  // Reachable only for a pathological registry -- a broom cupboard beside a tower block.
  // At 70 units of similar size the smallest share is around 140 bps.
  const zeroIndex = shares.indexOf(0);
  if (zeroIndex !== -1) {
    return {
      error:
        `Lokal na pozycji ${String(zeroIndex + 1)} ma metraż zbyt mały w stosunku do ` +
        `całego budynku — jego udział wyniósłby 0%. Sprawdź metraże w pliku.`,
    };
  }

  return shares;
}

/** Formats a share as Polish percent with two decimal places, e.g. 3334 -> "33,34%". */
export function formatShareBps(shareBps: number): string {
  return `${(shareBps / 100).toFixed(2).replace(".", ",")}%`;
}

/** Formats an area in hundredths of m2 as Polish decimal, e.g. 3333 -> "33,33". */
export function formatAreaHundredths(areaHundredths: number): string {
  return (areaHundredths / 100).toFixed(2).replace(".", ",");
}

/**
 * Formats a decimal number of square metres the Polish way, e.g. 52.4 -> "52,40".
 *
 * The counterpart to formatAreaHundredths for values read back out of `numeric(8,2)`
 * columns, which arrive as decimals rather than as the integer hundredths the parser
 * produces.
 */
export function formatSquareMetres(squareMetres: number): string {
  return squareMetres.toFixed(2).replace(".", ",");
}

/**
 * Renders an area as the decimal string the import function expects.
 *
 * Built by slicing the integer rather than dividing, so no float ever touches the value
 * on its way to `numeric(8,2)`. `p_rows` carries area_m2 as a string for exactly this
 * reason -- a JSON number would be parsed as a double first.
 */
export function areaHundredthsToDecimalString(areaHundredths: number): string {
  const whole = Math.trunc(areaHundredths / 100);
  const fraction = areaHundredths % 100;
  return `${String(whole)}.${String(fraction).padStart(2, "0")}`;
}
