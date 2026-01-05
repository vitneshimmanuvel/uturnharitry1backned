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
            `${OLA_MAPS_CONFIG.baseUrl}/oauth2/token`,
            new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: OLA_MAPS_CONFIG.clientId,
                client_secret: OLA_MAPS_CONFIG.clientSecret
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
        
        const response = await axios.get(
            `${OLA_MAPS_CONFIG.baseUrl}/routing/v1/directions`,
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
            return {
                distance: route.legs?.[0]?.distance?.value / 1000, // in km
                duration: route.legs?.[0]?.duration?.value / 60, // in minutes
                polyline: route.overview_polyline?.points,
                steps: route.legs?.[0]?.steps || []
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error getting directions:', error.message);
        throw error;
    }
};

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
