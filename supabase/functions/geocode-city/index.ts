import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapbox public token - centralized configuration
// Use environment variable if set, otherwise fallback to hardcoded publishable token
const MAPBOX_TOKEN = Deno.env.get('MAPBOX_PUBLIC_TOKEN') || 
  'pk.eyJ1Ijoic2l0ZWpvYi1ubCIsImEiOiJjbWQzZ29pYngwNDN5MmpxbmNldTN1c3ZmIn0.unL-G3gacXta2WVCKK6Rcg';

interface GeocodedCity {
  city: string;
  coordinates: [number, number] | null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cities } = await req.json();
    
    if (!Array.isArray(cities) || cities.length === 0) {
      return new Response(JSON.stringify({ error: 'cities array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Geocoding ${cities.length} cities`);

    // Limit to 50 cities per request to avoid rate limits
    const citiesToGeocode = cities.slice(0, 50);
    const results: GeocodedCity[] = [];

    for (const city of citiesToGeocode) {
      try {
        // Search specifically in the Netherlands
        const searchQuery = `${city}, Netherlands`;
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${MAPBOX_TOKEN}&country=nl&types=place,locality&limit=1`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.features && data.features.length > 0) {
          const [lng, lat] = data.features[0].center;
          console.log(`Found coordinates for ${city}: [${lng}, ${lat}]`);
          results.push({
            city: city.toLowerCase().trim(),
            coordinates: [lng, lat],
          });
        } else {
          console.log(`No coordinates found for ${city}`);
          results.push({
            city: city.toLowerCase().trim(),
            coordinates: null,
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Error geocoding ${city}:`, error);
        results.push({
          city: city.toLowerCase().trim(),
          coordinates: null,
        });
      }
    }

    console.log(`Successfully geocoded ${results.filter(r => r.coordinates).length}/${cities.length} cities`);

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in geocode-city function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
