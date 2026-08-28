import * as React from 'react'
import { ContactDialog } from './contact-dialog'
import { TransferDialog } from './transfer-dialog'
import { CareHistoryDialog } from './care-history-dialog'
import type { AssignmentWithPeople } from './use-care'

type DialogKind = 'contact' | 'transfer' | 'history' | null

/**
 * Concentra os tres dialogos de cuidado para que qualquer tela reutilize o
 * mesmo fluxo - "Minha semana", "Cuidados" e a visao da lideranca.
 */
export function useCareActions() {
  const [assignment, setAssignment] = React.useState<AssignmentWithPeople | null>(null)
  const [kind, setKind] = React.useState<DialogKind>(null)

  const open = React.useCallback((next: AssignmentWithPeople, dialog: Exclude<DialogKind, null>) => {
    setAssignment(next)
    setKind(dialog)
  }, [])

  const close = React.useCallback(() => setKind(null), [])

  const dialogs = (
    <>
      <ContactDialog
        assignment={assignment}
        open={kind === 'contact'}
        onOpenChange={(value) => !value && close()}
      />
      <TransferDialog
        assignment={assignment}
        open={kind === 'transfer'}
        onOpenChange={(value) => !value && close()}
      />
      <CareHistoryDialog
        assignment={assignment}
        open={kind === 'history'}
        onOpenChange={(value) => !value && close()}
      />
    </>
  )

  return {
    dialogs,
    onContact: (next: AssignmentWithPeople) => open(next, 'contact'),
    onTransfer: (next: AssignmentWithPeople) => open(next, 'transfer'),
    onHistory: (next: AssignmentWithPeople) => open(next, 'history'),
  }
}
