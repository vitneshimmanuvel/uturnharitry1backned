/**
 * Maps Service - Production Version with Google Maps
 * Uses Node-Cache for in-memory caching
 * 
 * Features:
 * - NodeCache caching (24h for routes, 7d for geocoding)
 * - Google Maps Platform APIs (primary)
 * - OSRM fallback when Google fails (free, unlimited)
 */

const googleMapsService = require('./googleMapsService');

// Re-export all Google Maps service functions
module.exports = googleMapsService;
