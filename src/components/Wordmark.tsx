import { TildeMark } from './TildeMark'

/* The name is always set in Caveat, never in the body face — in the nav, in a
 * button, and in the middle of a sentence alike. Caveat runs small next to
 * Archivo, so the inline form sizes up to match the surrounding x-height. */
export function Tilde() {
  return <span className="wordmark-inline">Tilde</span>
}

/** Icon + name, for the places that carry the brand rather than mention it. */
export function Brand({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`brand-lockup ${className}`.trim()}>
      <span className="brand-icon">
        <TildeMark size={size} />
      </span>
      <span className="wordmark" style={{ fontSize: `${size * 1.5}px` }}>
        Tilde
      </span>
    </span>
  )
}
