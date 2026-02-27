/**
 * AWS Configuration for DynamoDB and S3
 */
require("dotenv").config();

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { S3Client } = require("@aws-sdk/client-s3");

// AWS Configuration
const awsConfig = {
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

// DynamoDB Client
const dynamoClient = new DynamoDBClient(awsConfig);
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

// S3 Client
const s3Client = new S3Client(awsConfig);

// Table Names
const TABLES = {
  VENDORS: "uturn-vendors",
  DRIVERS: "uturn-drivers",
  BOOKINGS: "uturn-bookings",
  vendors: "uturn-vendors",
  drivers: "uturn-drivers",
  bookings: "uturn-bookings",
  vehicles: "uturn-vehicles",
  loans: "uturn-loans",
  SOLO_RIDES: "uturn-solo-rides",
  MARKETPLACE_REQUESTS: "uturn-marketplace-requests",
  NOTIFICATIONS: "uturn-notifications",
};

// Alias for TABLE_NAMES
const TABLE_NAMES = TABLES;

// S3 Bucket
const S3_BUCKET = process.env.S3_BUCKET_NAME || "uturn-documents";

module.exports = {
  docClient,
  dynamoDb: dynamoClient, // Alias for backward compatibility
  dynamoClient,
  s3Client,
  TABLES,
  TABLE_NAMES, // Alias
  S3_BUCKET,
  awsConfig,
};
