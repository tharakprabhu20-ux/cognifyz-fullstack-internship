/**
 * server.js
 * Entry point for starting the Student Task Manager application.
 * Validates environment variables, initializes MongoDB connection via Mongoose,
 * constructs production database stores, and binds Express to a network port.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const createApp = require('./app');
const taskStore = require('./store/taskStore.mongo');
const userStore = require('./store/userStore.mongo');

// 1. Environment Variable Validation
// Ensure secrets and connection strings are never printed in error logs
if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('USERNAME:PASSWORD') || process.env.MONGODB_URI.includes('<db_password>')) {
  console.error('Server startup aborted: MONGODB_URI is missing or contains unconfigured placeholder credentials.');
  console.error('Please edit your .env file and replace <db_password> (or USERNAME:PASSWORD) with your actual MongoDB Atlas password.');
  process.exit(1);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('Server startup aborted: JWT_SECRET is missing or shorter than 32 characters.');
  console.error('Please ensure a cryptographically secure JWT_SECRET of at least 32 characters is set in .env.');
  process.exit(1);
}

// 2. Enable Mongoose Sanitize Filter against query injection
mongoose.set('sanitizeFilter', true);

const PORT = process.env.PORT || 3000;

// 3. Connect to MongoDB and start HTTP listener
async function startServer() {
  try {
    console.log('Connecting to MongoDB database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    // Build Express app with Mongo stores and validated JWT secret
    const app = createApp({
      taskStore,
      userStore,
      jwtSecret: process.env.JWT_SECRET
    });

    const server = app.listen(PORT, () => {
      console.log(`Student Task Manager server is running at http://localhost:${PORT}`);
      console.log(`Health check endpoint: http://localhost:${PORT}/api/health`);
      console.log(`API documentation available in README.md`);
    });

    // Graceful shutdown handling
    const shutdown = async (signal) => {
      console.log(`\n${signal} signal received: closing HTTP server and database connection...`);
      server.close(async () => {
        try {
          await mongoose.connection.close();
          console.log('MongoDB connection closed. HTTP server terminated.');
          process.exit(0);
        } catch (err) {
          console.error('Error during database disconnect:', err.message);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    console.error('Failed to initialize server:', err.message);
    process.exit(1);
  }
}

startServer();
