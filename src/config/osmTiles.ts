/**
 * Public OSM raster tiles — fine for limited testing, not guaranteed production hosting.
 * Override via env later if needed; keep HTTPS.
 */
export const OSM_RASTER_TILE_URL =
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

/** Identifiable User-Agent for OSM tile requests (policy compliance). */
export const OSM_USER_AGENT =
  'MaisonRiderApp/1.0 (RapidDeliveryRider; delivery preview map)';

export function buildOsmRasterStyle(tileUrl: string = OSM_RASTER_TILE_URL) {
  return {
    version: 8 as const,
    name: 'maison-osm-raster',
    sources: {
      'osm-raster': {
        type: 'raster' as const,
        tiles: [tileUrl],
        tileSize: 256,
        attribution: OSM_ATTRIBUTION,
        // Prefer native HTTP cache; avoid aggressive prefetch.
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: 'osm-raster-layer',
        type: 'raster' as const,
        source: 'osm-raster',
        paint: {
          'raster-opacity': 1,
        },
      },
    ],
  };
}
