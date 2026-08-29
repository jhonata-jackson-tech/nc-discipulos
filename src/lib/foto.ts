/**
 * Preparo da foto de perfil, no navegador.
 *
 * Uma foto de celular tem 3 MB e 4000px de lado. Enviar isso para 33 pessoas
 * verem numa lista seria cobrar o 4G de todo mundo por um avatar de 40px.
 * Aqui ela vira um quadrado de 128px, cortado pelo centro, em JPEG — algo
 * entre 8 e 15 KB.
 *
 * O corte é central de propósito: recortar rosto exigiria uma tela de ajuste,
 * e ninguém quer arrastar uma imagem para caber num círculo de 40px. O centro
 * acerta a esmagadora maioria dos retratos.
 */
const LADO = 128
const QUALIDADE = 0.75

/** O mesmo teto que o banco exige, conferido antes de tentar salvar. */
export const TAMANHO_MAXIMO = 120_000

/**
 * `lado` sobe para o retrato do autor do devocional: ele aparece a 48px no
 * cabeçalho do texto, e 128px ficaria borrado numa tela retina. Continua sendo
 * uma imagem pequena — o teto do banco é o mesmo.
 */
export async function prepararFoto(arquivo: File, lado: number = LADO): Promise<string> {
  if (!arquivo.type.startsWith('image/')) {
    throw new Error('Escolha uma imagem.')
  }

  // `from-image` respeita a orientação gravada pela câmera: sem isso, foto
  // tirada de lado aparece deitada.
  const imagem = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })

  const recorte = Math.min(imagem.width, imagem.height)
  const x = (imagem.width - recorte) / 2
  const y = (imagem.height - recorte) / 2

  const tela = document.createElement('canvas')
  tela.width = lado
  tela.height = lado

  const contexto = tela.getContext('2d')
  if (!contexto) throw new Error('Não foi possível preparar a imagem.')

  contexto.drawImage(imagem, x, y, recorte, recorte, 0, 0, lado, lado)
  imagem.close()

  const dataUrl = tela.toDataURL('image/jpeg', QUALIDADE)

  if (dataUrl.length > TAMANHO_MAXIMO) {
    throw new Error('Imagem muito pesada. Tente outra foto.')
  }

  return dataUrl
}
