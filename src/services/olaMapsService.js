/**
 * Ola Maps Service - PROXY to Google Maps Service
 * Maintains backward compatibility for existing routes while using Google Maps
 */

const googleMapsService = require('./googleMapsService');

/**
 * Get directions between two points
 * @param {Object} origin - { lat, lng }
 * @param {Object} destination - { lat, lng }
 * @param {string} mode - driving, walking, biking, auto
 */
exports.getDirections = async (origin, destination, mode = 'driving') => {
    // Ignore mode for now as Google Maps default is driving, or pass it if needed
    try {
        const result = await googleMapsService.getDirections(origin, destination);
        // Transform result if necessary to match old Ola structure?
        // Google service returns { distance, duration, polyline, steps... }
        // Old Ola service returned similar structure.
        return result;
    } catch (error) {
        console.error('Ola(Google) proxy getDirections error:', error.message);
        throw error;
    }
};

/**
 * Get distance and duration between two points
 */
exports.getDistanceMatrix = async (origin, destination) => {
    return googleMapsService.getDistanceMatrix(origin, destination);
};

/**
 * Geocode an address to coordinates
 */
exports.geocodeAddress = async (address) => {
    return googleMapsService.geocode(address);
};


exports.reverseGeocode = async (lat, lng) => {
    return googleMapsService.reverseGeocode(lat, lng);
};


exports.searchPlaces = async (query, location = null) => {
    return googleMapsService.searchPlaces(query, location);
};

/**
 * Get place details by place ID
 */
exports.getPlaceDetails = async (placeId) => {
    return googleMapsService.getPlaceDetails(placeId);
};

/**
 * Extract city from address components
 * Using the helper from Google Maps service if exposed, or recreating it
 */
exports.extractCity = (components) => {
    if (!components) return '';
    const city = components.find(c => 
        c.types.includes('locality') || 
        c.types.includes('administrative_area_level_2')
    );
    return city?.long_name || city?.short_name || '';
};


exports.extractState = (components) => {
    if (!components) return '';
    const state = components.find(c => 
        c.types.includes('administrative_area_level_1')
    );
    return state?.long_name || state?.short_name || '';
};


exports.calculateFare = (distanceKm, vehicleType, tripType = 'drop') => {
    
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

exports.getAccessToken = async () => 'dummy_token';

module.exports = exports;
