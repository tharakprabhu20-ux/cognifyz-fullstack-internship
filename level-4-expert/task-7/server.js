/**
 * server.js
 * Entry point for starting the Student Task Manager application.
 * Validates environment variables, initializes MongoDB connection via Mongoose,
 * constructs production database stores, attaches process crash guards,
 * and binds Express to a network port.
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const createApp = require('./app');
const taskStore = require('./store/taskStore.mongo');
const userStore = require('./store/userStore.mongo');
const { isOAuthConfigured } = require('./services/githubOAuth');

// Global safety crash handlers: ensure unexpected errors are logged without leaking secrets, then exit
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception detected:', err.message || 'Unknown error');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Promise Rejection detected:', reason instanceof Error ? reason.message : 'Unknown reason');
  process.exit(1);
});

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

// 2. Read OAuth & External API configuration
const oauthConfig = {
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  baseUrl: process.env.APP_BASE_URL || 'http://localhost:3000'
};

const defaultCity = process.env.DEFAULT_CITY || 'Hosur';

// Production Rate Limiting configuration
const rateLimitOptions = {
  generalLimit: 100, // 100 requests per 15 min per IP
  generalWindowMs: 15 * 60 * 1000,
  loginLimit: 10, // 10 failed login attempts per 15 min per IP
  loginWindowMs: 15 * 60 * 1000,
  registerLimit: 5, // 5 registrations per hour per IP
  registerWindowMs: 60 * 60 * 1000,
  oauthExchangeLimit: 10, // 10 exchange attempts per minute per IP
  oauthWindowMs: 60 * 1000,
  weatherLimit: 20, // 20 weather requests per minute per authenticated user ID
  weatherWindowMs: 60 * 1000
};

// 3. Enable Mongoose Sanitize Filter against query injection
mongoose.set('sanitizeFilter', true);

const PORT = process.env.PORT || 3000;

// 4. Connect to MongoDB and start HTTP listener
async function startServer() {
  try {
    console.log('Connecting to MongoDB database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    // Build Express app with Mongo stores, validated JWT secret, OAuth config, and rate limits
    const app = createApp({
      taskStore,
      userStore,
      jwtSecret: process.env.JWT_SECRET,
      oauthConfig,
      defaultCity,
      rateLimitOptions
    });

    const server = app.listen(PORT, () => {
      console.log(`Student Task Manager server is running at http://localhost:${PORT}`);
      console.log(`Health check endpoint: http://localhost:${PORT}/api/health`);
      if (isOAuthConfigured(oauthConfig)) {
        console.log(`GitHub OAuth: Configured (Client ID: ${oauthConfig.clientId ? oauthConfig.clientId.slice(0, 4) + '...' : 'none'})`);
      } else {
        console.log('GitHub OAuth: Not configured (placeholders or credentials missing; OAuth routes return 503)');
      }
      console.log(`Default Weather City: ${defaultCity}`);
      console.log('API documentation available in README.md');
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
