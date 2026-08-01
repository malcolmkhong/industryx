const WEATHER_IDS = new Set(['clear', 'rainy', 'stormy', 'sunny', 'foggy', 'snowy']);

export function parseGlobalWeatherSchedule(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const {
    min_duration_seconds: minDurationSeconds,
    max_duration_seconds: maxDurationSeconds,
    min_intensity: minIntensity,
    max_intensity: maxIntensity,
  } = value;
  if (
    !Number.isInteger(minDurationSeconds) ||
    !Number.isInteger(maxDurationSeconds) ||
    minDurationSeconds < 1800 ||
    maxDurationSeconds > 3600 ||
    maxDurationSeconds < minDurationSeconds ||
    typeof minIntensity !== 'number' ||
    typeof maxIntensity !== 'number' ||
    !Number.isFinite(minIntensity) ||
    !Number.isFinite(maxIntensity) ||
    minIntensity < 0 ||
    maxIntensity > 1 ||
    maxIntensity < minIntensity
  ) {
    return null;
  }
  return { minDurationSeconds, maxDurationSeconds, minIntensity, maxIntensity };
}

export function parseWeatherConfigRows(value) {
  if (!Array.isArray(value)) return null;
  const weatherIds = value
    .filter((row) => row && typeof row === 'object' && WEATHER_IDS.has(row.id))
    .map((row) => row.id);
  return weatherIds.length > 0 ? weatherIds : null;
}

export function selectNextGlobalWeather({ currentWeather, weatherIds, schedule, nowMs, random }) {
  if (!Array.isArray(weatherIds) || weatherIds.length === 0 || !schedule || typeof random !== 'function') {
    throw new Error('global weather selection requires validated configuration');
  }
  const randomValue = random();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new Error('global weather selection received invalid random value');
  }
  const candidates = weatherIds.length > 1
    ? weatherIds.filter((weatherId) => weatherId !== currentWeather)
    : weatherIds;
  const weatherIndex = Math.floor(randomValue * candidates.length);
  const current = candidates[weatherIndex];
  if (!current) throw new Error('global weather selection returned no weather type');

  const durationRange = schedule.maxDurationSeconds - schedule.minDurationSeconds + 1;
  const durationSeconds = schedule.minDurationSeconds + Math.floor(random() * durationRange);
  const intensity = schedule.minIntensity + random() * (schedule.maxIntensity - schedule.minIntensity);
  const startedAt = new Date(nowMs).toISOString();
  const nextChangeAt = new Date(nowMs + durationSeconds * 1000).toISOString();
  return { current, intensity, startedAt, nextChangeAt };
}
