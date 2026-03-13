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
        perDayRate: bookingData.perDayRate || 0,
        extraKmRate: bookingData.extraKmRate || 0,
        extraHrRate: bookingData.extraHrRate || 0,
        rentalHours: bookingData.rentalHours || 0,
        rentalKm: bookingData.rentalKm || 0,
        numberOfDays: bookingData.numberOfDays || 0,
        estimatedHours: bookingData.estimatedHours || 0,
        nightAllowance: bookingData.nightAllowance || 0,
        hillsAllowance: bookingData.hillsAllowance || 0,
        waitingChargesPerMin: bookingData.waitingChargesPerMin || (bookingData.waitingChargesPerHour ? (bookingData.waitingChargesPerHour / 60) : (bookingData.waitingCharges || 0)),
        waitingChargesPerHour: bookingData.waitingChargesPerHour || ((bookingData.waitingChargesPerMin || 0) * 60) || 0,
        waitingCharges: bookingData.waitingCharges || bookingData.waitingChargesPerMin || (bookingData.waitingChargesPerHour ? (bookingData.waitingChargesPerHour / 60) : 0),
        extraCharges: bookingData.extraCharges || 0,
        tollCharges: bookingData.tollCharges || 0,
        driverAllowance: bookingData.driverAllowance || 0,
        vendorCommissionPercentage: Number(bookingData.vendorCommissionPercentage || bookingData.commissionPercent || 0),
        vendorCommission: (() => {
            const pct = Number(bookingData.vendorCommissionPercentage || bookingData.commissionPercent || 0);
            const total = Number(bookingData.totalAmount || bookingData.estimatedFare || 0);
            return pct > 0 ? Math.round((total * pct) / 100) : 0;
        })(),
        packageAmount: bookingData.packageAmount || 0,
        estimatedFare: bookingData.estimatedFare || 0,
        totalAmount: bookingData.totalAmount || bookingData.estimatedFare || 0,
        minKmPerDay: bookingData.minKmPerDay || 0,
        
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
    if (city && city.toLowerCase() !== 'all' && city !== '') {
        const lowerCity = city.toLowerCase();
        bookings = bookings.filter(b => {
            const bCity = (b.pickupCity || '').toLowerCase();
            const bAddr = (b.pickupAddress || '').toLowerCase();
            return bCity === lowerCity || bAddr.includes(lowerCity);
        });
    }

    if (vehicleType && vehicleType.toLowerCase() !== 'all' && vehicleType !== '') {
        const lowerVehicle = vehicleType.toLowerCase();
        bookings = bookings.filter(b => 
            (b.vehicleType || '').toLowerCase() === lowerVehicle
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
        params.ExpressionAttributeNames = params.ExpressionAttributeNames || {};
        params.ExpressionAttributeNames['#status'] = 'status';
        
        if (statuses.length === 1) {
            params.FilterExpression += ' AND #status = :status';
            params.ExpressionAttributeValues[':status'] = statuses[0];
        } else {
            // Handle multiple statuses: #status IN (:status0, :status1, ...)
            const statusPlaceholders = statuses.map((_, i) => `:status${i}`);
            params.FilterExpression += ` AND #status IN (${statusPlaceholders.join(', ')})`;
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
 * Unpublish a pending booking (change status back to draft)
 */
const unpublishBooking = async (bookingId) => {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET #status = :status, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'draft',
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
        const statuses = status.split(',').map(s => s.trim());
        params.ExpressionAttributeNames = { '#status': 'status' };
        if (statuses.length === 1) {
            params.FilterExpression += ' AND #status = :status';
            params.ExpressionAttributeValues[':status'] = statuses[0];
        } else {
            const statusPlaceholders = statuses.map((_, i) => `:status${i}`);
            params.FilterExpression += ` AND #status IN (${statusPlaceholders.join(', ')})`;
            statuses.forEach((s, i) => {
                params.ExpressionAttributeValues[`:status${i}`] = s;
            });
        }
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
    console.log(`[MODEL] AcceptBooking: BookingID='${bookingId}', DriverID='${driverId}', Type='${typeof driverId}'`);
    // 1. Fetch driver details first
    const driver = await driverModel.findDriverById(driverId);
    
    if (!driver) {
        throw new Error('Driver not found');
    }

    // 2. Determine which vehicle is being used
    let vehicleNum = driver.activeVehicleNumber || driver.vehicleNumber || null;
    let vehicleBrand = driver.vehicleBrand || null;
    let vehicleModel = driver.vehicleModel || null;
    let rcNumber = driver.rcNumber || driver.vehicleNumber || null;

    // If driver has an activeVehicleNumber, try to find details in the vehicles array
    if (driver.activeVehicleNumber && driver.vehicles && Array.isArray(driver.vehicles)) {
        const activeVehicle = driver.vehicles.find(v => 
            (v.registration_number || v.vehicleNumber || v.rcNumber) === driver.activeVehicleNumber
        );
        if (activeVehicle) {
            vehicleNum = driver.activeVehicleNumber;
            vehicleBrand = activeVehicle.vehicleBrand || vehicleBrand;
            vehicleModel = activeVehicle.vehicleModel || vehicleModel;
            rcNumber = activeVehicle.rcNumber || activeVehicle.vehicleNumber || rcNumber;
        }
    }

    // 3. Prepare driver info to denormalize into booking
    const driverProfilePic = driver.profilePic || (driver.documents && driver.documents.selfie) || null; 

    try {
        await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id: bookingId },
            UpdateExpression: 'SET #status = :status, assignedDriverId = :driverId, driverName = :dName, driverPhone = :dPhone, vehicleNumber = :vNum, vehicleBrand = :vBrand, vehicleModel = :vModel, rcNumber = :rcNum, driverProfilePic = :dPic, updatedAt = :now',
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
                ':vNum': vehicleNum,
                ':vBrand': vehicleBrand,
                ':vModel': vehicleModel,
                ':rcNum': rcNumber,
                ':dPic': driverProfilePic,
                ':now': new Date().toISOString()
            }
        }));
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            const recheck = await getBookingById(bookingId);
            console.error(`[MODEL] ACCEPT FAILED for ${bookingId}. Expected 'pending', but current status is '${recheck ? recheck.status : 'DELETED'}'`);
            throw new Error(`Booking is no longer available (Status: ${recheck ? recheck.status : 'Deleted'})`);
        }
        throw error;
    }

    
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
        UpdateExpression: 'SET #status = :status, rejectionReason = :reason, assignedDriverId = :null, driverName = :null, driverPhone = :null, vehicleNumber = :null, driverProfilePic = :null, driverVideoUrl = :null, updatedAt = :now',
        ConditionExpression: '#status = :accepted',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'pending', // Republish immediately
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
    const otp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
    
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
    
    // Strict OTP Validation
    if (!otp || otp.length !== 4) throw new Error('OTP must be 4 digits');
    if (booking.otp !== otp) throw new Error('Invalid OTP. Please check with customer.');
    
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
            ':mins': Number(additionalMinutes),
            ':zero': 0,
            ':now': new Date().toISOString()
        }
    }));
    
    return await getBookingById(bookingId);
};

/**
 * Complete trip
 */
const completeTrip = async (bookingId, endOdometer, paymentMethod, endOdometerUrl, tollCharges, parkingCharges, permitCharges, travelTimeSeconds) => {
    try {
        const booking = await getBookingById(bookingId);
        if (!booking) throw new Error('Booking not found');
    
    console.log(`[DEBUG] Completing Trip: ${bookingId}, PaymentMethod: ${paymentMethod}, PaymentMode: ${booking.paymentMode}`);
    
    // Calculate actual distance - use the endOdometer from dropped stage if available
    const finalEndOdo = Number(endOdometer) || Number(booking.endOdometer) || 0;
    const finalStartOdo = Number(booking.startOdometer) || 0;
    const actualDistanceKm = Math.abs(finalEndOdo - finalStartOdo);
    
    // Calculate duration for allowances (days)
    const startTime = new Date(booking.startTime);
    // Use droppedAt if available, otherwise now
    const endTime = booking.droppedAt ? new Date(booking.droppedAt) : new Date();
    const diffMs = endTime - startTime;
    const diffHours = diffMs / (1000 * 60 * 60);
    const days = Math.max(1, Math.ceil(diffHours / 24));
    
    // Calculate total amount
    // Logic:
    // 1. For distance-based trips (oneWay, roundTrip, localDriverAllowance), recalculate from distance + allowances.
    // 2. For Duration-based trips (localHourly/Rental), recalculate from days * perDayRate + allowances.
    // 3. For fixed/package trips, use original estimatedFare (agreed total) as base and only add on-trip extras.
    
    // user request: "make sure the extra are added with the initial full fare"
    let totalAmount = Number(booking.estimatedFare) || Number(booking.fare) || 0;
    console.log(`[DEBUG] Initial Full Fare as Base quote: ${totalAmount}`);
    
    // 4. Waiting Charges (use waitingChargesPerMin or waitingCharges field)
    const waitingRatePerMin = Number(booking.waitingChargesPerMin) || Number(booking.waitingCharges) || 0;
    let waitingChargesAmount = 0;
    if (booking.waitingTimeMins > 0 && waitingRatePerMin > 0) {
        waitingChargesAmount = Math.round(waitingRatePerMin * booking.waitingTimeMins);
        totalAmount += waitingChargesAmount;
    }

    // 5. Extra Charges (Toll, Parking, etc.)
    const toll = Number(tollCharges) || 0;
    const parking = Number(parkingCharges) || 0;
    const permit = Number(permitCharges) || 0;
    const extras = toll + parking + permit;
    totalAmount += extras;
    
    totalAmount = Math.max(0, Math.round(totalAmount));

    // Calculate commission from the stored percentage - ONLY on the initial quoted fare, not extras
    const vendorCommissionPercentage = Number(booking.vendorCommissionPercentage) || 0;
    const initialQuotedFare = Number(booking.estimatedFare) || Number(booking.fare) || 0;
    const vendorCommission = vendorCommissionPercentage > 0 ? Math.round((initialQuotedFare * vendorCommissionPercentage) / 100) : 0;
    
    // Prepare update parameters
    const isCashPayment = paymentMethod === 'cash';
    // Only require verification if Cash AND Customer pays Driver
    const needsVerification = isCashPayment && booking.paymentMode === 'customer_pays_driver';
    
    const driverStatus = needsVerification ? 'blocked_for_payment' : 'active';
    
    console.log(`[DEBUG] Final Fare: ${totalAmount} (Base: ${booking.baseFare}, Dist: ${actualDistanceKm}, Rate: ${booking.perKmRate}, Days: ${days}, Bata: ${booking.driverAllowance}, Hills: ${booking.hillsAllowance}, WaitMins: ${booking.waitingTimeMins}, WaitRate: ${waitingRatePerMin}, WaitAmt: ${waitingChargesAmount}, extras: ${extras})`);
    console.log(`[DEBUG] Payment Logic: isCash=${isCashPayment}, needsVerify=${needsVerification}, driverStatus=${driverStatus}`);

    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: 'SET #status = :status, endOdometer = :endOdo, endOdometerUrl = :endOdoUrl, actualDistanceKm = :distance, endTime = :now, completedAt = :completedAt, totalAmount = :total, finalTotal = :total, initialTotal = :initial, vendorCommission = :comm, extraCharges = :extras, tollCharges = :toll, parkingCharges = :parking, permitCharges = :permit, waitingChargesAmount = :waitAmt, paymentMethod = :method, paymentStatus = :paymentStatus, driverStatus = :driverStatus, travelTimeSeconds = :travelTime, updatedAt = :now',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': needsVerification ? 'payment_verification_pending' : 'completed', 
            ':completedAt': needsVerification ? null : new Date().toISOString(),
            ':endOdo': finalEndOdo,
            ':endOdoUrl': endOdometerUrl || null,
            ':distance': actualDistanceKm,
            ':total': totalAmount,
            ':initial': Number(booking.estimatedFare) || Number(booking.fare) || 0,
            ':comm': vendorCommission,
            ':extras': extras,
            ':toll': toll,
            ':parking': parking,
            ':permit': permit,
            ':waitAmt': waitingChargesAmount,
            ':method': paymentMethod,
            ':paymentStatus': isCashPayment ? 'pending' : 'completed', 
            ':driverStatus': driverStatus,
            ':travelTime': Number(travelTimeSeconds || booking.travelTimeSeconds || 0),
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
 * Mark trip as dropped/reached destination (Driver)
 */
const droppedTrip = async (bookingId, waitingTimeMins, travelTimeSeconds, endOdometer) => {
    const booking = await getBookingById(bookingId);
    if (!booking) throw new Error('Booking not found');

    const waitMins = Number(waitingTimeMins || 0);
    const waitingRate = Number(booking.waitingChargesPerMin) || Number(booking.waitingCharges) || 0;
    const waitAmt = Math.round(waitMins * waitingRate);
    
    const baseAmount = Number(booking.estimatedFare) || Number(booking.fare) || 0;
    const interimTotal = baseAmount + waitAmt;

    let updateExpr = 'SET #status = :status, droppedAt = :now, updatedAt = :now, waitingTimeMins = :waitMins, travelTimeSeconds = :travelTime, totalAmount = :total, waitingChargesAmount = :waitAmt';
    let exprValues = {
        ':status': 'dropped',
        ':now': new Date().toISOString(),
        ':waitMins': waitMins,
        ':travelTime': Number(travelTimeSeconds || 0),
        ':total': interimTotal,
        ':waitAmt': waitAmt
    };

    if (endOdometer !== undefined && endOdometer !== null) {
        updateExpr += ', endOdometer = :endOdo';
        exprValues[':endOdo'] = endOdometer;
    }

    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: exprValues
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
    
    // Convert empty strings to null (DynamoDB throws an error on empty strings)
    Object.keys(updates).forEach(key => {
        if (updates[key] === "") {
            updates[key] = null;
        }
    });
    
    // Prevent overlapping path errors
    delete updates.updatedAt;
    delete updates.createdAt;
    delete updates.id;
    delete updates.vendorId;
    
    // Filter out undefined values and reserved update keys
    const validUpdates = Object.keys(updates).filter(key => {
        return updates[key] !== undefined && 
               key !== 'updatedAt' && 
               key !== 'createdAt' && 
               key !== 'id' && 
               key !== 'vendorId';
    });
    
    const setExpressions = [];
    const removeExpressions = [];
    
    validUpdates.forEach((key, index) => {
        const attrName = `#attr${index}`;
        expressionAttributeNames[attrName] = key;
        
        if (updates[key] === null) {
            removeExpressions.push(attrName);
        } else {
            const attrValue = `:val${index}`;
            setExpressions.push(`${attrName} = ${attrValue}`);
            expressionAttributeValues[attrValue] = updates[key];
        }
    });
    
    // Add updatedAt
    setExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    
    let updateExpr = `SET ${setExpressions.join(', ')}`;
    if (removeExpressions.length > 0) {
        updateExpr += ` REMOVE ${removeExpressions.join(', ')}`;
    }
    
    try {
        console.log('--- DYNAMODB UPDATE ATTEMPT ---');
        console.log('UpdateExpression:', updateExpr);
        console.log('ExpressionAttributeNames:', expressionAttributeNames);
        
        await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id: bookingId },
            UpdateExpression: updateExpr,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues
        }));
    } catch (e) {
        console.error('DynamoDB Update Error:', e.name, e.message);
        console.error('Update Params:', JSON.stringify(expressionAttributeValues, null, 2));
        require('fs').appendFileSync('update_trip_error.log', `${new Date().toISOString()} - ${e.stack}\nPARAMS: ${JSON.stringify(expressionAttributeValues)}\n`);
        throw new Error(`DB Error: ${e.message}`);
    }
    
    return await getBookingById(bookingId);
};

/**
 * Check if driver has active booking
 */
const hasActiveBooking = async (driverId) => {
    // Fallback to Scan
    const scanParams = {
        TableName: TABLE_NAME,
        FilterExpression: 'assignedDriverId = :driverId AND #status IN (:accepted, :approved, :in_progress)',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':driverId': driverId,
            ':accepted': 'driver_accepted',
            ':approved': 'vendor_approved',
            ':in_progress': 'in_progress'
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
        UpdateExpression: 'SET #status = :status, commissionStatus = :commissionStatus, updatedAt = :now, completedAt = :now',
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
const rejectCommission = async (bookingId, reason = null) => {
    let updateExpr = 'SET #status = :status, commissionStatus = :commissionStatus, updatedAt = :now';
    let exprVals = {
        ':status': 'commission_pending', // Back to simplified pending state
        ':commissionStatus': 'rejected',
        ':now': new Date().toISOString()
    };
    
    if (reason) {
        updateExpr += ', commissionRejectReason = :reason';
        exprVals[':reason'] = reason;
    }

    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: bookingId },
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: exprVals
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
    unpublishBooking,
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
    findLatestBookingByPhone,
    droppedTrip
};
