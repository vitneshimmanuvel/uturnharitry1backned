const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand, GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// DynamoDB Setup
const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'uturn-solo-rides';

// Generate unique tracking ID (e.g. SOLO-8X2A)
const generateTrackingId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = 'SOLO-';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

/**
 * Create a new solo ride
 * @param {Object} rideData - Ride details from driver
 * @param {Object} driver - Authenticated driver info
 * @returns {Promise<Object>} Created ride
 */
const createSoloRide = async (rideData, driver) => {
    if (!driver || !driver.id) {
        throw new Error('Driver info is required to create a solo ride');
    }

    const ride = {
        id: uuidv4(),
        driverId: driver.id,
        driverName: driver.name,
        driverPhone: driver.phone,

        // Customer Info
        customerPhone: rideData.customerPhone,
        customerName: rideData.customerName,
        customerLanguage: rideData.customerLanguage || 'Tamil',
        numberOfPeople: rideData.numberOfPeople || 1,
        category: rideData.category || 'Passenger',
        loadType: rideData.loadType,

        // Trip Type
        tripType: rideData.tripType || 'oneWay',
        vehicleType: rideData.vehicleType || driver.vehicleType,
        vehicleBrand: rideData.vehicleBrand || driver.vehicleBrand,
        vehicleModel: rideData.vehicleModel || driver.vehicleModel,

        // Rental / Outstation / Acting Driver Specifics
        minKmPerDay: rideData.minKmPerDay,
        numberOfDays: rideData.numberOfDays,
        actingTransmission: rideData.actingTransmission, // Added
        overTimeRate: rideData.overTimeRate, // Added

        // Locations
        pickupLocation: rideData.pickupLocation,
        pickupAddress: rideData.pickupAddress,
        pickupCity: rideData.pickupCity,
        pickupLat: rideData.pickupLat,
        pickupLng: rideData.pickupLng,
        dropLocation: rideData.dropLocation,
        dropAddress: rideData.dropAddress,
        dropLat: rideData.dropLat,
        dropLng: rideData.dropLng,
        additionalStops: rideData.additionalStops || [],

        // Route info
        distanceKm: rideData.distanceKm,
        estimatedDurationMins: rideData.estimatedDurationMins,

        // Schedule
        scheduledDate: rideData.scheduledDate || new Date().toISOString(),
        scheduledTime: rideData.scheduledTime || 'Now',
        returnDate: rideData.returnDate,
        returnTime: rideData.returnTime,

        // Fare breakdown
        baseFare: rideData.baseFare || 0,
        perKmRate: rideData.perKmRate || 0,
        hourlyRate: rideData.hourlyRate || 0,
        estimatedHours: rideData.estimatedHours || 0,
        nightAllowance: rideData.nightAllowance || 0,
        hillsAllowance: rideData.hillsAllowance || 0,
        waitingChargesPerMin: rideData.waitingChargesPerMin || (rideData.waitingChargesPerHour ? (rideData.waitingChargesPerHour / 60) : 0),
        waitingChargesPerHour: rideData.waitingChargesPerHour || ((rideData.waitingChargesPerMin || 0) * 60) || 0,
        extraCharges: rideData.extraCharges || 0,
        driverAllowance: rideData.driverAllowance || 0,
        rentalPackagePrice: rideData.rentalPackagePrice || 0,
        rentalHours: rideData.rentalHours || 0,
        rentalKm: rideData.rentalKm || 0,
        extraKmRate: rideData.extraKmRate || 0,
        totalAmount: rideData.totalAmount || 0,

        // Status: confirmed → in_progress → completed / cancelled
        status: 'confirmed',

        // Trip tracking
        otp: null,
        startOdometer: null,
        endOdometer: null,
        actualDistanceKm: null,
        startTime: null,
        endTime: null,
        waitingTimeMins: 0,
        paymentStatus: 'pending',
        paymentMethod: null,

        // Tracking
        trackingId: generateTrackingId(),

        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: ride,
    }));

    return ride;
};

/**
 * Get all solo rides for a specific driver
 * @param {string} driverId - Driver ID
 * @returns {Promise<Array>} List of solo rides
 */
const getSoloRides = async (driverId) => {
    const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'driverId = :driverId',
        ExpressionAttributeValues: { ':driverId': driverId },
    }));

    // Sort by createdAt descending
    const rides = result.Items || [];
    rides.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return rides;
};

/**
 * Find latest solo ride by customer phone
 * @param {string} phone - Customer phone
 * @returns {Promise<Object|null>} Latest ride or null
 */
const findLatestSoloRideByPhone = async (phone) => {
    const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'customerPhone = :phone',
        ExpressionAttributeValues: { ':phone': phone },
    }));

    const rides = result.Items || [];
    if (rides.length === 0) return null;

    // Sort by createdAt descending and return first
    rides.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return rides[0];
};

/**
 * Get a solo ride by ID
 * @param {string} rideId - Ride ID
 * @returns {Promise<Object|null>} Ride data or null
 */
const getSoloRideById = async (rideId) => {
    const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: rideId },
    }));
    return result.Item || null;
};

/**
 * Start solo trip
 */
const startSoloTrip = async (rideId, startOdometer, otp, startOdometerUrl) => {
    const ride = await getSoloRideById(rideId);
    if (!ride) throw new Error('Solo ride not found');
    
    // Solo trips might not strictly require OTP in all flows, but if provided, we can validate.
    // For now, mirroring bookingModel logic.
    
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: rideId },
        UpdateExpression: 'SET #status = :status, startOdometer = :startOdo, startOdometerUrl = :startOdoUrl, startTime = :now, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'in_progress',
            ':startOdo': Number(startOdometer),
            ':startOdoUrl': startOdometerUrl || null,
            ':now': new Date().toISOString()
        }
    }));
    
    return await getSoloRideById(rideId);
};

/**
 * Add to solo waiting time
 */
const addToSoloWaitingTime = async (rideId, additionalMinutes) => {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: rideId },
        UpdateExpression: 'SET waitingTimeMins = if_not_exists(waitingTimeMins, :zero) + :mins, updatedAt = :now',
        ExpressionAttributeValues: {
            ':mins': Number(additionalMinutes),
            ':zero': 0,
            ':now': new Date().toISOString()
        }
    }));
    
    return await getSoloRideById(rideId);
};

/**
 * Complete solo trip
 */
const completeSoloTrip = async (rideId, endOdometer, paymentMethod, endOdometerUrl, extraCharges) => {
    const ride = await getSoloRideById(rideId);
    if (!ride) throw new Error('Solo ride not found');

    const startOdo = Number(ride.startOdometer);
    const endOdo = Number(endOdometer);
    const actualDistanceKm = endOdo - startOdo;
    
    // Duration for allowances
    const startTime = new Date(ride.startTime);
    const endTime = new Date();
    const diffMs = endTime - startTime;
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    // Calculate fare (simplified mirror of bookingModel)
    let totalAmount = (Number(ride.baseFare) || 0);
    totalAmount += (actualDistanceKm * (Number(ride.perKmRate) || 0));
    totalAmount += ((Number(ride.driverAllowance) || 0) * days);
    totalAmount += ((Number(ride.nightAllowance) || 0) * days);
    totalAmount += (Number(ride.hillsAllowance) || 0);
    
    if (ride.waitingTimeMins > 0) {
        totalAmount += (ride.waitingTimeMins * (Number(ride.waitingChargesPerMin) || 0));
    }
    
    totalAmount += (Number(extraCharges) || 0);
    totalAmount = Math.round(totalAmount);

    const isCash = paymentMethod === 'cash';
    // For Solo rides, we usually assume customer pays driver directly unless specified
    const needsVerification = isCash; 

    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: rideId },
        UpdateExpression: 'SET #status = :status, endOdometer = :endOdo, endOdometerUrl = :endOdoUrl, actualDistanceKm = :distance, endTime = :now, totalAmount = :total, extraCharges = :extras, paymentMethod = :method, paymentStatus = :paymentStatus, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'completed',
            ':endOdo': endOdo,
            ':endOdoUrl': endOdometerUrl || null,
            ':distance': actualDistanceKm,
            ':total': totalAmount,
            ':extras': Number(extraCharges) || 0,
            ':method': paymentMethod,
            ':paymentStatus': 'completed',
            ':now': new Date().toISOString()
        }
    }));

    return await getSoloRideById(rideId);
};

/**
 * Update a solo ride
 * @param {string} rideId - Ride ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated ride
 */
const updateSoloRide = async (rideId, updates) => {
    const expressions = [];
    const names = {};
    const values = {};

    // Always update timestamp
    updates.updatedAt = new Date().toISOString();

    Object.keys(updates).forEach((key, index) => {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        expressions.push(`${attrName} = ${attrValue}`);
        names[attrName] = key;
        values[attrValue] = updates[key];
    });

    const result = await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: rideId },
        UpdateExpression: `SET ${expressions.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
    }));

    return result.Attributes;
};

module.exports = {
    createSoloRide,
    getSoloRides,
    getSoloRideById,
    updateSoloRide,
    startSoloTrip,
    completeSoloTrip,
    addToSoloWaitingTime,
    findLatestSoloRideByPhone,
    TABLE_NAME,
};
