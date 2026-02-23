const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand, GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const driverModel = require('./driverModel');
const referralModel = require('./referralModel'); // Import to fetch driver details
const fs = require('fs'); // Added for debug logging

// DynamoDB Setup
const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'uturn-bookings'; // Must match aws.js config

// Generate unique tracking ID (e.g. TRIP-8X2A)
const generateTrackingId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1
    let result = 'TRIP-';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

/**
 * Create a new booking
 * @param {Object} bookingData - Booking details
 * @returns {Promise<Object>} Created booking
 */
const createBooking = async (bookingData) => {
    // Sanity check for Vendor ID
    if (!bookingData.vendorId) {
        throw new Error('Vendor ID is required to create a booking');
    }

    const booking = {
        id: uuidv4(),
        vendorId: bookingData.vendorId,
        customerPhone: bookingData.customerPhone,
        customerName: bookingData.customerName,
        customerLanguage: bookingData.customerLanguage || 'Tamil',
        numberOfPeople: bookingData.numberOfPeople || 1,
        category: bookingData.category || 'Passenger',
        loadType: bookingData.loadType,
        demographics: bookingData.demographics,
        
        // Trip Type: oneWay, roundTrip, localHourly, localDriverAllowance, outstation, tourPackage
        tripType: bookingData.tripType || 'oneWay',
        vehicleType: bookingData.vehicleType,
        vehicleBrand: bookingData.vehicleBrand,
        vehicleModel: bookingData.vehicleModel,
        
        // Rental / Outstation Specifics
        minKmPerDay: bookingData.minKmPerDay,
        packageId: bookingData.packageId,
        driverMyBata: bookingData.driverMyBata, // If separate from driverAllowance
        
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
        scheduleDate: bookingData.scheduleDate || bookingData.scheduledDate,
        scheduleTime: bookingData.scheduleTime || bookingData.scheduledTime,
        returnDate: bookingData.returnDate,
        returnTime: bookingData.returnTime,
        
        // Fare breakdown
        baseFare: bookingData.baseFare || 0,
        perKmRate: bookingData.perKmRate || 0,
        hourlyRate: bookingData.hourlyRate || 0,
        estimatedHours: bookingData.estimatedHours || 0,
        nightAllowance: bookingData.nightAllowance || 0,
        hillsAllowance: bookingData.hillsAllowance || 0,
        waitingChargesPerMin: bookingData.waitingChargesPerMin || (bookingData.waitingChargesPerHour ? (bookingData.waitingChargesPerHour / 60) : (bookingData.waitingCharges || 0)),
        waitingChargesPerHour: bookingData.waitingChargesPerHour || ((bookingData.waitingChargesPerMin || 0) * 60) || 0,
        waitingCharges: bookingData.waitingCharges || bookingData.waitingChargesPerMin || (bookingData.waitingChargesPerHour ? (bookingData.waitingChargesPerHour / 60) : 0),
        extraCharges: bookingData.extraCharges || 0,
        tollCharges: bookingData.tollCharges || 0,
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
        paymentMode: bookingData.paymentMode || 'customer_pays_driver', // 'customer_pays_vendor' or 'customer_pays_driver'
        
        // Tracking
        trackingId: generateTrackingId(),
        
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


/**
 * Get nearby bookings for drivers (by city)
 */
/**
 * Get nearby bookings for drivers (ALL cities)
 */
const getNearbyBookings = async (city, vehicleType, status = 'pending', driverAvailability = []) => {
    console.log(`[NearbyBookings] Filtering for City: ${city}, Vehicle: ${vehicleType}, Availability: ${driverAvailability}`);
    
    // Scan all pending bookings
    const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: '#status = :status AND vendorId <> :soloVendor',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': status,
            ':soloVendor': 'SOLO_RIDE'
        }
    }));
    
    let bookings = result.Items || [];

    // Apply filters in memory (more flexible for complex logic)
    if (city && city !== 'All') {
        bookings = bookings.filter(b => 
            (b.pickupCity && b.pickupCity.toLowerCase() === city.toLowerCase()) ||
            (b.pickupAddress && b.pickupAddress.toLowerCase().includes(city.toLowerCase()))
        );
    }

    if (vehicleType && vehicleType !== 'All') {
        bookings = bookings.filter(b => 
            b.vehicleType && b.vehicleType.toLowerCase() === vehicleType.toLowerCase()
        );
    }

    // Filter by driver availability if provided
    if (driverAvailability && driverAvailability.length > 0) {
        bookings = bookings.filter(b => {
            const tripType = b.tripType || 'oneWay';
            
            // Map booking trip types to driver availability categories
            if (tripType === 'oneWay') {
                // oneWay can be Daily or Outstation depending on distance, 
                // but usually drivers with either category should see it.
                return driverAvailability.includes('daily') || driverAvailability.includes('outstation');
            }
            if (tripType === 'roundTrip' || tripType === 'round') {
                return driverAvailability.includes('round');
            }
            if (tripType === 'localHourly' || tripType === 'localDriverAllowance' || tripType === 'rental') {
                return driverAvailability.includes('rental');
            }
            if (tripType === 'outstation') {
                return driverAvailability.includes('outstation');
            }
            if (tripType === 'tourPackage') {
                return driverAvailability.includes('tourPackage');
            }
            
            return true; // Default for any unmapped types
        });
    }
    
    return bookings;
};

/**
 * Get bookings by vendor ID
 */
const getVendorBookings = async (vendorId, status = null) => {
    console.log(`[Vendor Isolation Check] Fetching bookings for vendorId: ${vendorId}`);
    const params = {
        TableName: TABLE_NAME,
        FilterExpression: 'vendorId = :vendorId',
        ExpressionAttributeValues: {
            ':vendorId': vendorId
        }
    };
    
    if (status) {
        const statuses = status.split(',').map(s => s.trim());
        params.ExpressionAttributeNames = {};
        if (statuses.length === 1) {
            params.FilterExpression += ' AND #status = :status';
            params.ExpressionAttributeNames['#status'] = 'status';
            params.ExpressionAttributeValues[':status'] = statuses[0];
        } else {
            // Handle multiple statuses: #status IN (:s0, :s1, ...)
            const statusPlaceholders = statuses.map((_, i) => `:status${i}`);
            params.FilterExpression += ` AND #status IN (${statusPlaceholders.join(', ')})`;
            params.ExpressionAttributeNames['#status'] = 'status';
            statuses.forEach((s, i) => {
                params.ExpressionAttributeValues[`:status${i}`] = s;
            });
        }
    }
    
    // Scan is okay for low volume, but GSI would be better for scale.
    // Given current requirements, Scan with Filter is acceptable.
    const result = await docClient.send(new ScanCommand(params));
    
    // Sort by createdAt desc (newest first)
    const items = result.Items || [];
    return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
    let bookings = result.Items || [];

    // Fetch vendor details for each booking
    const vendorModel = require('./vendorModel');
    bookings = await Promise.all(bookings.map(async (booking) => {
        if (booking.vendorId) {
            try {
                const vendor = await vendorModel.findVendorById(booking.vendorId);
                if (vendor) {
                    booking.vendor = {
                        businessName: vendor.businessName,
                        ownerName: vendor.ownerName,
                        phone: vendor.phone
                    };
                }
            } catch (e) {
                console.error(`Failed to fetch vendor for booking ${booking.id}:`, e);
            }
        }
        return booking;
    }));

    return bookings;
};

/**
 * Get booking by ID
 */
const getBookingById = async (bookingId) => {
    const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId }
    }));
    
    let booking = result.Item;

    if (booking && booking.vendorId) {
         const vendorModel = require('./vendorModel');
         try {
            const vendor = await vendorModel.findVendorById(booking.vendorId);
            if (vendor) {
                booking.vendor = {
                    businessName: vendor.businessName,
                    ownerName: vendor.ownerName,
                    phone: vendor.phone
                };
            }
        } catch (e) {
            console.error(`Failed to fetch vendor for booking ${booking.id}:`, e);
        }
    }
    
    return booking;
};
const acceptBooking = async (bookingId, driverId) => {
    // 1. Fetch driver details first
    const driver = await driverModel.findDriverById(driverId);
    
    if (!driver) {
        throw new Error('Driver not found');
    }

    // 2. Prepare driver info to denormalize into booking
    // Use selfie as profile pic if available
    // Use profilePic (primary) or documents.selfie (legacy fallback)
    const driverProfilePic = driver.profilePic || (driver.documents && driver.documents.selfie) || null; 

    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET #status = :status, assignedDriverId = :driverId, driverName = :dName, driverPhone = :dPhone, vehicleNumber = :vNum, vehicleType = :vType, driverProfilePic = :dPic, updatedAt = :now',
        ConditionExpression: '#status = :pending',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'driver_accepted',
            ':pending': 'pending',
            ':driverId': driverId,
            ':dName': driver.name,
            ':dPhone': driver.phone,
            ':vNum': driver.vehicleNumber || 'Not Set',
            ':vType': driver.vehicleType || 'Unknown',
            ':dPic': driverProfilePic,
            ':now': new Date().toISOString()
        }
    }));
    
    return await getBookingById(bookingId);
};

/**
 * Upload driver video
 */
const updateDriverVideo = async (bookingId, videoUrl) => {
    console.log(`[MODEL] Updating video for booking: '${bookingId}'`);
    // Check if booking exists first
    const booking = await getBookingById(bookingId);
    if (!booking) {
        console.error(`[MODEL] Booking NOT FOUND for ID: '${bookingId}'`);
        throw new Error('Booking not found');
    }

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
        ConditionExpression: '#status = :accepted',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'vendor_approved',
            ':accepted': 'driver_accepted',
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
        ConditionExpression: '#status = :accepted',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'pending',
            ':accepted': 'driver_accepted',
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
const startTrip = async (bookingId, startOdometer, otp, startOdometerUrl) => {
    // First verify OTP
    const booking = await getBookingById(bookingId);
    if (!booking) throw new Error('Booking not found');
    // RELAXED OTP CHECK FOR DEVELOPMENT (User Request)
    // if (booking.otp !== otp) throw new Error('Invalid OTP');
    if (!otp || otp.length !== 4) throw new Error('OTP must be 4 digits');
    
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET #status = :status, startOdometer = :startOdo, startOdometerUrl = :startOdoUrl, startTime = :now, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'in_progress',
            ':startOdo': startOdometer,
            ':startOdoUrl': startOdometerUrl || null,
            ':now': new Date().toISOString()
        }
    }));
    
    return await getBookingById(bookingId);
};

/**
 * Update waiting time
 */
/**
 * Add to waiting time (Accumulate)
 */
const addToWaitingTime = async (bookingId, additionalMinutes) => {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET waitingTimeMins = if_not_exists(waitingTimeMins, :zero) + :mins, updatedAt = :now',
        ExpressionAttributeValues: {
            ':mins': additionalMinutes,
            ':zero': 0,
            ':now': new Date().toISOString()
        }
    }));
    
    return await getBookingById(bookingId);
};

/**
 * Complete trip
 */
const completeTrip = async (bookingId, endOdometer, paymentMethod, endOdometerUrl, extraCharges) => {
    try {
        const booking = await getBookingById(bookingId);
        if (!booking) throw new Error('Booking not found');
    
    console.log(`[DEBUG] Completing Trip: ${bookingId}, PaymentMethod: ${paymentMethod}, PaymentMode: ${booking.paymentMode}`);
    
    // Calculate actual distance
    const actualDistanceKm = Math.max(0, endOdometer - booking.startOdometer);
    
    // Calculate duration for allowances (days)
    const startTime = new Date(booking.startTime);
    const endTime = new Date();
    const diffMs = endTime - startTime;
    const diffHours = diffMs / (1000 * 60 * 60);
    const days = Math.max(1, Math.ceil(diffHours / 24));
    
    // Calculate total amount
    // Formula: baseFare + (actualDistanceKm * perKmRate) + (driverAllowance * days) + (nightAllowance * days) + hillsAllowance + waitingCharges + extraCharges
    let totalAmount = (booking.baseFare || 0);
    
    // 1. Distance Charge
    totalAmount += (actualDistanceKm * (booking.perKmRate || 0));
    
    // 2. Allowances (Driver Bata & Night are per-day)
    totalAmount += ((booking.driverAllowance || 0) * days);
    totalAmount += ((booking.nightAllowance || 0) * days);
    
    // 3. Hills Allowance (Flat)
    totalAmount += (booking.hillsAllowance || 0);
    
    // 4. Waiting Charges (Accumulated during trip)
    if (booking.waitingTimeMins > 0) {
        const ratePerMin = booking.waitingCharges || 0; 
        totalAmount += (ratePerMin * booking.waitingTimeMins);
    }

    // 5. Extra Charges (Toll, Parking, etc.) passed at completion
    const extras = Number(extraCharges) || 0;
    totalAmount += extras;
    
    totalAmount = Math.max(0, Math.round(totalAmount));
    
    // Prepare update parameters
    const isCashPayment = paymentMethod === 'cash';
    // Only require verification if Cash AND Customer pays Driver
    const needsVerification = isCashPayment && booking.paymentMode === 'customer_pays_driver';
    
    const driverStatus = needsVerification ? 'blocked_for_payment' : 'active';
    
    console.log(`[DEBUG] Final Fare: ${totalAmount} (Base: ${booking.baseFare}, Dist: ${actualDistanceKm}, Rate: ${booking.perKmRate}, Days: ${days}, Bata: ${booking.driverAllowance}, Hills: ${booking.hillsAllowance}, WaitMins: ${booking.waitingTimeMins}, extras: ${extras})`);
    console.log(`[DEBUG] Payment Logic: isCash=${isCashPayment}, needsVerify=${needsVerification}, driverStatus=${driverStatus}`);

    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET #status = :status, endOdometer = :endOdo, endOdometerUrl = :endOdoUrl, actualDistanceKm = :distance, endTime = :now, totalAmount = :total, extraCharges = :extras, paymentMethod = :method, paymentStatus = :paymentStatus, driverStatus = :driverStatus, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': needsVerification ? 'payment_verification_pending' : 'completed', 
            ':endOdo': endOdometer,
            ':endOdoUrl': endOdometerUrl || null,
            ':distance': actualDistanceKm,
            ':total': totalAmount,
            ':extras': extras,
            ':method': paymentMethod,
            ':paymentStatus': isCashPayment ? 'pending' : 'completed', 
            ':driverStatus': driverStatus,
            ':now': new Date().toISOString()
        }
    }));
    
    // Sync blocking status to Driver entity if Cash Payment
    // Sync blocking status to Driver entity if Verification Needed
    if (booking.assignedDriverId) {
        if (needsVerification) {
            await driverModel.updateDriver(booking.assignedDriverId, { status: 'blocked_for_payment' });
        }
        
        // Update Driver Stats & Check Referral
        const newTripCount = await driverModel.incrementDriverTrips(booking.assignedDriverId);
        
        // Referral Bonus Check (e.g. 5th Trip)
        if (newTripCount === 5) {
             const driver = await driverModel.findDriverById(booking.assignedDriverId);
             if (driver && driver.referredBy) {
                 // driver.referredBy is the Code. We need to find the referrer by code to get their ID?
                 // Actually referralModel.completeReferralBonus takes (referrerId, refereeId).
                 // We first need to find the referrer's ID from the code.
                 const referral = await referralModel.getReferralByCode(driver.referredBy);
                 
                 if (referral) {
                     const success = await referralModel.completeReferralBonus(referral.vendorId, driver.id); // vendorId is driverId here
                     if (success) {
                        console.log(`[REFERRAL] Credited bonus to ${referral.vendorId} for referee ${driver.id}`);
                     }
                 }
             }
        }
    }
    
        return await getBookingById(bookingId);
    } catch (error) {
        console.error('COMPLETE TRIP ERROR:', error);
        fs.appendFileSync('complete_trip_error.log', `${new Date().toISOString()} - ${error.stack}\n`);
        throw error;
    }
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
/**
 * Verify Cash Payment (Vendor)
 */
const verifyCashPayment = async (bookingId) => {
    const booking = await getBookingById(bookingId);
    if (!booking) throw new Error('Booking not found');
    
    // Update booking status
    // Step 1: Verify Cash -> Move to Commission Pending
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET #status = :status, paymentStatus = :paymentStatus, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'commission_pending', // Driver still blocked
            ':paymentStatus': 'completed', // Customer paid driver
            ':now': new Date().toISOString()
        }
    }));

    // DO NOT unblock driver yet. Wait for commission payment.
    
    return await getBookingById(bookingId);
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

/**
 * Check if driver has active booking
 */
const hasActiveBooking = async (driverId) => {
    // Fallback to Scan
    const scanParams = {
        TableName: TABLE_NAME,
        FilterExpression: 'assignedDriverId = :driverId AND #status IN (:accepted, :approved, :in_progress, :payment_pending)',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':driverId': driverId,
            ':accepted': 'driver_accepted',
            ':approved': 'vendor_approved',
            ':in_progress': 'in_progress',
            ':payment_pending': 'payment_verification_pending'
        }
    };

    const result = await docClient.send(new ScanCommand(scanParams));
    return result.Items && result.Items.length > 0;
};

// Step 2: Driver marks commission as paid
const payCommission = async (bookingId) => {
    const booking = await getBookingById(bookingId);
    if (!booking) throw new Error('Booking not found');
    
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET #status = :status, commissionStatus = :commissionStatus, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'commission_verification_pending',
            ':commissionStatus': 'paid_by_driver', // Waiting for vendor approval
            ':now': new Date().toISOString()
        }
    }));
    
    return await getBookingById(bookingId);
};

// Step 3: Vendor approves commission
const approveCommission = async (bookingId) => {
    const booking = await getBookingById(bookingId);
    if (!booking) throw new Error('Booking not found');
    
    // Mark booking commission as received and complete
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET #status = :status, commissionStatus = :commissionStatus, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'completed',
            ':commissionStatus': 'received',
            ':now': new Date().toISOString()
        }
    }));
    
    // Unblock driver
    if (booking.assignedDriverId) {
        await driverModel.updateDriver(booking.assignedDriverId, { status: 'active' });
    }
    
    return await getBookingById(bookingId);
};

// Step 3b: Vendor rejects commission
const rejectCommission = async (bookingId) => {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET #status = :status, commissionStatus = :commissionStatus, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'commission_pending', // Back to simplified pending state
            ':commissionStatus': 'rejected',
            ':now': new Date().toISOString()
        }
    }));
    
    return await getBookingById(bookingId);
};

/**
 * Find latest booking by customer phone
 */
const findLatestBookingByPhone = async (phone) => {
    // Scan for bookings with this phone number
    const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'customerPhone = :phone',
        ExpressionAttributeValues: {
            ':phone': phone
        }
    }));
    
    if (!result.Items || result.Items.length === 0) {
        return null;
    }
    
    // Sort by createdAt desc to get the latest
    result.Items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return result.Items[0];
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
    addToWaitingTime,
    completeTrip,
    verifyCashPayment,
    updateBooking,
    hasActiveBooking,
    payCommission,
    approveCommission,
    rejectCommission,
    findLatestBookingByPhone
};
