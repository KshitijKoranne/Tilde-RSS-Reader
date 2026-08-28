import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'

/* Mounts api/feed.js into the Vite dev and preview servers.
 *
 * Without this, local development either needs `vercel dev` or silently falls
 * back to a public proxy — meaning the thing you test is not the thing you
 * ship. This adapter gives the function the small slice of the Vercel response
 * API it uses, so the same file runs in both places.
 */

interface VercelLikeResponse extends ServerResponse {
  status(code: number): VercelLikeResponse
  json(body: unknown): VercelLikeResponse
  send(body: string | Buffer): VercelLikeResponse
}

function adapt(res: ServerResponse): VercelLikeResponse {
  const shimmed = res as VercelLikeResponse
  shimmed.status = (code: number) => {
    shimmed.statusCode = code
    return shimmed
  }
  shimmed.json = (body: unknown) => {
    shimmed.setHeader('Content-Type', 'application/json; charset=utf-8')
    shimmed.end(JSON.stringify(body))
    return shimmed
  }
  shimmed.send = (body: string | Buffer) => {
    shimmed.end(body)
    return shimmed
  }
  return shimmed
}

type Handler = (req: IncomingMessage, res: VercelLikeResponse) => Promise<unknown>

export function apiPlugin(): Plugin {
  const mount = (server: ViteDevServer) => {
    server.middlewares.use('/api/feed', (req, res, next) => {
      void (async () => {
        try {
          const module = (await server.ssrLoadModule('/api/feed.js')) as { default: Handler }
          await module.default(req, adapt(res))
        } catch (error) {
          server.config.logger.error(`[tilde-api] ${String(error)}`)
          next(error)
        }
      })()
    })
  }

  return {
    name: 'tilde-api',
    configureServer: mount,
    configurePreviewServer(server) {
      server.middlewares.use('/api/feed', (req, res, next) => {
        void (async () => {
          try {
            const module = (await import('./api/feed.js')) as { default: Handler }
            await module.default(req, adapt(res))
          } catch (error) {
            next(error)
          }
        })()
      })
    },
  }
}
