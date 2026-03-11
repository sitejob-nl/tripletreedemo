import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Cache voor geocoded steden (persistent in localStorage)
const CACHE_KEY = 'geocoded_cities_cache';

interface GeocodedCity {
  city: string;
  coordinates: [number, number] | null;
}

const getCache = (): Record<string, [number, number] | null> => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
};

const setCache = (cache: Record<string, [number, number] | null>) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage might be full or unavailable
  }
};

export const useGeocoding = (unknownCities: string[]) => {
  const [geocodedCoordinates, setGeocodedCoordinates] = useState<Record<string, [number, number]>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (unknownCities.length === 0) return;

    const cache = getCache();
    const citiesToFetch: string[] = [];
    const alreadyCached: Record<string, [number, number]> = {};

    // Check cache first
    unknownCities.forEach(city => {
      const normalized = city.toLowerCase().trim();
      if (cache[normalized] !== undefined) {
        if (cache[normalized] !== null) {
          alreadyCached[normalized] = cache[normalized] as [number, number];
        }
      } else {
        citiesToFetch.push(normalized);
      }
    });

    // Set cached results immediately
    if (Object.keys(alreadyCached).length > 0) {
      setGeocodedCoordinates(prev => ({ ...prev, ...alreadyCached }));
    }

    // Fetch unknown cities
    if (citiesToFetch.length === 0) return;

    const fetchCoordinates = async () => {
      setIsLoading(true);
      try {
        
        const { data, error } = await supabase.functions.invoke('geocode-city', {
          body: { cities: citiesToFetch }
        });

        if (error) {
          console.error('Geocoding error:', error);
          return;
        }

        if (data?.results) {
          const newCache = { ...cache };
          const newCoords: Record<string, [number, number]> = {};

          (data.results as GeocodedCity[]).forEach(result => {
            newCache[result.city] = result.coordinates;
            if (result.coordinates) {
              newCoords[result.city] = result.coordinates;
            }
          });

          setCache(newCache);
          setGeocodedCoordinates(prev => ({ ...prev, ...newCoords }));
        }
      } catch (error) {
        console.error('Error calling geocode function:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCoordinates();
  }, [unknownCities.join(',')]); // Re-run when cities change

  return { geocodedCoordinates, isLoading };
};
