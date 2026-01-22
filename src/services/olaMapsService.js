/**
 * Ola Maps API Service
 * Provides geocoding, directions, distance matrix, and place search functionality
 */

const axios = require('axios');

const OLA_MAPS_CONFIG = {
    clientId: process.env.OLA_MAPS_CLIENT_ID,
    apiKey: process.env.OLA_MAPS_API_KEY,
    clientSecret: process.env.OLA_MAPS_CLIENT_SECRET,
    baseUrl: process.env.OLA_MAPS_API_BASE_URL || 'https://api.olamaps.io'
};

let accessToken = null;
let tokenExpiry = null;

/**
 * Get OAuth access token from Ola Maps
 */
const getAccessToken = async () => {
    try {
        // Check if we have a valid token
        if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
            return accessToken;
        }

        const response = await axios.post(
            `https://account.olamaps.io/realms/olamaps/protocol/openid-connect/token`,
            new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: OLA_MAPS_CONFIG.clientId,
                client_secret: OLA_MAPS_CONFIG.clientSecret,
                scope: 'openid email profile offline_access roles'
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        accessToken = response.data.access_token;
        // Set expiry 5 minutes before actual expiry
        tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
        
        return accessToken;
    } catch (error) {
        console.error('Error getting Ola Maps access token:', error.message);
        throw error;
    }
};

/**
 * Get directions between two points
 * @param {Object} origin - { lat, lng }
 * @param {Object} destination - { lat, lng }
 * @param {string} mode - driving, walking, biking, auto
 */
const getDirections = async (origin, destination, mode = 'driving') => {
    try {
        const token = await getAccessToken();
        
        const response = await axios.post(
            `${OLA_MAPS_CONFIG.baseUrl}/routing/v1/directions`,
            {}, // Empty body
            {
                params: {
                    origin: `${origin.lat},${origin.lng}`,
                    destination: `${destination.lat},${destination.lng}`,
                    mode: mode,
                    api_key: OLA_MAPS_CONFIG.apiKey
                },
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        const route = response.data.routes?.[0];
        if (route) {
            // Extract polyline - handle both string and object formats
            let polyline = null;
            if (route.overview_polyline) {
                // Could be a string directly or an object with 'points' property
                if (typeof route.overview_polyline === 'string') {
                    polyline = route.overview_polyline;
                } else if (route.overview_polyline.points) {
                    polyline = route.overview_polyline.points;
                } else {
                    // Try to stringify if it's a different format
                    polyline = JSON.stringify(route.overview_polyline);
                }
            }
            
            console.log('Ola Maps API returned polyline:', polyline ? 'YES (' + polyline.length + ' chars)' : 'NO');
            
            return {
                distance: route.legs?.[0]?.distance?.value / 1000, // in km
                duration: route.legs?.[0]?.duration?.value / 60, // in minutes
                polyline: polyline,
                steps: route.legs?.[0]?.steps || []
            };
        }
        
        // Fallback to Haversine calculation
        console.log('No route found in response, using Haversine fallback');
        return calculateHaversineRoute(origin, destination);
    } catch (error) {
        console.error('Error getting directions:', error.message);
        // Fallback to Haversine distance calculation
        return calculateHaversineRoute(origin, destination);
    }
};

/**
 * Calculate distance using Haversine formula (fallback when API unavailable)
 */
const calculateHaversineRoute = (origin, destination) => {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(destination.lat - origin.lat);
    const dLng = toRad(destination.lng - origin.lng);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(origin.lat)) * Math.cos(toRad(destination.lat)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    // Estimate duration based on average speed of 30 km/h for city driving
    const duration = (distance / 30) * 60; // in minutes
    
    return {
        distance: Math.round(distance * 10) / 10,
        duration: Math.round(duration),
        polyline: null,
        steps: [],
        isFallback: true
    };
};

const toRad = (deg) => deg * (Math.PI / 180);

/**
 * Get distance and duration between two points
 */
const getDistanceMatrix = async (origin, destination) => {
    try {
        const token = await getAccessToken();
        
        const response = await axios.get(
            `${OLA_MAPS_CONFIG.baseUrl}/routing/v1/distanceMatrix`,
            {
                params: {
                    origins: `${origin.lat},${origin.lng}`,
                    destinations: `${destination.lat},${destination.lng}`,
                    api_key: OLA_MAPS_CONFIG.apiKey
                },
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        const element = response.data.rows?.[0]?.elements?.[0];
        if (element && element.status === 'OK') {
            return {
                distance: element.distance?.value / 1000, // in km
                duration: element.duration?.value / 60 // in minutes
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error getting distance matrix:', error.message);
        throw error;
    }
};

/**
 * Geocode an address to coordinates
 */
const geocodeAddress = async (address) => {
    try {
        const token = await getAccessToken();
        
        const response = await axios.get(
            `${OLA_MAPS_CONFIG.baseUrl}/places/v1/geocode`,
            {
                params: {
                    address: address,
                    api_key: OLA_MAPS_CONFIG.apiKey
                },
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        const result = response.data.geocodingResults?.[0];
        if (result) {
            return {
                lat: result.geometry?.location?.lat,
                lng: result.geometry?.location?.lng,
                formattedAddress: result.formatted_address,
                city: extractCity(result.address_components)
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error geocoding address:', error.message);
        throw error;
    }
};

/**
 * Reverse geocode coordinates to address
 */
const reverseGeocode = async (lat, lng) => {
    try {
        const token = await getAccessToken();
        
        const response = await axios.get(
            `${OLA_MAPS_CONFIG.baseUrl}/places/v1/reverse-geocode`,
            {
                params: {
                    latlng: `${lat},${lng}`,
                    api_key: OLA_MAPS_CONFIG.apiKey
                },
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        const result = response.data.results?.[0];
        if (result) {
            return {
                formattedAddress: result.formatted_address,
                city: extractCity(result.address_components),
                state: extractState(result.address_components),
                components: result.address_components
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error reverse geocoding:', error.message);
        throw error;
    }
};

/**
 * Search for places (autocomplete)
 */
const searchPlaces = async (query, location = null) => {
    try {
        const token = await getAccessToken();
        
        const params = {
            input: query,
            api_key: OLA_MAPS_CONFIG.apiKey
        };
        
        if (location) {
            params.location = `${location.lat},${location.lng}`;
            params.radius = 50000; // 50km radius
        }
        
        const response = await axios.get(
            `${OLA_MAPS_CONFIG.baseUrl}/places/v1/autocomplete`,
            {
                params,
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        return response.data.predictions?.map(p => ({
            placeId: p.place_id,
            description: p.description,
            mainText: p.structured_formatting?.main_text,
            secondaryText: p.structured_formatting?.secondary_text
        })) || [];
    } catch (error) {
        console.error('Error searching places:', error.message);
        throw error;
    }
};

/**
 * Get place details by place ID
 */
const getPlaceDetails = async (placeId) => {
    try {
        const token = await getAccessToken();
        
        const response = await axios.get(
            `${OLA_MAPS_CONFIG.baseUrl}/places/v1/details`,
            {
                params: {
                    place_id: placeId,
                    api_key: OLA_MAPS_CONFIG.apiKey
                },
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        const result = response.data.result;
        if (result) {
            return {
                lat: result.geometry?.location?.lat,
                lng: result.geometry?.location?.lng,
                formattedAddress: result.formatted_address,
                name: result.name,
                city: extractCity(result.address_components)
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error getting place details:', error.message);
        throw error;
    }
};

/**
 * Extract city from address components
 */
const extractCity = (addressComponents) => {
    if (!addressComponents) return null;
    
    const cityComponent = addressComponents.find(c => 
        c.types?.includes('locality') || 
        c.types?.includes('administrative_area_level_2')
    );
    
    return cityComponent?.long_name || null;
};

/**
 * Extract state from address components
 */
const extractState = (addressComponents) => {
    if (!addressComponents) return null;
    
    const stateComponent = addressComponents.find(c => 
        c.types?.includes('administrative_area_level_1')
    );
    
    return stateComponent?.long_name || null;
};

/**
 * Calculate fare based on distance and vehicle type
 */
const calculateFare = (distanceKm, vehicleType, tripType = 'drop') => {
    // Base rates per vehicle type
    const rates = {
        'Sedan': { base: 100, perKm: 15 },
        'SUV': { base: 150, perKm: 20 },
        'Hatchback': { base: 80, perKm: 12 },
        'Auto': { base: 50, perKm: 10 },
        'Tempo': { base: 200, perKm: 25 },
        'Mini Truck': { base: 300, perKm: 30 }
    };

    const rate = rates[vehicleType] || rates['Sedan'];
    let fare = rate.base + (distanceKm * rate.perKm);

    // Apply trip type multiplier
    if (tripType === 'round') {
        fare *= 1.8;
    } else if (tripType === 'rental') {
        fare *= 2.5;
    }

    return Math.round(fare);
};

module.exports = {
    getAccessToken,
    getDirections,
    getDistanceMatrix,
    geocodeAddress,
    reverseGeocode,
    searchPlaces,
    getPlaceDetails,
    extractCity,
    extractState,
    calculateFare
};
