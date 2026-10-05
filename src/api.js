const DEFAULT_KEYS = { weatherapi: '', openweather: '' }

export function getStoredKeys() {
  try {
    return { ...DEFAULT_KEYS, ...JSON.parse(localStorage.getItem('weather-meta-search-keys') || '{}') }
  } catch {
    return { ...DEFAULT_KEYS }
  }
}

export function saveStoredKeys(keys) {
  localStorage.setItem('weather-meta-search-keys', JSON.stringify(keys))
}

export async function geocode(query) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', query)
  url.searchParams.set('count', '7')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Geocoding failed (${response.status})`)
  const data = await response.json()
  return data.results || []
}

const WEATHER_CODES = {
  0: ['Clear sky', '☀️'],
  1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'],
  56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'], 67: ['Heavy freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '❄️'],
  80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌧️'], 82: ['Heavy rain showers', '🌧️'],
  85: ['Snow showers', '🌨️'], 86: ['Heavy snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm + hail', '⛈️'], 99: ['Thunderstorm + hail', '⛈️']
}

function codeToWeather(code) {
  const item = WEATHER_CODES[Number(code)] || ['Unknown', '🌡️']
  return { text: item[0], icon: item[1] }
}

function normalizeDaily(date, max, min, precip, code) {
  return { date, max: Number(max), min: Number(min), precip: precip == null ? null : Number(precip), ...codeToWeather(code) }
}

export async function fetchOpenMeteo(location) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', location.latitude)
  url.searchParams.set('longitude', location.longitude)
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m')
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_days', '7')

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Open-Meteo failed (${response.status})`)
  const data = await response.json()

  return {
    source: 'Open-Meteo',
    location: locationLabel(location),
    coords: { lat: location.latitude, lon: location.longitude },
    updated: data.current?.time,
    current: {
      temp: Number(data.current.temperature_2m), feels: Number(data.current.apparent_temperature),
      humidity: Number(data.current.relative_humidity_2m), wind: Number(data.current.wind_speed_10m),
      unit: data.current_units?.temperature_2m === '°F' ? 'F' : 'C',
      ...codeToWeather(data.current.weather_code)
    },
    forecast: data.daily.time.map((date, i) => normalizeDaily(
      date, data.daily.temperature_2m_max[i], data.daily.temperature_2m_min[i],
      data.daily.precipitation_probability_max?.[i], data.daily.weather_code[i]
    ))
  }
}

export async function fetchWttr(location) {
  const url = new URL('/api/wttr', window.location.origin)
  url.searchParams.set('q', location.name || locationLabel(location))
  const response = await fetch(url)
  if (!response.ok) throw new Error(await response.text())
  const data = await response.json()
  const current = data.current_condition?.[0]
  if (!current) throw new Error('wttr.in returned no current condition')
  return normalizeWttr(location, data)
}

function normalizeWttr(location, data) {
  const current = data.current_condition[0]
  const forecast = (data.weather || []).slice(0, 7).map(day => normalizeDaily(
    day.date,
    day.maxtempC,
    day.mintempC,
    (day.hourly || []).reduce((max, h) => Math.max(max, Number(h.chanceofrain || 0)), 0),
    day.hourly?.[4]?.weatherCode || day.hourly?.[0]?.weatherCode
  ))
  return {
    source: 'wttr.in', location: current.areaName?.[0]?.value || locationLabel(location),
    coords: { lat: Number(current.latitude || location.latitude), lon: Number(current.longitude || location.longitude) },
    updated: null,
    current: {
      temp: Number(current.temp_C), feels: Number(current.FeelsLikeC), humidity: Number(current.humidity),
      wind: Number(current.windspeedKmph), unit: 'C',
      text: current.weatherDesc?.[0]?.value || 'Unknown', icon: weatherIconFromText(current.weatherDesc?.[0]?.value)
    },
    forecast
  }
}

function weatherIconFromText(text = '') {
  const t = text.toLowerCase()
  if (t.includes('thunder')) return '⛈️'
  if (t.includes('snow') || t.includes('sleet')) return '🌨️'
  if (t.includes('rain') || t.includes('drizzle')) return '🌧️'
  if (t.includes('fog') || t.includes('mist')) return '🌫️'
  if (t.includes('overcast')) return '☁️'
  if (t.includes('cloud')) return '⛅'
  return '☀️'
}

export async function fetchMetNorway(location) {
  const url = new URL('/api/met', window.location.origin)
  url.searchParams.set('lat', location.latitude)
  url.searchParams.set('lon', location.longitude)
  const response = await fetch(url)
  if (!response.ok) throw new Error(await response.text())
  const data = await response.json()
  return normalizeMet(location, data)
}

function normalizeMet(location, data) {
  const timeseries = data.properties?.timeseries || []
  const first = timeseries[0]
  const instant = first?.data?.instant?.details || {}
  const symbol = first?.data?.next_1_hours?.summary?.symbol_code || first?.data?.next_6_hours?.summary?.symbol_code || 'clearsky_day'
  const current = {
    temp: Number(instant.air_temperature), feels: Number(instant.air_temperature),
    humidity: Number(instant.relative_humidity), wind: Number(instant.wind_speed), unit: 'C',
    text: symbolToText(symbol), icon: symbolToIcon(symbol)
  }

  const buckets = new Map()
  for (const point of timeseries) {
    const date = point.time.slice(0, 10)
    const details = point.data?.instant?.details || {}
    const s = point.data?.next_1_hours?.summary?.symbol_code || point.data?.next_6_hours?.summary?.symbol_code
    const bucket = buckets.get(date) || { date, max: -Infinity, min: Infinity, precip: null, code: s }
    const temp = Number(details.air_temperature)
    if (Number.isFinite(temp)) { bucket.max = Math.max(bucket.max, temp); bucket.min = Math.min(bucket.min, temp) }
    const pop = point.data?.next_1_hours?.details?.probability_of_precipitation
    if (pop != null) bucket.precip = Math.max(bucket.precip ?? 0, Number(pop))
    if (!bucket.code && s) bucket.code = s
    buckets.set(date, bucket)
  }
  const forecast = [...buckets.values()].slice(0, 7).map(x => ({
    ...normalizeDaily(x.date, x.max, x.min, x.precip, 0),
    text: symbolToText(x.code), icon: symbolToIcon(x.code)
  }))
  return { source: 'MET Norway', location: locationLabel(location), coords: { lat: location.latitude, lon: location.longitude }, updated: first?.time, current, forecast }
}

function symbolToText(symbol = '') {
  const t = symbol.replace(/_(day|night|polartwilight)$/i, '').replaceAll('_', ' ')
  return t || 'Unknown'
}
function symbolToIcon(symbol = '') {
  const s = symbol.toLowerCase()
  if (s.includes('thunder')) return '⛈️'
  if (s.includes('snow') || s.includes('sleet')) return '🌨️'
  if (s.includes('rain') || s.includes('drizzle')) return '🌧️'
  if (s.includes('fog')) return '🌫️'
  if (s.includes('cloud')) return '⛅'
  return '☀️'
}

export async function fetchWeatherApi(location, apiKey) {
  if (!apiKey) throw new Error('WeatherAPI requires an API key. Add it under the ⚙ settings button.')
  const url = new URL('/api/weatherapi', window.location.origin)
  url.searchParams.set('q', `${location.latitude},${location.longitude}`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('days', '3')
  const response = await fetch(url)
  if (!response.ok) throw new Error(await response.text())
  const data = await response.json()
  return normalizeWeatherApi(location, data)
}

function normalizeWeatherApi(location, data) {
  return {
    source: 'WeatherAPI.com', location: data.location?.name ? `${data.location.name}, ${data.location.country}` : locationLabel(location),
    coords: { lat: data.location?.lat ?? location.latitude, lon: data.location?.lon ?? location.longitude },
    updated: data.current?.last_updated,
    current: {
      temp: data.current.temp_c, feels: data.current.feelslike_c, humidity: data.current.humidity, wind: data.current.wind_kph,
      unit: 'C', text: data.current.condition?.text || 'Unknown', icon: weatherIconFromText(data.current.condition?.text)
    },
    forecast: (data.forecast?.forecastday || []).map(d => ({
      date: d.date, max: d.day.maxtemp_c, min: d.day.mintemp_c, precip: d.day.daily_chance_of_rain,
      text: d.day.condition?.text || 'Unknown', icon: weatherIconFromText(d.day.condition?.text)
    }))
  }
}

export async function fetchOpenWeather(location, apiKey) {
  if (!apiKey) throw new Error('OpenWeather requires an API key. Add it under the ⚙ settings button.')
  const url = new URL('/api/openweather', window.location.origin)
  url.searchParams.set('lat', location.latitude)
  url.searchParams.set('lon', location.longitude)
  url.searchParams.set('appid', apiKey)
  const response = await fetch(url)
  if (!response.ok) throw new Error(await response.text())
  const data = await response.json()
  return normalizeOpenWeather(location, data)
}

function normalizeOpenWeather(location, data) {
  const daily = data.daily || []
  return {
    source: 'OpenWeather', location: locationLabel(location),
    coords: { lat: location.latitude, lon: location.longitude }, updated: new Date().toISOString(),
    current: {
      temp: kelvinToC(data.current?.temp), feels: kelvinToC(data.current?.feels_like), humidity: data.current?.humidity,
      wind: data.current?.wind_speed ? data.current.wind_speed * 3.6 : null, unit: 'C',
      text: data.current?.weather?.[0]?.description || 'Unknown', icon: owIcon(data.current?.weather?.[0]?.icon)
    },
    forecast: daily.slice(0, 7).map(d => ({
      date: new Date(d.dt * 1000).toISOString().slice(0, 10), max: kelvinToC(d.temp.max), min: kelvinToC(d.temp.min),
      precip: Math.round((d.pop || 0) * 100), text: d.weather?.[0]?.description || 'Unknown', icon: owIcon(d.weather?.[0]?.icon)
    }))
  }
}
function kelvinToC(value) { return value == null ? null : Math.round((Number(value) - 273.15) * 10) / 10 }
function owIcon(icon = '') { if (icon.startsWith('09') || icon.startsWith('10')) return '🌧️'; if (icon.startsWith('11')) return '⛈️'; if (icon.startsWith('13')) return '❄️'; if (icon.startsWith('50')) return '🌫️'; if (icon.startsWith('02')) return '⛅'; if (icon.startsWith('03') || icon.startsWith('04')) return '☁️'; return '☀️' }

function locationLabel(location) {
  return [location.name, location.admin1, location.country].filter(Boolean).join(', ')
}
