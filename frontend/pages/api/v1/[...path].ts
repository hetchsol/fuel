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

  // Read body for non-GET/HEAD methods
  let rawBody: Buffer | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    rawBody = await getRawBody(req)
  }

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  }
  if (rawBody && rawBody.length > 0) {
    fetchOptions.body = rawBody
  }

  try {
    let response = await fetch(url.toString(), fetchOptions)

    // Handle 307/308 redirects (e.g. FastAPI trailing-slash redirects)
    // Re-issue the request with the same method and body to the redirected URL
    if ((response.status === 307 || response.status === 308) && response.headers.get('location')) {
      const redirectUrl = new URL(response.headers.get('location')!, BACKEND_URL)
      const redirectOptions: RequestInit = {
        method: req.method,
        headers,
        redirect: 'manual',
      }
      if (rawBody && rawBody.length > 0) {
        redirectOptions.body = Buffer.from(rawBody)
      }
      response = await fetch(redirectUrl.toString(), redirectOptions)
    }

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
    console.error('Proxy error forwarding to backend:', error)
    res.status(502).json({ detail: 'Backend unavailable. Please try again shortly.' })
  }
}
