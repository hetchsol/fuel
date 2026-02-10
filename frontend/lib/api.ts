
export const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';

function getHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('accessToken')
  const stationId = localStorage.getItem('stationId')
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(stationId ? { 'X-Station-Id': stationId } : {}),
  }
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = {
    ...getHeaders(),
    ...(options.headers as Record<string, string> || {}),
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const errorBody = JSON.stringify({
        detail: `Server unavailable (${response.status}). The API may be starting up — please wait 30-60 seconds and try again.`
      });
      return new Response(errorBody, {
        status: response.status,
        statusText: response.statusText,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  return response;
}

export async function getDaily(date?: string) {
  const qs = date ? `?date=${date}` : '';
  const res = await fetch(`${BASE}/reports/daily${qs}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load daily');
  return res.json();
}

export async function getFlags(limit: number = 10) {
  const res = await fetch(`${BASE}/discrepancies?limit=${limit}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load flags');
  return res.json();
}

export async function getTankLevels() {
  const res = await fetch(`${BASE}/tanks/levels`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load tank levels');
  return res.json();
}

// Advanced Reporting APIs
export async function getStaffReport(staffName: string, startDate?: string, endDate?: string) {
  let url = `${BASE}/reports/staff/${encodeURIComponent(staffName)}`;
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load staff report');
  return res.json();
}

export async function getNozzleReport(nozzleId: string, startDate?: string, endDate?: string) {
  let url = `${BASE}/reports/nozzle/${encodeURIComponent(nozzleId)}`;
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load nozzle report');
  return res.json();
}

export async function getIslandReport(islandId: string, startDate?: string, endDate?: string) {
  let url = `${BASE}/reports/island/${encodeURIComponent(islandId)}`;
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load island report');
  return res.json();
}

export async function getProductReport(productType: string, startDate?: string, endDate?: string) {
  let url = `${BASE}/reports/product/${encodeURIComponent(productType)}`;
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load product report');
  return res.json();
}

export async function getCustomReport(filters: {
  staff_name?: string;
  nozzle_id?: string;
  island_id?: string;
  product_type?: string;
  shift_id?: string;
  start_date?: string;
  end_date?: string;
}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });

  const res = await fetch(`${BASE}/reports/custom?${params.toString()}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load custom report');
  return res.json();
}

export async function getMonthlyReport(year: number, month: number) {
  const res = await fetch(`${BASE}/reports/monthly?year=${year}&month=${month}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load monthly report');
  return res.json();
}

// List and Aggregate Report APIs
export async function getStaffList(startDate?: string, endDate?: string) {
  let url = `${BASE}/reports/staff/list`;
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load staff list');
  return res.json();
}

export async function getAllStaffReports(startDate?: string, endDate?: string) {
  let url = `${BASE}/reports/staff/all`;
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load all staff reports');
  return res.json();
}

export async function getNozzleList(startDate?: string, endDate?: string) {
  let url = `${BASE}/reports/nozzle/list`;
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load nozzle list');
  return res.json();
}

export async function getAllNozzleReports(startDate?: string, endDate?: string) {
  let url = `${BASE}/reports/nozzle/all`;
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load all nozzle reports');
  return res.json();
}

export async function getIslandList(startDate?: string, endDate?: string) {
  let url = `${BASE}/reports/island/list`;
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load island list');
  return res.json();
}

export async function getAllIslandReports(startDate?: string, endDate?: string) {
  let url = `${BASE}/reports/island/all`;
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load all island reports');
  return res.json();
}

export async function getProductList(startDate?: string, endDate?: string) {
  let url = `${BASE}/reports/product/list`;
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load product list');
  return res.json();
}

export async function getAllProductReports(startDate?: string, endDate?: string) {
  let url = `${BASE}/reports/product/all`;
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to load all product reports');
  return res.json();
}

export default {} as any
