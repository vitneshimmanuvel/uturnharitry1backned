const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
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
const TABLE_NAME = 'UTurnBookings';

/**
 * Create a new booking
 * @param {Object} bookingData - Booking details
 * @returns {Promise<Object>} Created booking
 */
const createBooking = async (bookingData) => {
    const booking = {
        id: uuidv4(),
        vendorId: bookingData.vendorId,
        customerPhone: bookingData.customerPhone,
        customerName: bookingData.customerName,
        customerLanguage: bookingData.customerLanguage || 'Tamil',
        numberOfPeople: bookingData.numberOfPeople || 1,
        
        // Trip Type: oneWay, roundTrip, localHourly, localDriverAllowance, outstation, tourPackage
        tripType: bookingData.tripType || 'oneWay',
        vehicleType: bookingData.vehicleType,
        vehicleBrand: bookingData.vehicleBrand,
        vehicleModel: bookingData.vehicleModel,
        
        // Locations
        pickupLocation: bookingData.pickupLocation, // { lat, lng }
        pickupAddress: bookingData.pickupAddress,
        pickupCity: bookingData.pickupCity,
        dropLocation: bookingData.dropLocation,
        dropAddress: bookingData.dropAddress,
        dropCity: bookingData.dropCity,
        additionalStops: bookingData.additionalStops || [],
        
        // Route info
        distanceKm: bookingData.distanceKm,
        estimatedDurationMins: bookingData.estimatedDurationMins,
        
        // Schedule
        scheduleDate: bookingData.scheduleDate,
        scheduleTime: bookingData.scheduleTime,
        returnDate: bookingData.returnDate,
        returnTime: bookingData.returnTime,
        
        // Fare breakdown
        baseFare: bookingData.baseFare || 0,
        perKmRate: bookingData.perKmRate || 0,
        hourlyRate: bookingData.hourlyRate || 0,
        estimatedHours: bookingData.estimatedHours || 0,
        nightAllowance: bookingData.nightAllowance || 0,
        waitingChargesPerHour: bookingData.waitingChargesPerHour || 0,
        extraCharges: bookingData.extraCharges || 0,
        driverAllowance: bookingData.driverAllowance || 0,
        vendorCommission: bookingData.vendorCommission || 0,
        packageAmount: bookingData.packageAmount || 0,
        estimatedFare: bookingData.estimatedFare || 0,
        totalAmount: bookingData.totalAmount || bookingData.estimatedFare || 0,
        
        // Status tracking: draft → pending → driver_accepted → vendor_approved → in_progress → completed / cancelled
        status: bookingData.status || 'draft',
        assignedDriverId: null,
        driverName: null,
        driverPhone: null,
        driverVideoUrl: null,
        rejectionReason: null,
        
        // Trip tracking
        otp: null,
        startOdometer: null,
        endOdometer: null,
        actualDistanceKm: null,
        startTime: null,
        endTime: null,
        waitingTimeMins: 0,
        paymentStatus: 'pending', // pending, completed
        paymentMethod: null, // cash, online
        
        // Tracking
        trackingId: null,
        
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: booking
    }));
    
    return booking;
};

/**
 * Get booking by ID
 */
const getBookingById = async (bookingId) => {
    const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId }
    }));
    
    return result.Item;
};

/**
 * Get nearby bookings for drivers (by city)
 */
const getNearbyBookings = async (city, vehicleType, status = 'pending') => {
    const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: '#status = :status AND pickupCity = :city AND vehicleType = :vehicle',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': status,
            ':city': city,
            ':vehicle': vehicleType
        }
    }));
    
    return result.Items || [];
};

/**
 * Get bookings by vendor ID
 */
const getVendorBookings = async (vendorId, status = null) => {
    const params = {
        TableName: TABLE_NAME,
        FilterExpression: 'vendorId = :vendorId',
        ExpressionAttributeValues: {
            ':vendorId': vendorId
        }
    };
    
    if (status) {
        params.FilterExpression += ' AND #status = :status';
        params.ExpressionAttributeNames = { '#status': 'status' };
        params.ExpressionAttributeValues[':status'] = status;
    }
    
    const result = await docClient.send(new ScanCommand(params));
    return result.Items || [];
};

/**
 * Get draft bookings for a vendor
 */
const getDraftBookings = async (vendorId) => {
    return getVendorBookings(vendorId, 'draft');
};

/**
 * Get pending bookings (published to drivers)
 */
const getPendingBookings = async (vendorId) => {
    return getVendorBookings(vendorId, 'pending');
};

/**
 * Publish a draft booking (change status to pending)
 */
const publishBooking = async (bookingId) => {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET #status = :status, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'pending',
            ':now': new Date().toISOString()
        }
    }));
    
    return await getBookingById(bookingId);
};

/**
 * Delete a draft booking
 */
const deleteBooking = async (bookingId) => {
    const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');
    await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId }
    }));
    return { success: true };
};

/**
 * Get bookings by driver ID
 */
const getDriverBookings = async (driverId, status = null) => {
    const params = {
        TableName: TABLE_NAME,
        FilterExpression: 'assignedDriverId = :driverId',
        ExpressionAttributeValues: {
            ':driverId': driverId
        }
    };
    
    if (status) {
        params.FilterExpression += ' AND #status = :status';
        params.ExpressionAttributeNames = { '#status': 'status' };
        params.ExpressionAttributeValues[':status'] = status;
    }
    
    const result = await docClient.send(new ScanCommand(params));
    return result.Items || [];
};

/**
 * Driver accepts booking
 */
const acceptBooking = async (bookingId, driverId) => {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET #status = :status, assignedDriverId = :driverId, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'driver_accepted',
            ':driverId': driverId,
            ':now': new Date().toISOString()
        }
    }));
    
    return await getBookingById(bookingId);
};

/**
 * Upload driver video
 */
const updateDriverVideo = async (bookingId, videoUrl) => {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET driverVideoUrl = :url, updatedAt = :now',
        ExpressionAttributeValues: {
            ':url': videoUrl,
            ':now': new Date().toISOString()
        }
    }));
    
    return await getBookingById(bookingId);
};

/**
 * Vendor approves driver
 */
const approveDriver = async (bookingId) => {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET #status = :status, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'vendor_approved',
            ':now': new Date().toISOString()
        }
    }));
    
    return await getBookingById(bookingId);
};

/**
 * Vendor rejects driver
 */
const rejectDriver = async (bookingId, reason) => {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET #status = :status, rejectionReason = :reason, assignedDriverId = :null, driverVideoUrl = :null, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'pending',
            ':reason': reason,
            ':null': null,
            ':now': new Date().toISOString()
        }
    }));
    
    return await getBookingById(bookingId);
};

/**
 * Generate and save OTP for trip start
 */
const generateTripOTP = async (bookingId) => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET otp = :otp, updatedAt = :now',
        ExpressionAttributeValues: {
            ':otp': otp,
            ':now': new Date().toISOString()
        }
    }));
    
    return otp;
};

/**
 * Start trip
 */
const startTrip = async (bookingId, startOdometer, otp) => {
    // First verify OTP
    const booking = await getBookingById(bookingId);
    if (!booking) throw new Error('Booking not found');
    if (booking.otp !== otp) throw new Error('Invalid OTP');
    
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET #status = :status, startOdometer = :startOdo, startTime = :now, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'in_progress',
            ':startOdo': startOdometer,
            ':now': new Date().toISOString()
        }
    }));
    
    return await getBookingById(bookingId);
};

/**
 * Update waiting time
 */
const updateWaitingTime = async (bookingId, waitingTimeMins) => {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET waitingTimeMins = :mins, updatedAt = :now',
        ExpressionAttributeValues: {
            ':mins': waitingTimeMins,
            ':now': new Date().toISOString()
        }
    }));
    
    return await getBookingById(bookingId);
};

/**
 * Complete trip
 */
const completeTrip = async (bookingId, endOdometer, paymentMethod) => {
    const booking = await getBookingById(bookingId);
    if (!booking) throw new Error('Booking not found');
    
    // Calculate actual distance
    const actualDistanceKm = endOdometer - booking.startOdometer;
    
    // Calculate total amount
    let totalAmount = booking.baseFare + (actualDistanceKm * booking.perKmRate);
    
    // Add trip type multipliers
    if (booking.tripType === 'round') totalAmount *= 1.8;
    else if (booking.tripType === 'rental') totalAmount *= 2.5;
    
    // Add waiting charges
    if (booking.waitingTimeMins > 0) {
        const waitingCharges = (booking.waitingChargesPerHour / 60) * booking.waitingTimeMins;
        totalAmount += waitingCharges;
    }
    
    totalAmount = Math.round(totalAmount);
    
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET #status = :status, endOdometer = :endOdo, actualDistanceKm = :distance, endTime = :now, totalAmount = :total, paymentMethod = :method, paymentStatus = :paymentStatus, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'completed',
            ':endOdo': endOdometer,
            ':distance': actualDistanceKm,
            ':total': totalAmount,
            ':method': paymentMethod,
            ':paymentStatus': 'completed',
            ':now': new Date().toISOString()
        }
    }));
    
    return await getBookingById(bookingId);
};

/**
 * Get booking by tracking ID
 */
const getBookingByTrackingId = async (trackingId) => {
    const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'trackingId = :trackingId',
        ExpressionAttributeValues: {
            ':trackingId': trackingId
        }
    }));
    
    return result.Items?.[0] || null;
};

/**
 * Update booking with any fields
 */
const updateBooking = async (bookingId, updates) => {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    Object.keys(updates).forEach((key, index) => {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = updates[key];
    });
    
    // Add updatedAt
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    }));
    
    return await getBookingById(bookingId);
};

module.exports = {
    createBooking,
    getBookingById,
    getBookingByTrackingId,
    getNearbyBookings,
    getVendorBookings,
    getDraftBookings,
    getPendingBookings,
    publishBooking,
    deleteBooking,
    getDriverBookings,
    acceptBooking,
    updateDriverVideo,
    approveDriver,
    rejectDriver,
    generateTripOTP,
    startTrip,
    updateWaitingTime,
    completeTrip,
    updateBooking
};

