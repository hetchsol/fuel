import type { NextApiRequest, NextApiResponse } from 'next'

export const config = {
  api: {
    bodyParser: false,
  },
}

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

function getRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path } = req.query
  const pathStr = Array.isArray(path) ? path.join('/') : path || ''

  // Rebuild query string (exclude the catch-all path param)
  const url = new URL(`/api/v1/${pathStr}`, BACKEND_URL)
  for (const [key, val] of Object.entries(req.query)) {
    if (key !== 'path') {
      url.searchParams.append(key, Array.isArray(val) ? val[0] : val || '')
    }
  }

  // Forward relevant headers from the client request
  const headers: Record<string, string> = {}
  if (req.headers.authorization) headers['Authorization'] = req.headers.authorization as string
  if (req.headers['x-station-id']) headers['X-Station-Id'] = req.headers['x-station-id'] as string
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'] as string

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    fetchOptions.body = await getRawBody(req)
  }

  try {
    const response = await fetch(url.toString(), fetchOptions)
    const contentType = response.headers.get('content-type') || ''

    res.status(response.status)

    if (contentType.includes('application/json')) {
      const data = await response.json()
      res.json(data)
    } else {
      const text = await response.text()
      res.send(text)
    }
  } catch (error) {
    res.status(502).json({ detail: 'Backend unavailable. Please try again shortly.' })
  }
}
