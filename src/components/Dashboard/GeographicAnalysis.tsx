import { useEffect, useRef, useMemo, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ProcessedCallRecord } from '@/types/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, AlertCircle, Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGeocoding } from '@/hooks/useGeocoding';

interface GeographicAnalysisProps {
  data: ProcessedCallRecord[];
  locationCol?: string; // Geconfigureerd locatieveld uit mapping config
}

// Dutch city coordinates (approximate)
const DUTCH_CITIES: Record<string, [number, number]> = {
  amsterdam: [4.9041, 52.3676],
  rotterdam: [4.4777, 51.9244],
  'den haag': [4.3007, 52.0705],
  's-gravenhage': [4.3007, 52.0705],
  utrecht: [5.1214, 52.0907],
  eindhoven: [5.4697, 51.4416],
  groningen: [6.5665, 53.2194],
  tilburg: [5.0913, 51.5555],
  almere: [5.2647, 52.3508],
  breda: [4.7760, 51.5719],
  nijmegen: [5.8372, 51.8126],
  arnhem: [5.8987, 51.9851],
  haarlem: [4.6462, 52.3874],
  enschede: [6.8936, 52.2215],
  apeldoorn: [5.9699, 52.2112],
  amersfoort: [5.3878, 52.1561],
  zaanstad: [4.8184, 52.4575],
  zaandam: [4.8166, 52.4389],
  'den bosch': [5.3055, 51.6978],
  's-hertogenbosch': [5.3055, 51.6978],
  zwolle: [6.0830, 52.5168],
  maastricht: [5.6909, 50.8514],
  leiden: [4.4971, 52.1601],
  dordrecht: [4.6901, 51.8133],
  zoetermeer: [4.4931, 52.0575],
  emmen: [6.8914, 52.7792],
  deventer: [6.1552, 52.2660],
  delft: [4.3571, 52.0116],
  leeuwarden: [5.7836, 53.2012],
  alkmaar: [4.7490, 52.6324],
  venlo: [6.1683, 51.3704],
  heerlen: [5.9814, 50.8882],
  assen: [6.5553, 52.9925],
  hilversum: [5.1753, 52.2292],
  gouda: [4.7106, 52.0115],
  oss: [5.5378, 51.7651],
  roosendaal: [4.4494, 51.5308],
  helmond: [5.6552, 51.4756],
  purmerend: [4.9576, 52.5054],
  vlaardingen: [4.3420, 51.9125],
  'den helder': [4.7593, 52.9592],
  lelystad: [5.4714, 52.5185],
  middelburg: [3.6136, 51.4988],
  goes: [3.8911, 51.5043],
  veenendaal: [5.5575, 52.0276],
  harderwijk: [5.6200, 52.3511],
  hoorn: [5.0594, 52.6424],
  zeist: [5.2316, 52.0894],
  woerden: [4.8893, 52.0857],
  baarn: [5.2887, 52.2114],
  nunspeet: [5.7884, 52.3773],
  ermelo: [5.6226, 52.3013],
  doetinchem: [6.2882, 51.9643],
  tiel: [5.4318, 51.8867],
  gorinchem: [4.9702, 51.8358],
  barneveld: [5.5841, 52.1405],
  raalte: [6.2748, 52.3871],
  dalfsen: [6.2531, 52.5068],
  // Extra steden
  klundert: [4.5319, 51.6595],
  laren: [5.2275, 52.2568],
  gasselte: [6.7840, 52.9549],
  weesp: [5.0420, 52.3076],
  westervoort: [5.9700, 51.9550],
  rozendaal: [5.9622, 52.0108],
  'alphen aan den rijn': [4.6579, 52.1292],
  'sint jansklooster': [6.0425, 52.6750],
  heesch: [5.5249, 51.7350],
  'de lier': [4.2536, 51.9717],
  harmelen: [4.9628, 52.0892],
  wieringerwerf: [5.0339, 52.8506],
  urk: [5.6000, 52.6622],
  ijsselstein: [5.0420, 52.0235],
  amstelveen: [4.8634, 52.3008],
  drachten: [6.1015, 53.1082],
  zwijndrecht: [4.6333, 51.8167],
  'tull en t waal': [5.1475, 52.0089],
  almelo: [6.6683, 52.3567],
  schiedam: [4.3897, 51.9225],
  spijkenisse: [4.3291, 51.8450],
  capelle: [4.5780, 51.9292],
  'capelle aan den ijssel': [4.5780, 51.9292],
  nieuwegein: [5.0836, 52.0286],
  'bergen op zoom': [4.2917, 51.4950],
  veghel: [5.5469, 51.6167],
  uden: [5.6189, 51.6606],
  cuijk: [5.8783, 51.7272],
  boxmeer: [5.9472, 51.6456],
  weert: [5.7083, 51.2517],
  roermond: [5.9875, 51.1942],
  sittard: [5.8681, 50.9997],
  geleen: [5.8283, 50.9744],
  kerkrade: [6.0625, 50.8656],
  landgraaf: [6.0231, 50.8892],
  hengelo: [6.7933, 52.2656],
  oldenzaal: [6.9286, 52.3131],
  hardenberg: [6.6217, 52.5750],
  hoogeveen: [6.4756, 52.7239],
  meppel: [6.1936, 52.6956],
  steenwijk: [6.1167, 52.7867],
  kampen: [5.9117, 52.5550],
  elburg: [5.8350, 52.4461],
  hattem: [6.0672, 52.4750],
  epe: [5.9833, 52.3500],
  vaassen: [5.9617, 52.2867],
  heerde: [6.0417, 52.3917],
  wapenveld: [6.0667, 52.4333],
  'de bilt': [5.1808, 52.1083],
  bilthoven: [5.2000, 52.1333],
  bunnik: [5.1983, 52.0667],
  culemborg: [5.2283, 51.9550],
  vianen: [5.0917, 51.9883],
  houten: [5.1683, 52.0283],
  'nieuwerkerk aan den ijssel': [4.6183, 51.9667],
  waddinxveen: [4.6533, 52.0450],
  bodegraven: [4.7483, 52.0850],
  boskoop: [4.6583, 52.0750],
  naaldwijk: [4.2033, 51.9933],
  'monster': [4.1683, 52.0283],
  wateringen: [4.2883, 52.0167],
  rijswijk: [4.3250, 52.0383],
  voorburg: [4.3583, 52.0717],
  leidschendam: [4.3917, 52.0833],
  wassenaar: [4.4017, 52.1450],
  katwijk: [4.4017, 52.2000],
  noordwijk: [4.4433, 52.2367],
  lisse: [4.5567, 52.2583],
  sassenheim: [4.5233, 52.2267],
  voorhout: [4.4867, 52.2217],
  noordwijkerhout: [4.4933, 52.2617],
  hillegom: [4.5833, 52.2917],
  bennebroek: [4.6017, 52.3217],
  heemstede: [4.6250, 52.3517],
  bloemendaal: [4.6200, 52.4033],
  zandvoort: [4.5333, 52.3750],
  hoofddorp: [4.6889, 52.3025],
  schiphol: [4.7642, 52.3086],
  badhoevedorp: [4.7833, 52.3417],
  zwanenburg: [4.7500, 52.3750],
  halfweg: [4.7500, 52.3917],
  santpoort: [4.6333, 52.4333],
  driehuis: [4.6333, 52.4500],
  beverwijk: [4.6567, 52.4833],
  heemskerk: [4.6667, 52.5167],
  uitgeest: [4.7083, 52.5267],
  akersloot: [4.7333, 52.5583],
  castricum: [4.6617, 52.5467],
  limmen: [4.7000, 52.5683],
  egmond: [4.6283, 52.6183],
  bergen: [4.7000, 52.6667],
  schoorl: [4.6833, 52.7000],
  callantsoog: [4.6917, 52.8417],
  julianadorp: [4.7333, 52.8917],
  'anna paulowna': [4.8167, 52.8617],
  breezand: [4.8000, 52.8917],
  wieringen: [4.9333, 52.9083],
  hippolytushoef: [4.9667, 52.9250],
  oosterland: [4.7583, 52.9583],
  schagen: [4.7983, 52.7883],
  tuitjenhorn: [4.7500, 52.7667],
  warmenhuizen: [4.7333, 52.7167],
  harenkarspel: [4.7667, 52.7333],
  langedijk: [4.7833, 52.6833],
  'sint pancras': [4.8000, 52.6667],
  koedijk: [4.7500, 52.6333],
  heiloo: [4.7000, 52.6000],
  scharwoude: [4.9833, 52.6333],
  oudkarspel: [4.8000, 52.6917],
};

// Check if value is a Dutch postcode (4 digits + 2 letters)
const isPostcode = (val: string): boolean => /^\d{4}\s?[A-Za-z]{2}$/.test(val.trim());

const getCoordinatesForCity = (city: string): [number, number] | null => {
  // Normalize: lowercase, trim, handle apostrophes
  const normalized = city.toLowerCase().trim()
    .replace(/['´`]/g, "'")
    .replace(/\s+/g, ' ');
  
  // Direct match
  if (DUTCH_CITIES[normalized]) return DUTCH_CITIES[normalized];
  
  // Try without apostrophe
  const withoutApostrophe = normalized.replace(/'/g, '');
  for (const [key, coords] of Object.entries(DUTCH_CITIES)) {
    if (key === withoutApostrophe || key.replace(/'/g, '') === withoutApostrophe) {
      return coords;
    }
  }
  
  // Try partial match both ways
  for (const [key, coords] of Object.entries(DUTCH_CITIES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return coords;
    }
  }
  return null;
};

export const GeographicAnalysis = ({ data, locationCol }: GeographicAnalysisProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Extract location data from records - Phase 1: get all cities and stats
  const { cityStats, unknownCities, recordsWithLocation, totalRecords } = useMemo(() => {
    const stats: Record<string, { calls: number; sales: number; annualValue: number }> = {};
    const unknown: string[] = [];
    let withLocation = 0;

    data.forEach((record) => {
      // FIX: Haal locatie uit raw_data, niet direct uit record
      const rawData = (record as any).raw_data || record;
      if (!rawData) return;
      
      // Als locationCol geconfigureerd is, gebruik dat veld, anders fallback naar auto-detectie
      let city: string | undefined;
      
      if (locationCol && locationCol.trim()) {
        // Gebruik het geconfigureerde veld
        city = rawData[locationCol];
      } else {
        // Fallback: probeer meerdere mogelijke veldnamen
        city = 
          rawData.Plaats || 
          rawData.plaats || 
          rawData.Post_Woonplaats ||
          rawData.post_woonplaats ||
          rawData.Woonplaats ||
          rawData.woonplaats ||
          rawData.stad ||
          rawData.Stad ||
          rawData.city ||
          rawData.City;
      }
        
      // Filter out postcodes (4 digits + 2 letters)
      if (city && typeof city === 'string' && city.trim() && !isPostcode(city)) {
        withLocation++;
        const normalized = city.toLowerCase().trim();
        
        if (!stats[normalized]) {
          stats[normalized] = { calls: 0, sales: 0, annualValue: 0 };
        }
        
        stats[normalized].calls++;
        if (record.is_sale) {
          stats[normalized].sales++;
          stats[normalized].annualValue += record.annual_value;
        }
        
        // Check if we need to geocode this city
        if (!getCoordinatesForCity(normalized) && !unknown.includes(normalized)) {
          unknown.push(normalized);
        }
      }
    });

    return { cityStats: stats, unknownCities: unknown, recordsWithLocation: withLocation, totalRecords: data.length };
  }, [data, locationCol]);

  // Geocode unknown cities
  const { geocodedCoordinates, isLoading: isGeocoding } = useGeocoding(unknownCities);

  // Phase 2: Build locations with both static and geocoded coordinates
  const locationData = useMemo(() => {
    const locations = Object.entries(cityStats)
      .map(([city, stats]) => {
        // First try static coordinates, then geocoded
        const coords = getCoordinatesForCity(city) || geocodedCoordinates[city] || null;
        return coords ? {
          city: city.charAt(0).toUpperCase() + city.slice(1),
          ...stats,
          conversion: stats.calls > 0 ? (stats.sales / stats.calls) * 100 : 0,
          coordinates: coords,
          isGeocoded: !getCoordinatesForCity(city),
        } : null;
      })
      .filter((l): l is NonNullable<typeof l> => l !== null)
      .sort((a, b) => b.sales - a.sales);

    return { locations, recordsWithLocation, totalRecords };
  }, [cityStats, geocodedCoordinates, recordsWithLocation, totalRecords]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = 'pk.eyJ1Ijoic2l0ZWpvYi1ubCIsImEiOiJjbWQzZ29pYngwNDN5MmpxbmNldTN1c3ZmIn0.unL-G3gacXta2WVCKK6Rcg';

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [5.2913, 52.1326], // Center of Netherlands
      zoom: 6.5,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      setMapLoaded(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Add markers when map is loaded and data changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Remove existing markers
    const existingMarkers = document.querySelectorAll('.mapboxgl-marker');
    existingMarkers.forEach((m) => m.remove());

    // Add markers for each location
    locationData.locations.forEach((location) => {
      const color = location.conversion >= 10 ? '#22c55e' : 
                    location.conversion >= 5 ? '#eab308' : '#ef4444';
      
      const el = document.createElement('div');
      el.className = 'flex items-center justify-center';
      el.style.width = `${Math.min(20 + location.sales * 2, 50)}px`;
      el.style.height = `${Math.min(20 + location.sales * 2, 50)}px`;
      el.style.backgroundColor = color;
      el.style.borderRadius = '50%';
      el.style.border = '3px solid white';
      el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.color = 'white';
      el.style.fontSize = '12px';
      el.style.fontWeight = 'bold';
      el.innerHTML = location.sales.toString();

      new mapboxgl.Marker(el)
        .setLngLat(location.coordinates)
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(`
            <div style="padding: 8px;">
              <h3 style="font-weight: bold; margin-bottom: 4px;">${location.city}</h3>
              <p style="margin: 2px 0;"><strong>Calls:</strong> ${location.calls}</p>
              <p style="margin: 2px 0;"><strong>Sales:</strong> ${location.sales}</p>
              <p style="margin: 2px 0;"><strong>Conversie:</strong> ${location.conversion.toFixed(1)}%</p>
              <p style="margin: 2px 0;"><strong>Jaarwaarde:</strong> €${location.annualValue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
            </div>
          `)
        )
        .addTo(map.current!);
    });
  }, [locationData, mapLoaded]);

  const coveragePercent = locationData.totalRecords > 0 
    ? ((locationData.recordsWithLocation / locationData.totalRecords) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      {/* Coverage warning */}
      <div className="bg-muted/50 border border-border rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="text-muted-foreground mt-0.5" size={20} />
        <div>
          <p className="text-sm text-muted-foreground">
            <strong>{locationData.recordsWithLocation}</strong> van <strong>{locationData.totalRecords}</strong> records 
            hebben locatiedata ({coveragePercent}%). 
            {isGeocoding && (
              <span className="inline-flex items-center gap-1 ml-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Onbekende steden worden opgezocht...
              </span>
            )}
            {!isGeocoding && unknownCities.length > 0 && Object.keys(geocodedCoordinates).length > 0 && (
              <span className="text-green-600 ml-2">
                {Object.keys(geocodedCoordinates).length} steden via geocoding gevonden!
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Map */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin size={20} className="text-primary" />
            Geografische Spreiding
            {isGeocoding && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div 
            ref={mapContainer} 
            className="h-[400px] rounded-lg overflow-hidden border border-border"
          />
          <div className="flex items-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-500" />
              <span className="text-muted-foreground">Conversie ≥10%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-yellow-500" />
              <span className="text-muted-foreground">Conversie 5-10%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-red-500" />
              <span className="text-muted-foreground">Conversie &lt;5%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top locations table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Top Locaties</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plaats</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Conversie</TableHead>
                <TableHead className="text-right">Jaarwaarde</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locationData.locations.slice(0, 10).map((loc) => (
                <TableRow key={loc.city}>
                  <TableCell className="font-medium">{loc.city}</TableCell>
                  <TableCell className="text-right">{loc.calls}</TableCell>
                  <TableCell className="text-right">{loc.sales}</TableCell>
                  <TableCell className="text-right">{loc.conversion.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">
                    €{loc.annualValue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
              {locationData.locations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Geen locatiedata beschikbaar
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
