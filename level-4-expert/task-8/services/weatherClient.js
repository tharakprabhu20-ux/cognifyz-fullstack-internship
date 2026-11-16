/**
 * services/weatherClient.js
 * Client service for geocoding and weather forecasts via Open-Meteo API.
 * Validates inputs, handles geocoding, queries forecasts, and maps WMO weather codes.
 */

'use strict';

const { ValidationError, NotFoundError } = require('../errors/AppError');
const { fetchJsonWithRetry } = require('./httpClient');

const CITY_REGEX = /^[a-zA-Z\s.-]{2,60}$/;

const WMO_CODE_MAP = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail'
};

/**
 * Maps a numerical WMO weather interpretation code to a human-readable condition string.
 * @param {number|string} code
 * @returns {string}
 */
function mapWeatherCode(code) {
  const numCode = Number(code);
  return WMO_CODE_MAP[numCode] || 'Variable conditions';
}

/**
 * Validates the city parameter.
 * @param {string} city
 * @returns {string} Trimmed, sanitized city name
 */
function validateCity(city) {
  if (!city || typeof city !== 'string') {
    throw new ValidationError('City parameter is required', [
      { field: 'city', message: 'City name must be a non-empty string' }
    ]);
  }

  const trimmed = city.trim();
  if (!CITY_REGEX.test(trimmed)) {
    throw new ValidationError('Invalid city name format', [
      { field: 'city', message: 'City must be between 2 and 60 characters and contain only letters, spaces, hyphens, or periods' }
    ]);
  }

  return trimmed;
}

/**
 * Fetches geocoding and forecast data from Open-Meteo for a given city.
 * @param {string} rawCity - City name
 * @param {Object} [deps={}] - Dependency injection options
 * @param {Function} [deps.fetchImpl] - Injected fetch implementation
 * @param {Object} [deps.httpClientOpts] - Options passed to fetchJsonWithRetry
 * @returns {Promise<Object>} Normalized weather forecast object
 */
async function getWeatherForCity(rawCity, deps = {}) {
  const city = validateCity(rawCity);
  const fetchOpts = deps.httpClientOpts || {};
  if (deps.fetchImpl) {
    fetchOpts.fetchImpl = deps.fetchImpl;
  }

  // 1. Geocoding request
  const geocodeParams = new URLSearchParams({
    name: city,
    count: '1',
    language: 'en',
    format: 'json',
    countryCode: 'IN'
  });
  const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?${geocodeParams.toString()}`;

  const geocodeRes = await fetchJsonWithRetry(geocodeUrl, { method: 'GET' }, fetchOpts);
  const results = geocodeRes.data?.results;

  if (!Array.isArray(results) || results.length === 0) {
    throw new NotFoundError(`City '${city}' not found in weather registry`);
  }

  const location = results[0];
  const { latitude, longitude, name: matchedCity, country } = location;

  // 2. Forecast request
  const forecastParams = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,precipitation,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
    timezone: 'auto',
    forecast_days: '3'
  });
  const forecastUrl = `https://api.open-meteo.com/v1/forecast?${forecastParams.toString()}`;

  const forecastRes = await fetchJsonWithRetry(forecastUrl, { method: 'GET' }, fetchOpts);
  const forecastData = forecastRes.data || {};

  const current = forecastData.current || {};
  const daily = forecastData.daily || {};

  const dailyForecasts = [];
  const dates = daily.time || [];
  for (let i = 0; i < dates.length; i++) {
    const code = daily.weather_code?.[i] ?? 0;
    dailyForecasts.push({
      date: dates[i],
      temperatureMax: daily.temperature_2m_max?.[i] ?? null,
      temperatureMin: daily.temperature_2m_min?.[i] ?? null,
      precipitationProbability: daily.precipitation_probability_max?.[i] ?? 0,
      weatherCode: code,
      condition: mapWeatherCode(code)
    });
  }

  const currentCode = current.weather_code ?? 0;

  return {
    city: matchedCity || city,
    country: country || 'India',
    latitude,
    longitude,
    current: {
      temperature: current.temperature_2m ?? null,
      precipitation: current.precipitation ?? 0,
      weatherCode: currentCode,
      condition: mapWeatherCode(currentCode)
    },
    daily: dailyForecasts
  };
}

module.exports = {
  validateCity,
  mapWeatherCode,
  getWeatherForCity
};
