import { expect, type Page } from '@playwright/test'

/** Puts the caret at the end of the text. (End scrolls instead on macOS WebKit.) */
export async function caretToEnd(page: Page): Promise<void> {
  await page.locator('.body').focus()
  await page.evaluate(() => {
    const body = document.querySelector('.body')!
    const range = document.createRange()
    range.selectNodeContents(body.lastElementChild!)
    range.collapse(false)
    const s = getSelection()!
    s.removeAllRanges()
    s.addRange(range)
  })
}

/** Waits until the words are in a stored working copy: the save landed, however busy the machine is. */
export async function saved(page: Page, words: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          (words) =>
            new Promise<boolean>((done) => {
              const open = indexedDB.open('elbowpatch')
              open.onerror = () => done(false)
              open.onsuccess = () => {
                const db = open.result
                try {
                  const all = db.transaction('working').objectStore('working').getAll()
                  all.onsuccess = () => {
                    db.close()
                    done((all.result as { content: string }[]).some((w) => w.content.includes(words)))
                  }
                  all.onerror = () => done(false)
                } catch {
                  db.close()
                  done(false)
                }
              }
            }),
          words,
        ),
      { timeout: 15000 },
    )
    .toBe(true)
}

/** Starts a new piece of this kind from Write: a bar on a phone, a menu from the rail on desktop. */
export async function write(page: Page, kind: 'Book' | 'Journal' | 'Essay'): Promise<void> {
  await page.getByRole('button', { name: 'Write' }).click()
  await page
    .getByRole('button', { name: kind, exact: true })
    .or(page.getByRole('menuitem', { name: kind, exact: true }))
    .click()
}

/** Opens the tools: the page button on a phone; on desktop they are already in the head. */
export async function openTools(page: Page): Promise<void> {
  if (await page.locator('.page-button').isVisible()) await page.locator('.page-button').click()
}
