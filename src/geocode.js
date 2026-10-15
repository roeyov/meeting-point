// Address search and reverse geocoding through Photon (photon.komoot.io),
// a free OpenStreetMap-based geocoder that is built for type-ahead use.
// No API key. Please keep usage reasonable; it is a shared public service.

const BASE = 'https://photon.komoot.io';

function joinParts(parts) {
  return parts.filter(Boolean).join(', ');
}

/** Turn Photon's loose property bag into one readable address line. */
export function formatPlace(props = {}) {
  const streetLine = joinParts([props.street && `${props.street}${props.housenumber ? ` ${props.housenumber}` : ''}`]);
  const locality = props.city || props.town || props.village || props.district || props.county;
  const primaryIsName = props.name && props.name !== props.street && props.name !== locality;
  const primary = primaryIsName ? props.name : streetLine || props.name || locality || props.country || 'Unknown place';
  const secondary = joinParts([
    primaryIsName ? streetLine : null,
    locality !== primary ? locality : null,
    props.state && props.state !== locality ? props.state : null,
    props.country,
  ]);
  return { primary, secondary, full: joinParts([primary, secondary]) };
}

function featureToPlace(feature) {
  const [lng, lat] = feature.geometry.coordinates;
  const p = feature.properties ?? {};
  const { primary, secondary, full } = formatPlace(p);
  return {
    id: `${p.osm_type ?? 'x'}${p.osm_id ?? Math.random().toString(36).slice(2)}`,
    primary,
    secondary,
    address: full,
    lat,
    lng,
    kind: p.osm_value || p.type || '',
  };
}

async function getJson(url, signal) {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoder answered ${res.status}`);
  return res.json();
}

/**
 * Autocomplete suggestions for a partial address.
 * `bias` ({lat,lng}) nudges results toward an area, e.g. the map centre.
 */
export async function suggest(query, { signal, bias, limit = 6 } = {}) {
  const url = new URL(`${BASE}/api/`);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  if (bias) {
    url.searchParams.set('lat', String(bias.lat));
    url.searchParams.set('lon', String(bias.lng));
  }
  const json = await getJson(url, signal);
  const seen = new Set();
  const out = [];
  for (const f of json.features ?? []) {
    const place = featureToPlace(f);
    const key = `${place.lat.toFixed(4)},${place.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(place);
  }
  return out;
}

/** Nearest known address for a coordinate. Returns null when nothing is close. */
export async function reverse(lat, lng, { signal } = {}) {
  const url = new URL(`${BASE}/reverse`);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('limit', '1');
  const json = await getJson(url, signal);
  const f = json.features?.[0];
  return f ? featureToPlace(f) : null;
}
