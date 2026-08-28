/**
 * Edge Function `generate-week`.
 *
 * Gera a distribuicao semanal no servidor, com o token do lider que pediu a
 * geracao. Roda sempre em rascunho: publicar e um segundo ato, deliberado.
 *
 * O algoritmo e o mesmo modulo usado pelos testes unitarios do frontend
 * (`src/domain/distribution.ts`), para nao existirem duas versoes da regra.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'
import {
  DistributionError,
  generateDistribution,
  type DistributionInput,
} from '../../../src/domain/distribution.ts'

interface RequestBody {
  groupId: string
  /** Segunda-feira da semana, em YYYY-MM-DD. */
  startsOn: string
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Metodo nao suportado.' }, 405)
  }

  const authorization = req.headers.get('Authorization')
  if (!authorization) {
    return json({ error: 'Sessao nao encontrada. Entre novamente.' }, 401)
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Requisicao invalida.' }, 400)
  }

  if (!body.groupId || !body.startsOn) {
    return json({ error: 'Informe o GC e a semana a gerar.' }, 400)
  }

  // O client carrega o token do usuario: as funcoes chamadas abaixo validam
  // que quem esta pedindo e realmente um lider.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  )

  const { data: input, error: inputError } = await supabase.rpc('get_distribution_input', {
    p_group_id: body.groupId,
    p_starts_on: body.startsOn,
  })

  if (inputError) {
    return json({ error: inputError.message }, 403)
  }

  const pending = (input.pendingCareGender ?? []) as { id: string; fullName: string }[]
  if (pending.length > 0) {
    return json(
      {
        error: 'Confirme o genero de cuidado de todos os integrantes ativos antes de gerar a semana.',
        code: 'PENDING_CARE_GENDER',
        people: pending.map((p) => p.fullName),
      },
      422,
    )
  }

  if (input.hasPublishedWeek) {
    return json(
      {
        error: 'Esta semana ja foi publicada. Use a reorganizacao manual para ajustar os cuidados.',
        code: 'WEEK_ALREADY_PUBLISHED',
      },
      409,
    )
  }

  let result
  try {
    result = generateDistribution(input as DistributionInput)
  } catch (error) {
    if (error instanceof DistributionError) {
      return json({ error: error.message, code: error.code, details: error.details }, 422)
    }
    throw error
  }

  const { data: weekId, error: applyError } = await supabase.rpc('apply_week_generation', {
    p_group_id: body.groupId,
    p_starts_on: body.startsOn,
    p_ends_on: addDays(body.startsOn, 6),
    p_seed: input.seed,
    p_assignments: result.assignments,
    p_report: {
      pools: result.pools,
      warnings: result.warnings,
      extraSlots: result.extraSlots,
      generatedFrom: { participants: input.participants.length },
    },
  })

  if (applyError) {
    return json({ error: applyError.message }, 409)
  }

  return json({
    weekId,
    assignments: result.assignments.length,
    pools: result.pools,
    warnings: result.warnings,
  })
})
