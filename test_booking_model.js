require('dotenv').config();
const bookingModel = require('./src/models/bookingModel');

async function run() {
    try {
        console.log('Creating draft trip...');
        const trip = await bookingModel.createBooking({
            vendorId: 'test-vendor',
            customerPhone: '1234567890',
            customerName: 'Test',
            pickupLocation: 'A',
            pickupCity: 'B',
            vehicleType: 'Sedan',
            scheduledDate: new Date().toISOString(),
            scheduledTime: '10:00',
            baseFare: 100,
            customerLanguage: 'Tamil',
            status: 'draft'
        });
        console.log('Created trip ID:', trip.id);
        
        console.log('Updating trip...');
        const updates = {
            category: 'Passenger',
            loadType: '',
            customerName: 'Test Name',
            customerPhone: '9876543210',
            customerLanguage: 'English',
            numberOfPeople: 4,
            pickupLocation: 'Chennai',
            pickupCity: 'Chennai',
            dropLocation: '',
            pickupLat: null,
            pickupLng: null,
            dropLat: null,
            dropLng: null,
            scheduledDate: new Date().toISOString(),
            scheduledTime: '12:00',
            returnDate: null,
            returnTime: null,
            vehicleType: 'SUV',
            baseFare: 500,
            perKmRate: 0,
            hourlyRate: null,
            estimatedHours: null,
            nightAllowance: 0,
            waitingChargesPerMin: 0,
            waitingCharges: 0,
            extraCharges: 0,
            driverAllowance: 0,
            vendorCommissionPercentage: 0,
            vendorCommission: null,
            hillsAllowance: 0,
            totalAmount: 500,
            distanceKm: null,
            estimatedDurationMins: null,
            estimatedDuration: null,
            minKmPerDay: null,
            packageId: null,
            driverMyBata: null,
            perDayRate: null,
            extraKmRate: 0,
            extraHrRate: 0,
            rentalHours: null,
            rentalKm: null,
            numberOfDays: 0,
            paymentMode: 'customer_pays_driver',
            initialTotal: 500,
            finalTotal: 500
        };
        
        await bookingModel.updateBooking(trip.id, updates);
        console.log('Update SUCCEEDED');
    } catch(e) {
        console.error('Update FAILED:', e.message);
        if (e.stack) console.error(e.stack);
    }
}
run();
