import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const CONNECTORS = ['de', 'da', 'do', 'dos', 'das', 'e']

/** Iniciais para o avatar, ignorando conectivos e apelidos entre parenteses. */
export function initials(fullName: string): string {
  const clean = fullName.replace(/\(.*?\)/g, '').trim()
  const parts = clean.split(/\s+/).filter((p) => p && !CONNECTORS.includes(p.toLowerCase()))
  if (parts.length === 0) return (clean[0] ?? '?').toUpperCase()
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

export function firstName(fullName: string): string {
  return fullName.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] ?? fullName
}

/** Ordena nomes respeitando acentuacao do portugues. */
export function byName<T extends { full_name: string }>(a: T, b: T) {
  return a.full_name.localeCompare(b.full_name, 'pt-BR')
}

export function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}
