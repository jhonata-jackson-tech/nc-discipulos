export type Acao = 'ler' | 'gravar' | 'conferir' | 'apagar'

export interface Autorizacao {
  acao: Acao
  talk: string
  /** `pdf`, `arte`, `capa` — ou `*` para apagar a pasta inteira do talk. */
  tipo: string
  exp: number
  /** Só em `gravar`: o tipo que o arquivo precisa ter. */
  mime?: string
  /** Só em `gravar`: o maior tamanho aceito, em bytes. */
  maximo?: number
  /** Só em `gravar`: o nome original, para o download. */
  nome?: string
  /** Só em `ler`: a versão do arquivo, para o endereço mudar quando ele muda. */
  versao?: string
}

export function assinar(segredo: string, autorizacao: Autorizacao): string
export function conferir(segredo: string, token: string, agora?: number): Autorizacao | null
export function vencimentoDeLeitura(agora?: number): number
export function faixa(
  cabecalho: string | undefined,
  tamanho: number,
): { inicio: number; fim: number } | null | false
export function assinaturaDoArquivoConfere(mime: string, bytes: Buffer): boolean
