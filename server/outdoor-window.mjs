// Public weather only. No model-generated URL, coordinates or precise device location.
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null
export async function readOutdoorWindow(city, { fetcher = fetch, dayOffset = 0 } = {}) {
  if (typeof city !== 'string' || !city.trim() || city.length > 60 || ![0, 1, 2].includes(dayOffset)) throw new Error('invalid_outdoor_query')
  const get = async url => {
    const r = await fetcher(url, { signal: AbortSignal.timeout(12000), redirect: 'error' })
    if (!r.ok) throw new Error('outdoor_data_unavailable')
    return r.json()
  }
  const geo = await get(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: city.trim(), count: '5', language: 'zh', format: 'json' })}`)
  const places = (geo.results || []).filter(p => finite(p.latitude) !== null && finite(p.longitude) !== null)
  // Do not silently choose between homonymous cities in different regions.
  const exact = places.filter(p => p.name === city.trim() || p.name === city.trim().replace(/市$/, ''))
  const matches = exact.length ? exact : places
  // A named administrative city outranks a homonymous village (e.g. Hangzhou).
  // Two administrative cities still require region clarification.
  const cities = matches.filter(p => /^PPLC|^PPLA\d?$/.test(p.feature_code || ''))
  const candidates = cities.length === 1 ? cities : matches
  if (!candidates.length) return { needsInput: true, message: '没有找到城市，请补充城市和省份。' }
  if (candidates.length > 1 && candidates.some(p => p.country_code !== candidates[0].country_code || p.admin1 !== candidates[0].admin1)) {
    return { needsInput: true, message: '有同名地点，请补充省份或国家。', candidates: candidates.map(p => `${p.name} · ${p.admin1 || ''} · ${p.country || ''}`) }
  }
  const place = candidates[0], coord = `latitude=${place.latitude}&longitude=${place.longitude}`
  const [weather, air] = await Promise.all([
    get(`https://api.open-meteo.com/v1/forecast?${coord}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,wind_speed_10m_max&forecast_days=3&timezone=auto`),
    get(`https://air-quality-api.open-meteo.com/v1/air-quality?${coord}&current=us_aqi,uv_index&timezone=auto`).catch(() => null),
  ])
  const c = weather.current || {}, a = air?.current || {}, d = weather.daily || {}
  if (!d.time?.[dayOffset] || (dayOffset === 0 && !c.time)) throw new Error('outdoor_data_incomplete')
  const current = Object.fromEntries(['temperature_2m', 'apparent_temperature', 'precipitation', 'wind_speed_10m', 'weather_code'].map(k => [k, finite(c[k])]))
  const forecast = Object.fromEntries(['temperature_2m_min', 'temperature_2m_max', 'weather_code', 'precipitation_probability_max', 'uv_index_max', 'wind_speed_10m_max'].map(k => [k, finite(d[k]?.[dayOffset])]))
  const hard = [], caution = []
  if (forecast.weather_code >= 95 || (!dayOffset && current.weather_code >= 95)) hard.push('所查日期有雷暴风险，暂停户外训练')
  if (!dayOffset) {
    if (finite(a.us_aqi) !== null && a.us_aqi >= 151) hard.push('空气质量较差，暂停户外训练')
    if (current.apparent_temperature !== null && (current.apparent_temperature >= 35 || current.apparent_temperature <= -5)) hard.push('体感温度风险，改到室内')
    if (current.precipitation >= 5 || current.wind_speed_10m >= 40) hard.push('降水或强风风险，改到室内')
    if (finite(a.us_aqi) === null) caution.push('空气质量缺失，不能确认户外安全')
    else if (a.us_aqi >= 101) caution.push('空气质量一般，降低强度')
    if (current.apparent_temperature >= 30 || a.uv_index >= 8) caution.push('注意高温或紫外线')
    if (Object.values(current).some(v => v === null)) caution.push('部分天气数据缺失')
  } else caution.push('未来天气为预报；没有该时段空气质量，出门前须复核')
  return { source: 'Open-Meteo weather / air-quality forecast models', retrievedAt: new Date().toISOString(),
    city: `${place.name} · ${place.admin1 || ''} · ${place.country || ''}`, timezone: weather.timezone,
    date: d.time[dayOffset], forecast, current: dayOffset ? undefined : { ...current, time: c.time, us_aqi: finite(a.us_aqi), uv_index: finite(a.uv_index), airTime: a.time || null },
    units: { temperature: '°C', precipitation: 'mm', wind: 'km/h', precipitation_probability: '%' },
    gate: hard.length ? 'red' : caution.length ? 'caution' : 'no_threshold_triggered',
    mandatory: [...hard, ...caution].join('；'),
  }
}
