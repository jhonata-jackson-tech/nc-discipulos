/**
 * Gera os icones da PWA a partir da marca do GC, sem dependencia externa.
 *
 * A marca vem de `marca.mask.mjs` - a mesma imagem enviada pela lideranca,
 * guardada como mascara de alfa. Isso permite gerar tudo em qualquer maquina,
 * sem ferramenta de imagem instalada, e manter uma unica fonte para o icone do
 * aparelho, o favicon e a marca dentro do aplicativo.
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { alfa, LADO } from './marca.mask.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/** Preto suave da identidade - o mesmo `--brand-panel` do tema claro. */
const FUNDO = [35, 35, 35]
const MARCA = [255, 255, 255]

// ------------------------------------------------------------------- PNG
function crc32(buf) {
  let c
  const table =
    crc32.table ??
    (crc32.table = Array.from({ length: 256 }, (_, n) => {
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
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ----------------------------------------------------------------- marca
/**
 * Alfa da marca no ponto (x, y) de um destino de `size` pixels, com a marca
 * ocupando `proporcao` do lado. A media de area evita o serrilhado que
 * apareceria ao pegar so o pixel mais proximo.
 */
function alfaDaMarca(x, y, size, proporcao) {
  const desenho = size * proporcao
  const inicio = (size - desenho) / 2
  const u = (x - inicio) / desenho
  const v = (y - inicio) / desenho
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0

  const passo = LADO / desenho
  const px = u * LADO
  const py = v * LADO
  const amostras = Math.max(1, Math.min(4, Math.round(passo)))

  let soma = 0
  for (let j = 0; j < amostras; j++) {
    for (let i = 0; i < amostras; i++) {
      const sx = Math.min(LADO - 1, Math.round(px + ((i + 0.5) * passo) / amostras))
      const sy = Math.min(LADO - 1, Math.round(py + ((j + 0.5) * passo) / amostras))
      soma += alfa[sy * LADO + sx]
    }
  }
  return soma / (amostras * amostras) / 255
}

/** @param {{proporcao: number, fundo: boolean}} opcoes */
function render(size, { proporcao, fundo }) {
  const px = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = alfaDaMarca(x + 0.5, y + 0.5, size, proporcao)
      const i = (y * size + x) * 4

      if (fundo) {
        px[i] = Math.round(FUNDO[0] * (1 - a) + MARCA[0] * a)
        px[i + 1] = Math.round(FUNDO[1] * (1 - a) + MARCA[1] * a)
        px[i + 2] = Math.round(FUNDO[2] * (1 - a) + MARCA[2] * a)
        px[i + 3] = 255
      } else {
        // Sem fundo: a marca em branco, o alfa fazendo o recorte. Serve de
        // mascara CSS, e assim ela assume a cor do texto em qualquer tema.
        px[i] = MARCA[0]
        px[i + 1] = MARCA[1]
        px[i + 2] = MARCA[2]
        px[i + 3] = Math.round(255 * a)
      }
    }
  }
  return px
}

mkdirSync(resolve(RAIZ, 'icons'), { recursive: true })

const alvos = [
  // Icone do aparelho: a marca respira dentro do quadrado escuro.
  ['icons/icon-192.png', 192, { proporcao: 0.7, fundo: true }],
  ['icons/icon-512.png', 512, { proporcao: 0.7, fundo: true }],
  // Maskable: o Android recorta em circulo, entao a marca encolhe para caber
  // na zona segura (80% do lado).
  ['icons/icon-maskable-512.png', 512, { proporcao: 0.54, fundo: true }],
  ['apple-touch-icon.png', 180, { proporcao: 0.72, fundo: true }],
  ['favicon.png', 64, { proporcao: 0.86, fundo: true }],
  // Usada dentro do aplicativo como mascara: pega a cor de quem a contem.
  ['marca.png', 256, { proporcao: 1, fundo: false }],
]

for (const [nome, size, opcoes] of alvos) {
  writeFileSync(resolve(RAIZ, nome), encodePng(size, render(size, opcoes)))
  console.log(`gerado public/${nome} (${size}x${size})`)
}
