const twilio = require('twilio');

// Twilio configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER; // Format: whatsapp:+14155238886

// Only initialize client if credentials are provided
// Only initialize client if credentials are provided
// let client = null;
// if (accountSid && authToken && accountSid.startsWith('AC')) {
//    client = twilio(accountSid, authToken);
//    console.log('✅ Twilio WhatsApp service initialized');
// } else {
//    console.warn('⚠️ Twilio message sending PAUSED by user request');
// }
let client = null;
console.log('NOTICE: Twilio WhatsApp service is currently DISABLED per user request.');
console.warn('⚠️ All messages will be simulated in console.');

/**
 * Send WhatsApp message using Twilio
 * @param {string} to - Recipient phone number (e.g., '+919876543210')
 * @param {string} message - Message text
 * @returns {Promise<object>} Message result
 */
const sendWhatsApp = async (to, message) => {
    // If Twilio is not configured, simulate sending
    if (!client) {
        console.log(`📱 [SIMULATED] WhatsApp to ${to}:`);
        console.log(message.substring(0, 100) + '...');
        return { success: true, simulated: true, sid: 'SIM_' + Date.now() };
    }
    
    try {
        // Ensure phone number has country code and whatsapp prefix
        const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
        
        const result = await client.messages.create({
            from: whatsappNumber,
            to: formattedTo,
            body: message
        });
        
        console.log(`WhatsApp sent to ${to}:`, result.sid);
        return { success: true, sid: result.sid };
    } catch (error) {
        console.error('WhatsApp send error:', error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Send booking confirmation to customer
 */
const sendBookingConfirmation = async (customerPhone, bookingData) => {
    const message = 
`🚗 *U-Turn Booking Created!*

Hi ${bookingData.customerName},

Your ride has been booked.

📍 Pickup: ${bookingData.pickupAddress}
🏁 Drop: ${bookingData.dropAddress}
📅 Date: ${bookingData.scheduleDate}
⏰ Time: ${bookingData.scheduleTime}
🚙 Vehicle: ${bookingData.vehicleType}
💰 Package: ₹${bookingData.packageAmount}

We'll notify you once a driver accepts.

Thank you! 🙏`;
    
    return await sendWhatsApp(customerPhone, message);
};

/**
 * Send driver confirmation to customer with trip link
 */
const sendDriverConfirmation = async (customerPhone, bookingData, driverData) => {
    const tripLink = `${process.env.APP_BASE_URL}/trip/${bookingData.id}`;
    
    const message = 
`✅ *Driver Confirmed for Your Trip!*

Hi ${bookingData.customerName},

Your driver has been assigned!

👨‍✈️ Driver: ${driverData.name}
📞 Phone: ${driverData.phone}
🚗 Vehicle: ${driverData.vehicleNumber}

👉 View trip details & track:
${tripLink}

Your OTP for trip start will be sent when driver arrives.

Safe travels! 🛣️`;
    
    return await sendWhatsApp(customerPhone, message);
};

/**
 * Send OTP to customer
 */
const sendTripOTP = async (customerPhone, otp, customerName) => {
    const message = 
`🔐 *Trip Start OTP*

Hi ${customerName},

Your driver has arrived at the pickup location.

Your OTP: *${otp}*

Please provide this OTP to the driver to start your trip.

- U-Turn Team`;
    
    return await sendWhatsApp(customerPhone, message);
};

/**
 * Send trip completion summary to customer
 */
const sendTripSummary = async (customerPhone, bookingData, tripData) => {
    const message = 
`✅ *Trip Completed!*

Hi ${bookingData.customerName},

Thank you for choosing U-Turn!

📊 Trip Summary:
🛣️ Distance: ${tripData.distanceKm} km
⏱️ Duration: ${tripData.durationMins} mins
${tripData.waitingMins > 0 ? `⏳ Waiting: ${tripData.waitingMins} mins\n` : ''}
💰 Total Amount: ₹${tripData.totalAmount}

Hope you had a pleasant journey! 🙏`;
    
    return await sendWhatsApp(customerPhone, message);
};

/**
 * Send confirmation to vendor
 */
const sendVendorConfirmation = async (vendorPhone, bookingData) => {
    const message = 
`✅ *Trip Confirmed!*

Booking #${bookingData.id.slice(0, 8)} approved.

👤 Customer: ${bookingData.customerName}
🚗 Driver: ${bookingData.driverName}
📍 ${bookingData.pickupAddress} → ${bookingData.dropAddress}
💰 ₹${bookingData.packageAmount}

View details in app.`;
    
    return await sendWhatsApp(vendorPhone, message);
};

module.exports = {
    sendWhatsApp,
    sendBookingConfirmation,
    sendDriverConfirmation,
    sendTripOTP,
    sendTripSummary,
    sendVendorConfirmation
};
