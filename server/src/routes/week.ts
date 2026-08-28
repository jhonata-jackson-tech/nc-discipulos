import { Router } from 'express'
import { withUser } from '../db.ts'
import { asyncRoute, HttpError, requireSession, type AuthedRequest } from '../http.ts'
import {
  DistributionError,
  generateDistribution,
  type DistributionInput,
} from '../../../src/domain/distribution.ts'

export const weekRouter = Router()

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * Geracao da semana. O algoritmo e o mesmo modulo dos testes unitarios
 * (`src/domain/distribution.ts`) - nao existem duas versoes da regra.
 *
 * Tudo roda com a identidade de quem pediu e dentro de uma unica transacao:
 * se o `apply` falhar, nada sobra pela metade. Quem confere que o solicitante
 * e lider e o proprio banco, em `app.require_leader()`.
 */
weekRouter.post(
  '/gerar-semana',
  requireSession,
  asyncRoute<AuthedRequest>(async (req, res) => {
    const groupId = typeof req.body?.groupId === 'string' ? req.body.groupId : ''
    const startsOn = typeof req.body?.startsOn === 'string' ? req.body.startsOn : ''

    if (!groupId || !startsOn) {
      throw new HttpError(400, 'Informe o GC e a semana a gerar.')
    }

    const payload = await withUser(req.claims!, async (client) => {
      const { rows } = await client.query<{ input: DistributionInput }>(
        'select public.get_distribution_input($1, $2) as input',
        [groupId, startsOn],
      )
      const input = rows[0]!.input

      const pending = (input as unknown as { pendingCareGender?: { fullName: string }[] })
        .pendingCareGender

      if (pending && pending.length > 0) {
        throw new HttpError(
          422,
          'Confirme o gênero de cuidado de todos os integrantes ativos antes de gerar a semana.',
          'PENDING_CARE_GENDER',
          { people: pending.map((person) => person.fullName) },
        )
      }

      if ((input as unknown as { hasPublishedWeek?: boolean }).hasPublishedWeek) {
        throw new HttpError(
          409,
          'Esta semana já foi publicada. Use a reorganização manual para ajustar os cuidados.',
          'WEEK_ALREADY_PUBLISHED',
        )
      }

      let result
      try {
        result = generateDistribution(input)
      } catch (error) {
        if (error instanceof DistributionError) {
          throw new HttpError(422, error.message, error.code, error.details)
        }
        throw error
      }

      const applied = await client.query<{ week_id: string }>(
        `select public.apply_week_generation($1, $2, $3, $4, $5::jsonb, $6::jsonb) as week_id`,
        [
          groupId,
          startsOn,
          addDays(startsOn, 6),
          (input as unknown as { seed: string }).seed,
          JSON.stringify(result.assignments),
          JSON.stringify({
            pools: result.pools,
            warnings: result.warnings,
            extraSlots: result.extraSlots,
            generatedFrom: { participants: input.participants.length },
          }),
        ],
      )

      return {
        weekId: applied.rows[0]!.week_id,
        assignments: result.assignments.length,
        pools: result.pools,
        warnings: result.warnings,
      }
    })

    res.json(payload)
  }),
)
