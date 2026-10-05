import Config from 'react-native-config';

/** Google Maps SDK key — set GOOGLE_MAPS_API_KEY in project root .env */
export const GOOGLE_MAPS_API_KEY = (Config.GOOGLE_MAPS_API_KEY ?? 'AIzaSyAwp943w5W86G15dfllOzwRrGmQDHz_XuE').trim();

export const hasGoogleMapsApiKey = GOOGLE_MAPS_API_KEY.length > 0;
