/** Requisitos minimos de senha, compartilhados pelo formulario e pela validacao. */
export const PASSWORD_RULES = [
  { label: 'Pelo menos 8 caracteres', test: (v: string) => v.length >= 8 },
  { label: 'Uma letra', test: (v: string) => /[a-zA-Z]/.test(v) },
  { label: 'Um número', test: (v: string) => /\d/.test(v) },
]

export const isStrongEnough = (value: string) => PASSWORD_RULES.every((rule) => rule.test(value))
