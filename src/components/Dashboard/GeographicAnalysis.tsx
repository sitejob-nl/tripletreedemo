import { useEffect, useRef, useMemo, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ProcessedCallRecord } from '@/types/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, AlertCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface GeographicAnalysisProps {
  data: ProcessedCallRecord[];
}

// Dutch city coordinates (approximate)
const DUTCH_CITIES: Record<string, [number, number]> = {
  amsterdam: [4.9041, 52.3676],
  rotterdam: [4.4777, 51.9244],
  'den haag': [4.3007, 52.0705],
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
  'den bosch': [5.3055, 51.6978],
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
};

const getCoordinatesForCity = (city: string): [number, number] | null => {
  const normalized = city.toLowerCase().trim();
  if (DUTCH_CITIES[normalized]) return DUTCH_CITIES[normalized];
  
  // Try partial match
  for (const [key, coords] of Object.entries(DUTCH_CITIES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return coords;
    }
  }
  return null;
};

export const GeographicAnalysis = ({ data }: GeographicAnalysisProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Extract location data from records
  const locationData = useMemo(() => {
    const cityStats: Record<string, { calls: number; sales: number; annualValue: number }> = {};
    let recordsWithLocation = 0;

    data.forEach((record) => {
      const city = (record as any).Plaats || (record as any).plaats;
      if (city && typeof city === 'string' && city.trim()) {
        recordsWithLocation++;
        const normalized = city.toLowerCase().trim();
        
        if (!cityStats[normalized]) {
          cityStats[normalized] = { calls: 0, sales: 0, annualValue: 0 };
        }
        
        cityStats[normalized].calls++;
        if (record.is_sale) {
          cityStats[normalized].sales++;
          cityStats[normalized].annualValue += record.annual_value;
        }
      }
    });

    // Convert to array with coordinates
    const locations = Object.entries(cityStats)
      .map(([city, stats]) => {
        const coords = getCoordinatesForCity(city);
        return coords ? {
          city: city.charAt(0).toUpperCase() + city.slice(1),
          ...stats,
          conversion: stats.calls > 0 ? (stats.sales / stats.calls) * 100 : 0,
          coordinates: coords,
        } : null;
      })
      .filter((l): l is NonNullable<typeof l> => l !== null)
      .sort((a, b) => b.sales - a.sales);

    return { locations, recordsWithLocation, totalRecords: data.length };
  }, [data]);

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
            hebben locatiedata ({coveragePercent}%). Alleen records met bekende plaatsen worden getoond.
          </p>
        </div>
      </div>

      {/* Map */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin size={20} className="text-primary" />
            Geografische Spreiding
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
