import { TransformRequestManager } from '@maplibre/maplibre-react-native';
import { OSM_USER_AGENT } from '../config/osmTiles';

let configured = false;

/**
 * One-time MapLibre HTTP transforms: HTTPS + identifiable User-Agent for OSM tiles.
 * Relies on MapLibre Native's built-in HTTP cache (no offline pack / bulk download).
 */
export function configureOsmTileRequests(): void {
  if (configured) return;
  configured = true;

  TransformRequestManager.addUrlTransform({
    id: 'maison-osm-https',
    find: '^http://',
    replace: 'https://',
  });

  TransformRequestManager.addHeader({
    id: 'maison-osm-user-agent',
    name: 'User-Agent',
    value: OSM_USER_AGENT,
    match: 'tile\\.openstreetmap\\.org',
  });
}
