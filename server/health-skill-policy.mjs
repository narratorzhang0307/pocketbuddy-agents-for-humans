const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

const HEALTHSYNC_METRICS = new Set([
  'heart-rate', 'resting-heart-rate', 'hrv', 'heart-rate-recovery', 'steps', 'active-energy', 'basal-energy',
  'sleep', 'workouts', 'vo2max', 'running-speed', 'running-power', 'running-stride-length',
  'running-ground-contact-time', 'running-vertical-oscillation', 'body-mass', 'blood-pressure',
])
const HEALTHSYNC_TOTAL_METRICS = new Set(['steps', 'active-energy', 'basal-energy', 'sleep'])

export function buildHealthsyncReadCommand(query) {
  if (!query || !HEALTHSYNC_METRICS.has(query.metric)) throw new Error('healthsync_metric_not_allowed')
  if (query.from && !ISO_DAY.test(query.from)) throw new Error('invalid_from_date')
  if (query.to && !ISO_DAY.test(query.to)) throw new Error('invalid_to_date')
  const limit = query.limit ?? 50
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('invalid_limit')
  const command = ['healthsync', 'query', query.metric, '--format', 'json', '--limit', String(limit)]
  if (HEALTHSYNC_TOTAL_METRICS.has(query.metric)) command.push('--total')
  if (query.from) command.push('--from', query.from)
  // healthsync v0.5.3 compares its timestamp column directly with YYYY-MM-DD,
  // so an allegedly inclusive --to date otherwise stops at 00:00:00.
  if (query.to) command.push('--to', `${query.to} 23:59:59`)
  return command
}

export function buildHealthsyncImportCommand(filePath) {
  if (typeof filePath !== 'string' || !/\.(zip|xml)$/i.test(filePath)) throw new Error('invalid_health_export')
  return ['healthsync', 'parse', filePath]
}

export function buildGarminReadCommand(query) {
  if (!query || typeof query.operation !== 'string') throw new Error('garmin_operation_not_allowed')
  if (query.date && !ISO_DAY.test(query.date)) throw new Error('invalid_date')
  const dateArgs = query.date ? ['--date', query.date] : []
  switch (query.operation) {
    case 'auth-status': return ['garmin-connect', '--format', 'json', 'auth', 'status']
    case 'activities': {
      const limit = query.limit ?? 10
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid_limit')
      return ['garmin-connect', '--format', 'json', 'activities', 'list', '--limit', String(limit)]
    }
    case 'activity':
    case 'splits': {
      if (!query.activityId || !/^\d+$/.test(query.activityId)) throw new Error('invalid_activity_id')
      return ['garmin-connect', '--format', 'json', 'activities', query.operation === 'activity' ? 'get' : 'splits', query.activityId]
    }
    case 'athlete-stats': return ['garmin-connect', '--format', 'json', 'athlete', 'stats', ...dateArgs]
    case 'sleep': return ['garmin-connect', '--format', 'json', 'health', 'sleep', ...dateArgs]
    case 'heart-rate': return ['garmin-connect', '--format', 'json', 'health', 'heart-rate', ...dateArgs]
    case 'steps': return ['garmin-connect', '--format', 'json', 'health', 'steps', ...dateArgs]
    case 'stress': return ['garmin-connect', '--format', 'json', 'health', 'stress', ...dateArgs]
    case 'body-battery': return ['garmin-connect', '--format', 'json', 'health', 'body-battery', ...dateArgs]
    case 'resting-heart-rate': return ['garmin-connect', '--format', 'json', 'health', 'rhr', ...dateArgs]
    case 'training-status': return ['garmin-connect', '--format', 'json', 'training', 'status', ...dateArgs]
    case 'training-readiness': return ['garmin-connect', '--format', 'json', 'training', 'readiness', ...dateArgs]
    case 'vo2max': return ['garmin-connect', '--format', 'json', 'training', 'vo2max', ...dateArgs]
    case 'hrv': return ['garmin-connect', '--format', 'json', 'training', 'hrv', ...dateArgs]
    default: throw new Error('garmin_operation_not_allowed')
  }
}

const FOOD_FIELDS = 'code,product_name,brands,nutrition_grades,nutriments,serving_size,quantity'

export function buildOpenFoodFactsRequest(input) {
  const barcode = input?.barcode?.trim()
  if (barcode) {
    if (!/^\d{8,14}$/.test(barcode)) throw new Error('invalid_barcode')
    const url = new URL(`https://world.openfoodfacts.org/api/v3/product/${barcode}.json`)
    url.searchParams.set('fields', FOOD_FIELDS)
    return url
  }
  const query = input?.query?.trim()
  if (!query || query.length > 120) throw new Error('invalid_food_query')
  const pageSize = input.pageSize ?? 10
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 20) throw new Error('invalid_page_size')
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl')
  url.searchParams.set('search_terms', query)
  url.searchParams.set('search_simple', '1')
  url.searchParams.set('action', 'process')
  url.searchParams.set('json', '1')
  url.searchParams.set('page_size', String(pageSize))
  url.searchParams.set('fields', FOOD_FIELDS)
  return url
}
