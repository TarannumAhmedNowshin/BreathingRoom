import react from '@vitejs/plugin-react'
import { cpSync, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

// The break room (../breathing-room) is a plain HTML/JS app. It is served at /room/ in dev
// and copied to dist/room/ on build, so the dashboard and the break room are one site and
// share the same localStorage (calendar, energy, progress).
const ROOM = fileURLToPath(new URL('../breathing-room', import.meta.url))
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.ics': 'text/calendar', '.json': 'application/json',
}

function breathingRoom(): Plugin {
  return {
    name: 'breathing-room',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]
        if (url === '/room') { res.statusCode = 302; res.setHeader('Location', '/room/'); res.end(); return }
        if (!url.startsWith('/room/')) return next()
        const rel = url.slice('/room/'.length) || 'index.html'
        const file = join(ROOM, rel)
        if (!file.startsWith(ROOM) || !existsSync(file) || statSync(file).isDirectory()) return next()
        res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream')
        res.end(readFileSync(file))
      })
    },
    closeBundle() {
      cpSync(ROOM, fileURLToPath(new URL('./dist/room', import.meta.url)), {
        recursive: true,
        filter: (src) => !/[\\/](tests|node_modules)([\\/]|$)/.test(src) && !src.endsWith('package.json'),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './', // works on GitHub Pages under /<repo>/ and from any folder
  plugins: [react(), breathingRoom()],
})
