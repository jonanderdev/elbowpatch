/**
 * A word that stands alone in the head and takes you somewhere (DESIGN.md, Control):
 * a hairline pill, 30px tall, inside a 44px tap area. Library, Settings, later Now,
 * Contents and Days.
 */
export function WordButton({ word, onClick }: { word: string; onClick(): void }) {
  return (
    <button type="button" className="word-button" onClick={onClick}>
      <span className="word">{word}</span>
    </button>
  )
}
