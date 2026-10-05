<script setup>
import { computed, onMounted, ref } from 'vue'
import { fetchMetNorway, fetchOpenMeteo, fetchOpenWeather, fetchWeatherApi, fetchWttr, geocode, getStoredKeys, saveStoredKeys } from './api'

const providers = [
  { id: 'open-meteo', name: 'Open-Meteo', note: 'No key', fn: fetchOpenMeteo },
  { id: 'wttr', name: 'wttr.in', note: 'Public JSON', fn: fetchWttr },
  { id: 'met', name: 'MET Norway', note: 'Free / proxy', fn: fetchMetNorway },
  { id: 'weatherapi', name: 'WeatherAPI.com', note: 'API key', fn: fetchWeatherApi },
  { id: 'openweather', name: 'OpenWeather', note: 'API key', fn: fetchOpenWeather }
]

const query = ref('')
const providerId = ref(localStorage.getItem('weather-meta-provider') || 'open-meteo')
const locations = ref([])
const selectedLocation = ref(null)
const results = ref(null)
const loading = ref(false)
const error = ref('')
const isDark = ref(localStorage.getItem('weather-meta-dark') === '1')
const showSettings = ref(false)
const keys = ref(getStoredKeys())

const provider = computed(() => providers.find(p => p.id === providerId.value) || providers[0])
const formattedUpdated = computed(() => results.value?.updated ? new Date(results.value.updated).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '')

onMounted(() => document.documentElement.dataset.theme = isDark.value ? 'dark' : 'light')

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.dataset.theme = isDark.value ? 'dark' : 'light'
  localStorage.setItem('weather-meta-dark', isDark.value ? '1' : '0')
}

function setProvider() {
  localStorage.setItem('weather-meta-provider', providerId.value)
  results.value = null
  error.value = ''
}

function saveKeys() {
  saveStoredKeys(keys.value)
  showSettings.value = false
}

async function submit() {
  if (!query.value.trim()) return
  loading.value = true
  error.value = ''
  results.value = null
  try {
    locations.value = await geocode(query.value.trim())
    if (!locations.value.length) throw new Error('No locations found. Try a city, region, or country name.')
    selectedLocation.value = locations.value[0]
    await runWeather()
  } catch (e) {
    error.value = e?.message || 'Something went wrong.'
  } finally {
    loading.value = false
  }
}

async function chooseLocation(location) {
  selectedLocation.value = location
  loading.value = true
  error.value = ''
  try { await runWeather() } catch (e) { error.value = e?.message || 'Something went wrong.' } finally { loading.value = false }
}

async function runWeather() {
  const fn = provider.value.fn
  const key = keys.value[providerId.value]
  results.value = await fn(selectedLocation.value, key)
}

function formatDay(date, index) {
  if (index === 0) return 'Today'
  return new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'short' })
}
function temp(value) { return value == null || Number.isNaN(Number(value)) ? '—' : `${Math.round(Number(value))}°` }
function fullTemp(value) { return value == null || Number.isNaN(Number(value)) ? '—' : `${Math.round(Number(value))}°${results.value?.current?.unit || 'C'}` }
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">Weather <span>MetaSearch</span></div>
      <div class="top-actions">
        <button class="icon-btn" aria-label="Settings" title="Settings" @click="showSettings = !showSettings">⚙</button>
        <button class="icon-btn" aria-label="Toggle dark mode" title="Toggle dark mode" @click="toggleTheme">{{ isDark ? '☾' : '☀' }}</button>
      </div>
    </header>

    <section class="hero">
      <div class="search-wrap">
        <form class="search-row" @submit.prevent="submit">
          <div class="search-icon">⌕</div>
          <input v-model="query" aria-label="Search location" autocomplete="off" placeholder="Search city or country" />
          <select v-model="providerId" aria-label="Weather search engine" @change="setProvider">
            <option v-for="item in providers" :key="item.id" :value="item.id">{{ item.name }} · {{ item.note }}</option>
          </select>
          <button class="search-btn" :disabled="loading">{{ loading ? '…' : 'Search' }}</button>
        </form>
        <div v-if="locations.length > 1" class="location-strip">
          <button v-for="location in locations" :key="`${location.id}-${location.latitude}-${location.longitude}`" class="location-pill" :class="{ active: selectedLocation?.id === location.id }" @click="chooseLocation(location)">
            {{ location.name }}<span v-if="location.country">, {{ location.country }}</span>
          </button>
        </div>
      </div>
    </section>

    <section v-if="showSettings" class="settings-card card">
      <div class="settings-head"><div><strong>Provider settings</strong><p>API keys stay in this browser's local storage.</p></div><button class="link-btn" @click="showSettings = false">Close</button></div>
      <label>WeatherAPI.com key<input v-model="keys.weatherapi" type="password" placeholder="Optional" /></label>
      <label>OpenWeather key<input v-model="keys.openweather" type="password" placeholder="Optional" /></label>
      <div class="settings-foot"><span>Keys are only sent to your local proxy.</span><button class="search-btn small" @click="saveKeys">Save</button></div>
    </section>

    <section v-if="loading" class="status card">Fetching {{ provider.name }}…</section>
    <section v-else-if="error" class="status card error">{{ error }}</section>

    <section v-if="results" class="results">
      <div class="result-meta">
        <div><h1>{{ results.location }}</h1><p>{{ provider.name }} · {{ results.coords.lat.toFixed(2) }}, {{ results.coords.lon.toFixed(2) }}<span v-if="formattedUpdated"> · Updated {{ formattedUpdated }}</span></p></div>
        <a class="source-link" href="#" @click.prevent="results = null">Clear</a>
      </div>

      <div class="now-grid">
        <article class="card current-card">
          <div class="weather-icon">{{ results.current.icon }}</div>
          <div class="temp-now">{{ fullTemp(results.current.temp) }}</div>
          <div class="condition">{{ results.current.text }}</div>
          <div class="feels">Feels like {{ fullTemp(results.current.feels) }}</div>
          <div class="stats"><span>Humidity <b>{{ results.current.humidity ?? '—' }}%</b></span><span>Wind <b>{{ results.current.wind ?? '—' }} km/h</b></span></div>
        </article>
        <article class="card forecast-card">
          <div class="card-title">Forecast</div>
          <div class="forecast-row">
            <div v-for="(day, index) in results.forecast" :key="day.date" class="day">
              <div class="day-name">{{ formatDay(day.date, index) }}</div>
              <div class="day-icon">{{ day.icon }}</div>
              <div class="day-temps"><b>{{ temp(day.max) }}</b><span>{{ temp(day.min) }}</span></div>
              <div class="rain" v-if="day.precip != null">{{ Math.round(day.precip) }}% rain</div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section v-else class="empty">
      <div class="empty-icon">☁︎</div>
      <h2>Search for weather</h2>
      <p>Try <button class="inline-link" @click="query = 'Madrid'; submit()">Madrid</button>, Tokyo, New York, or any country.</p>
      <div class="provider-hint"><span class="dot"></span>{{ provider.name }} · {{ provider.note }}</div>
    </section>

    <footer>Weather MetaSearch · lightweight Vue frontend · data sources are credited by provider</footer>
  </main>
</template>
