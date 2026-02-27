const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const bookingModel = require("./src/models/bookingModel");
require("dotenv").config();

async function testAccept() {
  const bookingId = "9474f557-4a0c-43f7-b3bf-c0e8684d3ab3";
  const driverId = "9d809694-10bd-4769-a5f8-878866fd9e8a"; // Vijay's ID from datadump
  
  try {
    console.log(`Searching for booking ${bookingId}...`);
    const booking = await bookingModel.getBookingById(bookingId);
    if (!booking) {
        console.log("Error: Booking NOT FOUND in DB");
    } else {
        console.log(`Found booking. Current status: '${booking.status}'`);
    }

    console.log(`Testing acceptance for booking ${bookingId} with driver ${driverId}`);
    const result = await bookingModel.acceptBooking(bookingId, driverId);
    console.log("Success!", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Failed:", error.message);
    if (error.stack) console.error(error.stack);
  }
}

testAccept();
