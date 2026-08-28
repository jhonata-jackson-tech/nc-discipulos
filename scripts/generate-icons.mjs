/**
 * Gera os icones PNG da PWA sem dependencias externas.
 * Sao icones-base, propositalmente simples: substitua os arquivos em
 * `public/icons/` pela identidade definitiva do GC quando ela existir.
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const BRAND = [15, 118, 110] // #0f766e - azul-petroleo primario
const BRAND_DEEP = [12, 94, 88]
const INK = [255, 255, 255]

/** Coracao por equacao implicita: (x^2+y^2-1)^3 - x^2*y^3 <= 0 */
function insideHeart(x, y) {
  const a = x * x + y * y - 1
  return a * a * a - x * x * y * y * y <= 0
}

function crc32(buf) {
  let c
  const table = crc32.table ?? (crc32.table = Array.from({ length: 256 }, (_, n) => {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  }))
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, pixels) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filtro None
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Anti-aliasing por supersampling 3x3. */
function render(size, { maskable }) {
  const px = Buffer.alloc(size * size * 4)
  const r = maskable ? 0 : size * 0.22 // raio do quadrado arredondado
  const heartScale = maskable ? 0.24 : 0.29 // safe zone menor em maskable
  const S = 3
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0
      let fg = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px0 = x + (sx + 0.5) / S
          const py0 = y + (sy + 0.5) / S
          // quadrado arredondado
          const cx = Math.min(Math.max(px0, r), size - r)
          const cy = Math.min(Math.max(py0, r), size - r)
          const d = Math.hypot(px0 - cx, py0 - cy)
          if (d <= r || r === 0) bg++
          // coracao centralizado, levemente acima do centro optico
          const hx = (px0 - size / 2) / (size * heartScale)
          const hy = -(py0 - size * 0.49) / (size * heartScale)
          if (insideHeart(hx, hy)) fg++
        }
      }
      const total = S * S
      const bgA = bg / total
      const fgA = fg / total
      const i = (y * size + x) * 4
      // degrade vertical discreto no fundo
      const t = y / size
      const base = [
        Math.round(BRAND[0] + (BRAND_DEEP[0] - BRAND[0]) * t),
        Math.round(BRAND[1] + (BRAND_DEEP[1] - BRAND[1]) * t),
        Math.round(BRAND[2] + (BRAND_DEEP[2] - BRAND[2]) * t),
      ]
      px[i] = Math.round(base[0] * (1 - fgA) + INK[0] * fgA)
      px[i + 1] = Math.round(base[1] * (1 - fgA) + INK[1] * fgA)
      px[i + 2] = Math.round(base[2] * (1 - fgA) + INK[2] * fgA)
      px[i + 3] = Math.round(255 * bgA)
    }
  }
  return px
}

mkdirSync(OUT, { recursive: true })
const targets = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
]
for (const [name, size, opts] of targets) {
  writeFileSync(resolve(OUT, name), encodePng(size, render(size, opts)))
  console.log(`gerado public/icons/${name} (${size}x${size})`)
}
