/** The tilde itself: two strokes, one rising, one falling. */
export function TildeMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      <path
        d="M3 21 C 6.5 11.5, 12.5 11.5, 16 16 C 19.5 20.5, 25.5 20.5, 29 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.6"
      />
    </svg>
  )
}
