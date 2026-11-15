/**
 * routes/external.js
 * Express router for external API integrations:
 * - GET /api/external/weather
 */

'use strict';

const express = require('express');
const { getWeatherForCity } = require('../services/weatherClient');
const { asyncHandler } = require('../errors/AppError');

/**
 * Creates the external integration router.
 * @param {Object} options
 * @param {Function} options.requireAuth - Authentication middleware
 * @param {Object} [options.rateLimiters] - Rate limiters
 * @param {string} [options.defaultCity='Hosur'] - Default city fallback
 * @param {Function} [options.fetchImpl] - Fetch implementation
 * @param {Object} [options.httpClientOpts] - HTTP client options
 * @returns {express.Router}
 */
function createExternalRouter({ requireAuth, rateLimiters = {}, defaultCity = 'Hosur', fetchImpl, httpClientOpts }) {
  const router = express.Router();
  const weatherLimiter = rateLimiters.weather || ((req, res, next) => next());

  // =========================================================================
  // HTTP Method: GET
  // Path: /api/external/weather
  // Operation: Read (Fetches current weather and 3-day forecast from Open-Meteo)
  // Auth Requirement: Authenticated (JWT required)
  // Rate Limit: 20 per minute per authenticated user ID
  // Status Codes: 200 (OK), 400 (Bad Request), 401 (Unauthorized), 404 (Not Found), 429 (Rate Limited), 502/504 (Upstream Error)
  // =========================================================================
  router.get('/weather', requireAuth, weatherLimiter, asyncHandler(async (req, res) => {
    const requestedCity = typeof req.query.city === 'string' && req.query.city.trim() !== ''
      ? req.query.city
      : defaultCity;

    const weatherData = await getWeatherForCity(requestedCity, {
      fetchImpl,
      httpClientOpts
    });

    return res.status(200).json(weatherData);
  }));

  return router;
}

module.exports = createExternalRouter;
