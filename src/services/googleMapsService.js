/**
 * Google Maps Service - Replaces Ola Maps
 * Uses Google Maps Platform APIs with caching and OSRM fallback
 * 
 * Features:
 * - NodeCache for in-memory caching (24h routes, 7d geocoding)
 * - Google Directions API
 * - Google Geocoding API
 * - Google Places API
 * - OSRM fallback when Google APIs fail
 */

const { Client } = require('@googlemaps/google-maps-services-js');
const axios = require('axios');
const NodeCache = require('node-cache');

// Initialize Google Maps client
const googleMapsClient = new Client({});
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// In-memory caches
const routeCache = new NodeCache({ stdTTL: 86400, checkperiod: 120 }); // 24 hours
const geoCache = new NodeCache({ stdTTL: 604800, checkperiod: 300 }); // 7 days
const placesCache = new NodeCache({ stdTTL: 3600, checkperiod: 60 }); // 1 hour

/**
 * Get Directions using Google Maps API
 * Falls back to OSRM if Google fails
 */
exports.getDirections = async (origin, destination) => {
    // Create cache key
    const cacheKey = `route:${origin.lat.toFixed(3)}:${origin.lng.toFixed(3)}:${destination.lat.toFixed(3)}:${destination.lng.toFixed(3)}`;
    
    // Check cache first
    const cached = routeCache.get(cacheKey);
    if (cached) {
        console.log('📦 Route served from cache');
        cached.cached = true;
        return cached;
    }
    
    try {
        // Call Google Directions API
        console.log('🗺️ Fetching route from Google Maps...');
        const response = await googleMapsClient.directions({
            params: {
                origin: `${origin.lat},${origin.lng}`,
                destination: `${destination.lat},${destination.lng}`,
                mode: 'driving',
                key: GOOGLE_API_KEY
            },
            timeout: 10000
        });
        
        if (response.data.status !== 'OK' || !response.data.routes[0]) {
            throw new Error(`Google Maps API returned: ${response.data.status}`);
        }
        
        const route = response.data.routes[0].legs[0];
        const data = {
            distance: route.distance.value / 1000, // Convert meters to km
            duration: route.duration.value / 60, // Convert seconds to minutes
            polyline: response.data.routes[0].overview_polyline.points,
            provider: 'google',
            cached: false
        };
        
        // Cache the result
        routeCache.set(cacheKey, data);
        console.log('✅ Google Maps route fetched successfully');
        return data;
        
    } catch (error) {
        console.error('❌ Google Maps failed:', error.message);
        
        // Fallback to OSRM (free, unlimited)
        console.log('🔄 Falling back to OSRM...');
        try {
            const response = await axios.get(
                `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`,
                {
                    params: {
                        overview: 'full',
                        geometries: 'polyline'
                    },
                    timeout: 10000
                }
            );
            
            const route = response.data.routes[0];
            const data = {
                distance: route.distance / 1000, // meters to km
                duration: route.duration / 60, // seconds to minutes  
                polyline: route.geometry,
                provider: 'osrm_fallback',
                cached: false
            };
            
            // Cache fallback result (shorter TTL - 6 hours)
            routeCache.set(cacheKey, data, 21600);
            console.log('✅ OSRM fallback successful');
            return data;
            
        } catch (fallbackError) {
            console.error('❌ OSRM fallback failed:', fallbackError.message);
            throw new Error('All routing providers failed');
        }
    }
};

/**
 * Geocode Address to Coordinates
 */
exports.geocode = async (address) => {
    const cacheKey = `geo:${Buffer.from(address).toString('base64').substring(0, 100)}`;
    
    // Check cache
    const cached = geoCache.get(cacheKey);
    if (cached) {
        console.log('📦 Geocode served from cache');
        return cached;
    }
    
    try {
        const response = await googleMapsClient.geocode({
            params: {
                address: address,
                key: GOOGLE_API_KEY
            },
            timeout: 10000
        });
        
        if (response.data.status !== 'OK' || !response.data.results[0]) {
            throw new Error(`Geocoding failed: ${response.data.status}`);
        }
        
        const result = response.data.results[0];
        const data = {
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng,
            address: result.formatted_address,
            placeId: result.place_id,
            provider: 'google'
        };
        
        // Cache for 7 days
        geoCache.set(cacheKey, data);
        return data;
        
    } catch (error) {
        console.error('Geocoding failed:', error.message);
        throw error;
    }
};

/**
 * Reverse Geocode (Coordinates to Address)
 */
exports.reverseGeocode = async (lat, lng) => {
    const cacheKey = `revgeo:${lat.toFixed(4)}:${lng.toFixed(4)}`;
    
    // Check cache
    const cached = geoCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    
    try {
        const response = await googleMapsClient.reverseGeocode({
            params: {
                latlng: `${lat},${lng}`,
                key: GOOGLE_API_KEY
            },
            timeout: 10000
        });
        
        if (response.data.status !== 'OK' || !response.data.results[0]) {
            throw new Error(`Reverse geocoding failed: ${response.data.status}`);
        }
        
        const result = response.data.results[0];
        const data = {
            address: result.formatted_address,
            city: extractCity(result.address_components),
            placeId: result.place_id,
            provider: 'google'
        };
        
        // Cache for 7 days
        geoCache.set(cacheKey, data);
        return data;
        
    } catch (error) {
        console.error('Reverse geocoding failed:', error.message);
        throw error;
    }
};

/**
 * Search Places (Autocomplete)
 */
exports.searchPlaces = async (query, location = null) => {
    const cacheKey = `search:${query}:${location ? `${location.lat}:${location.lng}` : 'global'}`;
    
    // Check cache
    const cached = placesCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    
    try {
        const params = {
            input: query,
            key: GOOGLE_API_KEY
        };
        
        // Add location bias if provided
        if (location) {
            params.location = `${location.lat},${location.lng}`;
            params.radius = 50000; // 50km radius
        }
        
        const response = await googleMapsClient.placeAutocomplete({
            params,
            timeout: 10000
        });
        
        if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
            throw new Error(`Place search failed: ${response.data.status}`);
        }
        
        const results = response.data.predictions.map(p => ({
            placeId: p.place_id,
            description: p.description,
            mainText: p.structured_formatting.main_text,
            secondaryText: p.structured_formatting.secondary_text
        }));
        
        // Cache for 1 hour
        placesCache.set(cacheKey, results);
        return results;
        
    } catch (error) {
        console.error('Place search failed:', error.message);
        return []; // Return empty array on error
    }
};

/**
 * Get Place Details by Place ID
 */
exports.getPlaceDetails = async (placeId) => {
    const cacheKey = `placedetails:${placeId}`;
    
    // Check cache
    const cached = placesCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    
    try {
        const response = await googleMapsClient.placeDetails({
            params: {
                place_id: placeId,
                fields: ['name', 'formatted_address', 'geometry', 'address_components'],
                key: GOOGLE_API_KEY
            },
            timeout: 10000
        });
        
        if (response.data.status !== 'OK' || !response.data.result) {
            throw new Error(`Place details failed: ${response.data.status}`);
        }
        
        const place = response.data.result;
        const data = {
            name: place.name,
            address: place.formatted_address,
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng,
            city: extractCity(place.address_components),
            placeId: placeId
        };
        
        // Cache for 7 days (place details are stable)
        geoCache.set(cacheKey, data);
        return data;
        
    } catch (error) {
        console.error('Place details failed:', error.message);
        throw error;
    }
};

/**
 * Get Distance Matrix
 */
exports.getDistanceMatrix = async (origin, destination) => {
    try {
        const response = await googleMapsClient.distancematrix({
            params: {
                origins: [`${origin.lat},${origin.lng}`],
                destinations: [`${destination.lat},${destination.lng}`],
                mode: 'driving',
                key: GOOGLE_API_KEY
            },
            timeout: 10000
        });
        
        if (response.data.status !== 'OK' || !response.data.rows[0].elements[0]) {
            throw new Error(`Distance matrix failed: ${response.data.status}`);
        }
        
        const element = response.data.rows[0].elements[0];
        return {
            distance: element.distance.value / 1000, // meters to km
            duration: element.duration.value / 60, // seconds to minutes
            distanceText: element.distance.text,
            durationText: element.duration.text
        };
        
    } catch (error) {
        console.error('Distance matrix failed:', error.message);
        throw error;
    }
};

// Helper: Extract city from address components
const extractCity = (components) => {
    if (!components) return '';
    const city = components.find(c => 
        c.types.includes('locality') || 
        c.types.includes('administrative_area_level_2')
    );
    return city?.long_name || city?.short_name || '';
};

module.exports = exports;
