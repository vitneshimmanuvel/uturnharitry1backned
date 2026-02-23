const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);

const BOOKINGS_TABLE = 'uturn-bookings';
const SOLO_RIDES_TABLE = 'uturn-solo-rides';

/**
 * Check if a driver has any overlapping bookings
 * @param {string} driverId 
 * @param {string} requestedStart - ISO string
 * @param {string} requestedEnd - ISO string
 * @returns {Promise<{overlap: boolean, conflict: Object|null}>}
 */
const checkOverlap = async (driverId, requestedStart, requestedEnd) => {
    const start = new Date(requestedStart).getTime();
    const end = new Date(requestedEnd).getTime();

    // 1. Check Vendor Bookings
    const vendorResult = await docClient.send(new ScanCommand({
        TableName: BOOKINGS_TABLE,
        FilterExpression: 'assignedDriverId = :driverId AND #status IN (:accepted, :approved, :arrived, :started, :in_progress)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
            ':driverId': driverId,
            ':accepted': 'driver_accepted',
            ':approved': 'vendor_approved',
            ':arrived': 'arrived',
            ':started': 'started',
            ':in_progress': 'in_progress'
        }
    }));

    const overlappingVendor = (vendorResult.Items || []).find(booking => {
        // Need to reconstruct start/end from scheduleDate/Time and returnDate/Time
        // This is tricky because the backend format varies. 
        // For simplicity, we compare timestamps if available, or just block if same day?
        // User said: "use the date and time of that particular area"
        const bStart = new Date(`${booking.scheduleDate}T${booking.scheduleTime}`).getTime();
        // If it's a multi-day trip, use return info
        const bEndStr = (booking.returnDate && booking.returnTime) 
            ? `${booking.returnDate}T${booking.returnTime}`
            : new Date(bStart + 4 * 60 * 60 * 1000).toISOString(); // Default 4hr if unknown
        const bEnd = new Date(bEndStr).getTime();

        return (start < bEnd && end > bStart);
    });

    if (overlappingVendor) return { overlap: true, conflict: overlappingVendor };

    // 2. Check Solo Rides
    const soloResult = await docClient.send(new ScanCommand({
        TableName: SOLO_RIDES_TABLE,
        FilterExpression: 'driverId = :driverId AND #status IN (:confirmed, :started, :in_progress)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
            ':driverId': driverId,
            ':confirmed': 'confirmed',
            ':started': 'started',
            ':in_progress': 'in_progress'
        }
    }));

    const overlappingSolo = (soloResult.Items || []).find(ride => {
        const rStart = new Date(ride.scheduledDate).getTime();
        const rEndStr = ride.returnDate 
            ? ride.returnDate 
            : new Date(rStart + (ride.rentalHours || 4) * 60 * 60 * 1000).toISOString();
        const rEnd = new Date(rEndStr).getTime();

        return (start < rEnd && end > rStart);
    });

    if (overlappingSolo) return { overlap: true, conflict: overlappingSolo };

    return { overlap: false, conflict: null };
};

module.exports = {
    checkOverlap
};
