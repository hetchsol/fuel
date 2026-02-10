export const BASE = '/api/v1'

export function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
  const stationId = typeof window !== 'undefined' ? localStorage.getItem('stationId') : null
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(stationId ? { 'X-Station-Id': stationId } : {}),
  }
}
