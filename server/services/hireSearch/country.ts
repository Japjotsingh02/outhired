import "server-only";

// PDL's location_country uses lowercase full country names. Only countries a job location can name
// unambiguously are listed; anything else (a city alone, a US state code) gives no country filter.
const COUNTRIES: Array<{ name: string; names: string[] }> = [
  { name: "united states", names: ["united states", "united states of america", "usa", "u.s.a.", "u.s.", "us"] },
  { name: "united kingdom", names: ["united kingdom", "uk", "u.k.", "great britain", "england", "scotland", "wales", "northern ireland"] },
  { name: "canada", names: ["canada"] },
  { name: "india", names: ["india"] },
  { name: "australia", names: ["australia"] },
  { name: "new zealand", names: ["new zealand"] },
  { name: "ireland", names: ["ireland"] },
  { name: "germany", names: ["germany", "deutschland"] },
  { name: "france", names: ["france"] },
  { name: "spain", names: ["spain"] },
  { name: "italy", names: ["italy"] },
  { name: "portugal", names: ["portugal"] },
  { name: "netherlands", names: ["netherlands", "the netherlands", "holland"] },
  { name: "belgium", names: ["belgium"] },
  { name: "switzerland", names: ["switzerland"] },
  { name: "austria", names: ["austria"] },
  { name: "sweden", names: ["sweden"] },
  { name: "norway", names: ["norway"] },
  { name: "denmark", names: ["denmark"] },
  { name: "finland", names: ["finland"] },
  { name: "poland", names: ["poland"] },
  { name: "israel", names: ["israel"] },
  { name: "united arab emirates", names: ["united arab emirates", "uae", "u.a.e."] },
  { name: "singapore", names: ["singapore"] },
  { name: "japan", names: ["japan"] },
  { name: "china", names: ["china"] },
  { name: "south korea", names: ["south korea", "korea"] },
  { name: "brazil", names: ["brazil", "brasil"] },
  { name: "mexico", names: ["mexico"] },
  { name: "argentina", names: ["argentina"] },
  { name: "south africa", names: ["south africa"] },
  { name: "philippines", names: ["philippines"] },
  { name: "indonesia", names: ["indonesia"] },
];

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MATCHERS = COUNTRIES.map(({ name, names }) => ({
  name,
  // Whole words only, so "us" does not match inside "austin" or "campus".
  pattern: new RegExp(`(?:^|[^a-z0-9])(?:${names.map(escape).join("|")})(?=$|[^a-z0-9])`, "i"),
}));

/**
 * The country a job location clearly names, as PDL spells it, or null when none or more than one
 * is named. "Bengaluru, Karnataka, India" -> "india". A city or state alone gives null.
 */
export function countryFromLocation(location: string | null | undefined): string | null {
  const text = location?.trim();
  if (!text) return null;
  const found = MATCHERS.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
  return found.length === 1 ? found[0] : null;
}
