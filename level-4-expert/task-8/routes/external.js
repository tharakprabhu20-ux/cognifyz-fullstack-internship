/**
 * routes/external.js
 * Express router for external API integrations:
 * - GET /api/external/weather
 *
 * Task 8 Enhancements:
 * - 10-minute caching by normalized city name
 * - In-flight promise map coalescing concurrent identical upstream calls into one
 * - Failures are never cached
 * - Private cache control headers (Cache-Control: private, no-cache)
 * - X-Cache: HIT|MISS headers
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
 * @param {Object} [options.cache] - Cache provider instance
 * @returns {express.Router}
 */
function createExternalRouter({
  requireAuth,
  rateLimiters = {},
  defaultCity = 'Hosur',
  fetchImpl,
  httpClientOpts,
  cache = null
}) {
  const router = express.Router();
  const weatherLimiter = rateLimiters.weather || ((req, res, next) => next());

  // In-flight promise map for coalescing concurrent identical requests
  const inFlightWeather = new Map();

  // =========================================================================
  // HTTP Method: GET
  // Path: /api/external/weather
  // Operation: Read (Fetches current weather and 3-day forecast from Open-Meteo)
  // Auth Requirement: Authenticated (JWT required)
  // Rate Limit: 20 per minute per authenticated user ID
  // Status Codes: 200 (OK), 400 (Bad Request), 401 (Unauthorized), 404 (Not Found), 429 (Rate Limited), 502/504 (Upstream Error)
  // =========================================================================
  router.get('/weather', requireAuth, weatherLimiter, asyncHandler(async (req, res) => {
    // Authenticated API responses must carry Cache-Control: private, no-cache
    res.setHeader('Cache-Control', 'private, no-cache');

    const requestedCity = typeof req.query.city === 'string' && req.query.city.trim() !== ''
      ? req.query.city
      : defaultCity;

    const normalizedCity = requestedCity.trim().toLowerCase();
    const cacheKey = `weather:${normalizedCity}`;

    // 1. Check cache for previous successful forecast (10 min TTL)
    if (cache) {
      const cached = await cache.get(cacheKey);
      if (cached !== null && cached !== undefined) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).type('application/json').send(cached);
      }
    }

    res.setHeader('X-Cache', 'MISS');

    // 2. Coalesce concurrent identical upstream queries using in-flight promise map
    let weatherPromise = inFlightWeather.get(normalizedCity);

    if (!weatherPromise) {
      weatherPromise = (async () => {
        try {
          const data = await getWeatherForCity(requestedCity, {
            fetchImpl,
            httpClientOpts
          });

          // Cache only on successful resolution (never cache upstream errors)
          if (cache) {
            await cache.set(cacheKey, JSON.stringify(data), 600); // 10 minutes (600s)
          }

          return data;
        } finally {
          inFlightWeather.delete(normalizedCity);
        }
      })();

      inFlightWeather.set(normalizedCity, weatherPromise);
    }

    const weatherData = await weatherPromise;
    return res.status(200).json(weatherData);
  }));

  return router;
}

module.exports = createExternalRouter;
