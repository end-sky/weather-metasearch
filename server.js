import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cheerio from 'cheerio'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 8787

app.use(express.json())

function fail(res, status, message) { res.status(status).type('text/plain').send(message) }

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/api/wttr', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (!q) return fail(res, 400, 'Missing q')
  try {
    const upstream = await fetch(`https://wttr.in/${encodeURIComponent(q)}?format=j1`, { headers: { 'Accept': 'application/json' } })
    const body = await upstream.text()
    if (!upstream.ok) return fail(res, upstream.status, `wttr.in error (${upstream.status})`)
    res.type('application/json').send(body)
  } catch (err) { fail(res, 502, `wttr.in proxy error: ${err.message}`) }
})

app.get('/api/met', async (req, res) => {
  const lat = Number(req.query.lat), lon = Number(req.query.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return fail(res, 400, 'Invalid coordinates')
  try {
    const upstream = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`, {
      headers: { 'User-Agent': process.env.MET_USER_AGENT || 'WeatherMetaSearch/1.0 https://localhost/' }
    })
    const body = await upstream.text()
    if (!upstream.ok) return fail(res, upstream.status, `MET Norway error (${upstream.status}). Set MET_USER_AGENT if needed.`)
    res.type('application/json').send(body)
  } catch (err) { fail(res, 502, `MET Norway proxy error: ${err.message}`) }
})

app.get('/api/weatherapi', async (req, res) => {
  const key = String(req.query.key || '').trim()
  const q = String(req.query.q || '').trim()
  const days = Math.min(14, Math.max(1, Number(req.query.days || 3)))
  if (!key || !q) return fail(res, 400, 'Missing WeatherAPI key or q')
  try {
    const url = new URL('https://api.weatherapi.com/v1/forecast.json')
    url.searchParams.set('key', key)
    url.searchParams.set('q', q)
    url.searchParams.set('days', String(days))
    url.searchParams.set('aqi', 'no')
    url.searchParams.set('alerts', 'no')
    const upstream = await fetch(url)
    const body = await upstream.text()
    if (!upstream.ok) return fail(res, upstream.status, body)
    res.type('application/json').send(body)
  } catch (err) { fail(res, 502, `WeatherAPI proxy error: ${err.message}`) }
})

app.get('/api/openweather', async (req, res) => {
  const appid = String(req.query.appid || '').trim()
  const lat = Number(req.query.lat), lon = Number(req.query.lon)
  if (!appid || !Number.isFinite(lat) || !Number.isFinite(lon)) return fail(res, 400, 'Missing OpenWeather key or coordinates')
  try {
    const url = new URL('https://api.openweathermap.org/data/3.0/onecall')
    url.searchParams.set('lat', lat)
    url.searchParams.set('lon', lon)
    url.searchParams.set('appid', appid)
    url.searchParams.set('exclude', 'minutely,hourly,alerts')
    url.searchParams.set('units', 'standard')
    const upstream = await fetch(url)
    const body = await upstream.text()
    if (!upstream.ok) return fail(res, upstream.status, body)
    res.type('application/json').send(body)
  } catch (err) { fail(res, 502, `OpenWeather proxy error: ${err.message}`) }
})

// Optional experimental HTML scraper helper for future site adapters.
// It is deliberately not used by the UI because consumer-weather websites
// frequently change markup and may restrict automated access.
app.get('/api/scrape-title', async (req, res) => {
  const target = String(req.query.url || '').trim()
  if (!/^https:\/\//i.test(target)) return fail(res, 400, 'Only https URLs are supported')
  try {
    const upstream = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0 WeatherMetaSearch/1.0' } })
    const html = await upstream.text()
    const $ = cheerio.load(html)
    res.json({ title: $('title').first().text().trim(), h1: $('h1').first().text().trim() })
  } catch (err) { fail(res, 502, `Scrape error: ${err.message}`) }
})

const dist = path.join(__dirname, 'dist')
app.use(express.static(dist))
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(dist, 'index.html'), err => { if (err) next(err) })
})

app.listen(PORT, () => console.log(`Weather MetaSearch server: http://127.0.0.1:${PORT}`))
