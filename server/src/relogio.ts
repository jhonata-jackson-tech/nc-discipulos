import { pool } from './db.ts'

/**
 * O relógio dos avisos com hora marcada.
 *
 * Este arquivo não sabe que horas são no GC, nem quais avisos existem: ele
 * pergunta ao banco, de minuto em minuto, se há algo na hora. A regra de fuso
 * (America/São Paulo, não o fuso do container) e a garantia de não repetir
 * vivem lá, onde o estado é durável — reiniciar o serviço não faz ninguém
 * receber o mesmo aviso duas vezes.
 *
 * De minuto em minuto porque a precisão que importa é "logo depois das 7h",
 * não "às 7h em ponto": a pessoa acorda e o aviso está lá.
 */
const INTERVALO = 60_000

export function ligarRelogio(): void {
  const bater = async () => {
    try {
      const { rows } = await pool.query<{ tarefa: string; avisos: number }>(
        'select * from app.rodar_avisos_agendados()',
      )
      for (const linha of rows) {
        console.log(`[relogio] ${linha.tarefa}: ${linha.avisos} aviso(s)`)
      }
    } catch (erro) {
      // Uma batida perdida não é grave: a próxima vem em um minuto, e a
      // tarefa continua marcada como não executada.
      console.error('[relogio] falhou:', (erro as Error).message)
    }
  }

  // A primeira batida espera o banco assentar depois da subida.
  setTimeout(() => {
    void bater()
    setInterval(() => void bater(), INTERVALO)
  }, 10_000)

  console.log('[relogio] avisos com hora marcada, conferindo a cada minuto')
}
