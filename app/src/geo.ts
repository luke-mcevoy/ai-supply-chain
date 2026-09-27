import { feature, mesh } from "topojson-client";
import { geoCentroid, geoInterpolate, geoDistance } from "d3-geo";
import type { Feature, FeatureCollection, MultiLineString, Geometry } from "geojson";

// ISO 3166 numeric (world-atlas ids) → alpha-2. Covers every country the atlas is likely to touch;
// countries missing here simply don't take part in the controls choropleth.
const NUM_TO_A2: Record<string, string> = {
  "840": "US", "156": "CN", "158": "TW", "392": "JP", "410": "KR", "528": "NL", "276": "DE", "250": "FR",
  "826": "GB", "372": "IE", "376": "IL", "702": "SG", "458": "MY", "704": "VN", "764": "TH", "608": "PH",
  "356": "IN", "484": "MX", "124": "CA", "076": "BR", "152": "CL", "036": "AU", "643": "RU", "804": "UA",
  "408": "KP", "364": "IR", "682": "SA", "784": "AE", "634": "QA", "056": "BE", "756": "CH", "040": "AT",
  "380": "IT", "724": "ES", "752": "SE", "246": "FI", "578": "NO", "208": "DK", "616": "PL", "203": "CZ",
  "348": "HU", "554": "NZ", "360": "ID", "112": "BY", "192": "CU", "760": "SY", "862": "VE", "104": "MM",
  "398": "KZ", "496": "MN", "710": "ZA", "180": "CD", "646": "RW", "068": "BO", "032": "AR", "604": "PE",
  "792": "TR", "818": "EG", "586": "PK", "050": "BD", "566": "NG", "404": "KE", "504": "MA", "620": "PT",
  "300": "GR", "642": "RO", "703": "SK", "705": "SI", "233": "EE", "428": "LV", "440": "LT", "191": "HR",
  "100": "BG", "516": "NA", "266": "GA", "894": "ZM", "716": "ZW", "508": "MZ", "450": "MG", "116": "KH",
  "418": "LA", "268": "GE", "051": "AM", "031": "AZ", "860": "UZ", "368": "IQ", "422": "LB", "434": "LY",
  "729": "SD", "728": "SS", "706": "SO", "232": "ER", "332": "HT", "558": "NI", "140": "CF", "004": "AF",
  "196": "CY", "887": "YE", "400": "JO", "512": "OM", "414": "KW", "048": "BH", "144": "LK", "524": "NP",
  "170": "CO", "218": "EC", "858": "UY", "600": "PY", "231": "ET", "834": "TZ", "800": "UG", "012": "DZ",
  "788": "TN", "352": "IS", "442": "LU", "498": "MD", "688": "RS", "070": "BA", "807": "MK", "008": "AL",
  "499": "ME", "304": "GL",
};

export interface Country { a2?: string; name: string; feature: Feature<Geometry>; centroid: [number, number] }

export interface World {
  countries: Country[];
  borders: MultiLineString;
  coastline: MultiLineString;
  byA2: Map<string, Country>;
}

// Centroids of a few countries are visually poor (overseas territories drag them); pin them.
const CENTROID_OVERRIDE: Record<string, [number, number]> = {
  US: [-98.5, 39.5], FR: [2.4, 46.6], NL: [5.3, 52.2], NO: [9.5, 61.5], RU: [90, 60], CN: [104, 35.5],
};

export async function loadWorld(detail: "50m" | "110m" = "50m"): Promise<World> {
  const topo = await (await fetch(`${import.meta.env.BASE_URL}geo/countries-${detail}.json`)).json();
  const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>;
  const countries: Country[] = fc.features.map((f) => {
    const a2 = NUM_TO_A2[String(f.id).padStart(3, "0")];
    return { a2, name: f.properties?.name ?? "", feature: f, centroid: (a2 && CENTROID_OVERRIDE[a2]) || (geoCentroid(f) as [number, number]) };
  });
  const borders = mesh(topo, topo.objects.countries, (a: unknown, b: unknown) => a !== b) as MultiLineString;
  const coastline = mesh(topo, topo.objects.countries, (a: unknown, b: unknown) => a === b) as MultiLineString;
  return { countries, borders, coastline, byA2: new Map(countries.filter((c) => c.a2).map((c) => [c.a2!, c])) };
}

export const EARTH_KM = 6371;

/**
 * Great-circle arc lifted off the surface: altitude follows sin(πt), scaled with arc length,
 * so short hops hug the ground and ocean crossings loft visibly. Returns [lon, lat, metres].
 */
export function arcPath(a: [number, number], b: [number, number], lift = 0.22, segments?: number) {
  const d = geoDistance(a, b); // radians
  const n = segments ?? Math.max(12, Math.min(96, Math.round(d * 60)));
  const interp = geoInterpolate(a, b);
  const peak = Math.min(d * EARTH_KM * 1000 * lift, 2_600_000) + 20_000;
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [lon, lat] = interp(t);
    pts.push([lon, lat, Math.sin(Math.PI * t) * peak + 8_000]);
  }
  // keep longitudes continuous across the antimeridian so PathLayer doesn't draw a chord
  for (let i = 1; i < pts.length; i++) {
    while (pts[i][0] - pts[i - 1][0] > 180) pts[i][0] -= 360;
    while (pts[i][0] - pts[i - 1][0] < -180) pts[i][0] += 360;
  }
  return pts;
}

export function graticule(step = 20): [number, number][][] {
  const lines: [number, number][][] = [];
  for (let lon = -180; lon < 180; lon += step) {
    const l: [number, number][] = [];
    for (let lat = -80; lat <= 80; lat += 2) l.push([lon, lat]);
    lines.push(l);
  }
  for (let lat = -80; lat <= 80; lat += step) {
    const l: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 2) l.push([lon, lat]);
    lines.push(l);
  }
  return lines;
}

/** Point `deg` degrees from (lon, lat) along bearing 90° — used to find the globe's screen radius. */
export function offsetEast(lon: number, lat: number, deg: number): [number, number] {
  const φ1 = (lat * Math.PI) / 180, λ1 = (lon * Math.PI) / 180, δ = (deg * Math.PI) / 180, θ = Math.PI / 2;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI];
}
