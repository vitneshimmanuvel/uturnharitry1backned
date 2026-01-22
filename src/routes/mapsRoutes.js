/**
 * Ola Maps Routes
 * API endpoints for maps, directions, places, and geocoding
 */

const express = require('express');
const router = express.Router();
const olaMapsService = require('../services/olaMapsService');

/**
 * GET /api/maps/directions
 * Get route directions between two points
 * Query: origin (lat,lng), destination (lat,lng), mode (driving/walking/biking/auto)
 */
router.get('/directions', async (req, res) => {
    try {
        const { origin, destination, mode = 'driving' } = req.query;

        if (!origin || !destination) {
            return res.status(400).json({ error: 'Origin and destination are required' });
        }

        const [originLat, originLng] = origin.split(',').map(Number);
        const [destLat, destLng] = destination.split(',').map(Number);

        const directions = await olaMapsService.getDirections(
            { lat: originLat, lng: originLng },
            { lat: destLat, lng: destLng },
            mode
        );

        if (!directions) {
            return res.status(404).json({ error: 'No route found' });
        }

        res.json({
            success: true,
            data: directions
        });
    } catch (error) {
        console.error('Directions error:', error);
        res.status(500).json({ error: 'Failed to get directions' });
    }
});

/**
 * GET /api/maps/distance
 * Get distance and duration between two points
 * Query: origin (lat,lng), destination (lat,lng)
 */
router.get('/distance', async (req, res) => {
    try {
        const { origin, destination } = req.query;

        if (!origin || !destination) {
            return res.status(400).json({ error: 'Origin and destination are required' });
        }

        const [originLat, originLng] = origin.split(',').map(Number);
        const [destLat, destLng] = destination.split(',').map(Number);

        const result = await olaMapsService.getDistanceMatrix(
            { lat: originLat, lng: originLng },
            { lat: destLat, lng: destLng }
        );

        if (!result) {
            return res.status(404).json({ error: 'Could not calculate distance' });
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Distance error:', error);
        res.status(500).json({ error: 'Failed to calculate distance' });
    }
});

/**
 * GET /api/maps/geocode
 * Convert address to coordinates
 * Query: address
 */
router.get('/geocode', async (req, res) => {
    try {
        const { address } = req.query;

        if (!address) {
            return res.status(400).json({ error: 'Address is required' });
        }

        const result = await olaMapsService.geocodeAddress(address);

        if (!result) {
            return res.status(404).json({ error: 'Address not found' });
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Geocode error:', error);
        res.status(500).json({ error: 'Failed to geocode address' });
    }
});

/**
 * GET /api/maps/reverse-geocode
 * Convert coordinates to address
 * Query: lat, lng
 */
router.get('/reverse-geocode', async (req, res) => {
    try {
        const { lat, lng } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ error: 'Latitude and longitude are required' });
        }

        const result = await olaMapsService.reverseGeocode(parseFloat(lat), parseFloat(lng));

        if (!result) {
            return res.status(404).json({ error: 'Location not found' });
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Reverse geocode error:', error);
        res.status(500).json({ error: 'Failed to reverse geocode' });
    }
});

/**
 * GET /api/maps/places/search
 * Search for places (autocomplete)
 * Query: query, lat (optional), lng (optional)
 */
router.get('/places/search', async (req, res) => {
    try {
        const { query, lat, lng } = req.query;

        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const location = lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;
        const results = await olaMapsService.searchPlaces(query, location);

        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Places search error:', error);
        res.status(500).json({ error: 'Failed to search places' });
    }
});

/**
 * GET /api/maps/places/details
 * Get place details by place ID
 * Query: placeId
 */
router.get('/places/details', async (req, res) => {
    try {
        const { placeId } = req.query;

        if (!placeId) {
            return res.status(400).json({ error: 'Place ID is required' });
        }

        const result = await olaMapsService.getPlaceDetails(placeId);

        if (!result) {
            return res.status(404).json({ error: 'Place not found' });
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Place details error:', error);
        res.status(500).json({ error: 'Failed to get place details' });
    }
});

/**
 * POST /api/maps/calculate-fare
 * Calculate fare based on distance and vehicle type
 * Body: { distanceKm, vehicleType, tripType }
 */
router.post('/calculate-fare', async (req, res) => {
    try {
        const { distanceKm, vehicleType, tripType = 'drop' } = req.body;

        if (!distanceKm || !vehicleType) {
            return res.status(400).json({ error: 'Distance and vehicle type are required' });
        }

        const fare = olaMapsService.calculateFare(distanceKm, vehicleType, tripType);

        res.json({
            success: true,
            data: {
                fare,
                distanceKm,
                vehicleType,
                tripType
            }
        });
    } catch (error) {
        console.error('Calculate fare error:', error);
        res.status(500).json({ error: 'Failed to calculate fare' });
    }
});

/**
 * POST /api/maps/route-info
 * Get complete route information including fare
 * Body: { pickup: { lat, lng }, drop: { lat, lng }, vehicleType, tripType }
 */
router.post('/route-info', async (req, res) => {
    try {
        const { pickup, drop, vehicleType = 'Sedan', tripType = 'drop' } = req.body;

        if (!pickup || !drop) {
            return res.status(400).json({ error: 'Pickup and drop locations are required' });
        }

        // Get directions (will use Haversine fallback if API fails)
        const directions = await olaMapsService.getDirections(pickup, drop);
        
        if (!directions) {
            // Final fallback - calculate manually
            const distance = calculateHaversineDistance(pickup, drop);
            const fare = olaMapsService.calculateFare(distance, vehicleType, tripType);
            
            return res.json({
                success: true,
                data: {
                    distance: distance,
                    duration: Math.round(distance * 2), // Estimate 2 min per km
                    polyline: null,
                    fare,
                    vehicleType,
                    tripType,
                    pickupCity: null,
                    dropCity: null,
                    pickupAddress: `${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}`,
                    dropAddress: `${drop.lat.toFixed(4)}, ${drop.lng.toFixed(4)}`,
                    isFallback: true
                }
            });
        }

        // Try to get city info (but don't fail if this errors)
        let pickupDetails = null, dropDetails = null;
        try {
            pickupDetails = await olaMapsService.reverseGeocode(pickup.lat, pickup.lng);
        } catch (e) {
            console.log('Pickup reverseGeocode failed, using coordinates');
        }
        try {
            dropDetails = await olaMapsService.reverseGeocode(drop.lat, drop.lng);
        } catch (e) {
            console.log('Drop reverseGeocode failed, using coordinates');
        }

        // Calculate fare
        const fare = olaMapsService.calculateFare(directions.distance, vehicleType, tripType);

        res.json({
            success: true,
            data: {
                distance: directions.distance,
                duration: directions.duration,
                polyline: directions.polyline,
                fare,
                vehicleType,
                tripType,
                pickupCity: pickupDetails?.city || null,
                dropCity: dropDetails?.city || null,
                pickupAddress: pickupDetails?.formattedAddress || `${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}`,
                dropAddress: dropDetails?.formattedAddress || `${drop.lat.toFixed(4)}, ${drop.lng.toFixed(4)}`,
                isFallback: directions.isFallback || false
            }
        });
    } catch (error) {
        console.error('Route info error:', error.message);
        
        // Ultimate fallback - return calculated distance
        try {
            const { pickup, drop, vehicleType = 'Sedan', tripType = 'drop' } = req.body;
            const distance = calculateHaversineDistance(pickup, drop);
            const fare = olaMapsService.calculateFare(distance, vehicleType, tripType);
            
            res.json({
                success: true,
                data: {
                    distance: distance,
                    duration: Math.round(distance * 2),
                    polyline: null,
                    fare,
                    vehicleType,
                    tripType,
                    pickupCity: null,
                    dropCity: null,
                    isFallback: true
                }
            });
        } catch (fallbackError) {
            res.status(500).json({ error: 'Failed to get route info' });
        }
    }
});

// Haversine distance calculation helper
function calculateHaversineDistance(origin, destination) {
    const R = 6371; // Earth's radius in km
    const dLat = (destination.lat - origin.lat) * Math.PI / 180;
    const dLng = (destination.lng - origin.lng) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(origin.lat * Math.PI / 180) * Math.cos(destination.lat * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
}

module.exports = router;
