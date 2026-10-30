import type { ReactElement, ReactNode } from 'react'
import type { Kind } from '../../domain/model'

/**
 * A piece's shape on the shelf (Figma, Shelf object): the outline's line and fill come from
 * the stylesheet, so one drawing serves paper and night.
 */
const SHAPES: Record<Kind, ReactNode> = {
  // A book: squarer corners on the spine side, and the spine line near it.
  book: (
    <>
      <path d="M2.28571 0.5H94.25C97.8214 0.5 99.6071 2.29487 99.6071 5.88462V134.218C99.6071 137.808 97.8214 139.603 94.25 139.603H2.28571C1.09524 139.603 0.5 139.004 0.5 137.808V2.29487C0.5 1.09829 1.09524 0.5 2.28571 0.5Z" />
      <path d="M9.42857 0.5V139.603" />
    </>
  ),
  // A journal: rounded all round, with a band down the right.
  journal: (
    <>
      <path d="M90.6786 0.5H9.42857C4.49746 0.5 0.5 4.51796 0.5 9.47436V130.628C0.5 135.585 4.49746 139.603 9.42857 139.603H90.6786C95.6097 139.603 99.6071 135.585 99.6071 130.628V9.47436C99.6071 4.51796 95.6097 0.5 90.6786 0.5Z" />
      <path d="M86.2143 0.5V139.603" />
    </>
  ),
  // An essay: a sheet with its top-right corner folded.
  essay: (
    <>
      <path d="M2.28571 0.5H85.3214L99.6071 14.859V137.808C99.6071 139.004 99.0119 139.603 97.8214 139.603H2.28571C1.09524 139.603 0.5 139.004 0.5 137.808V2.29487C0.5 1.09829 1.09524 0.5 2.28571 0.5Z" />
      <path d="M85.3214 0.5V13.0641C85.3214 14.2607 85.9167 14.859 87.1071 14.859H99.6071" />
    </>
  ),
}

export function ShelfOutline({ kind }: { kind: Kind }): ReactElement {
  return (
    <svg className="shelf-outline" viewBox="0 0 100.107 140.103" width="100" height="140" preserveAspectRatio="none" aria-hidden="true">
      {SHAPES[kind]}
    </svg>
  )
}
