/** Upload progress so far: bytes of the request body sent, out of `total`. */
export type UploadProgress = { loaded: number; total: number }

/**
 * Sends one request and reports how much of its body has gone out. fetch can't report upload
 * progress, so browsers use XMLHttpRequest; tests swap in {@link fetchTransport} (MSW intercepts
 * fetch there, not jsdom's XHR).
 */
export type UploadTransport = (
  request: Request,
  onProgress: (progress: UploadProgress) => void,
) => Promise<Response>

/** Statuses `new Response()` refuses a body for. */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])

function parseHeaders(raw: string): Headers {
  const headers = new Headers()
  for (const line of raw.trim().split(/[\r\n]+/)) {
    const colon = line.indexOf(':')
    if (colon > 0) headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim())
  }
  return headers
}

/** Rejects like fetch does: a TypeError for network failures, the signal's reason on abort. */
export const xhrTransport: UploadTransport = async (request, onProgress) => {
  // The multipart body as the browser encoded it; its boundary is in request's Content-Type.
  const body = await request.blob()
  const { signal } = request
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(request.method, request.url)
    xhr.responseType = 'blob'
    request.headers.forEach((value, name) => xhr.setRequestHeader(name, value))
    xhr.upload.addEventListener('progress', (event) =>
      onProgress({ loaded: event.loaded, total: event.lengthComputable ? event.total : body.size }),
    )
    xhr.addEventListener('load', () => {
      const status = xhr.status
      resolve(
        new Response(NULL_BODY_STATUSES.has(status) ? null : (xhr.response as Blob), {
          status,
          statusText: xhr.statusText,
          headers: parseHeaders(xhr.getAllResponseHeaders()),
        }),
      )
    })
    const failed = () => reject(new TypeError('Network request failed'))
    xhr.addEventListener('error', failed)
    xhr.addEventListener('timeout', failed)
    xhr.addEventListener('abort', () =>
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError')),
    )
    const abort = () => xhr.abort()
    xhr.addEventListener('loadend', () => signal.removeEventListener('abort', abort))
    signal.addEventListener('abort', abort, { once: true })
    xhr.send(body)
  })
}

/** For tests: plain fetch, with all of the body reported sent before the response arrives. */
export const fetchTransport: UploadTransport = async (request, onProgress) => {
  // Sent as bytes: Node's fetch can't re-send a FormData Request that MSW has looked at.
  const body = await request.blob()
  onProgress({ loaded: body.size, total: body.size })
  return fetch(
    new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body,
      signal: request.signal,
    }),
  )
}
