import { expect, test, type Page } from '@playwright/test'
import { caretToEnd, saved } from './helpers'

async function newEssay(page: Page, title: string) {
  await page.goto('./')
  await page.locator('.start.essay').click()
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
}

const breakSaves = (page: Page) =>
  page.evaluate(() => {
    ;(window as unknown as { __tx: unknown }).__tx = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = () => {
      throw new DOMException('The disk is full.', 'QuotaExceededError')
    }
  })
const mendSaves = (page: Page) =>
  page.evaluate(() => {
    IDBDatabase.prototype.transaction = (window as unknown as { __tx: typeof IDBDatabase.prototype.transaction }).__tx
  })

test('words that could not be saved survive leaving the page, and come back with it', async ({ page }) => {
  await newEssay(page, 'Kept title')
  await page.keyboard.type('Saved.')
  await saved(page, 'Saved.')
  await breakSaves(page)
  await page.keyboard.type(' Not yet saved.')
  await expect(page.getByRole('alert')).toBeVisible()
  await page.locator('.head .word-button').click()
  // The page is gone; the app still says so.
  await expect(page.getByRole('alert')).toContainText("Can't save right now")
  await mendSaves(page)
  await page.locator('.continue, .row').first().click()
  await expect(page.locator('.body')).toContainText('Saved. Not yet saved.')
  await expect(page.locator('.title')).toHaveText('Kept title')
  await saved(page, 'Not yet saved.')
  await page.reload()
  await expect(page.locator('.body')).toContainText('Saved. Not yet saved.')
  await expect(page.locator('.title')).toHaveText('Kept title')
})

test('pasted Markdown outside the v1 marks becomes plain paragraphs and stays so', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', 'Firefox ignores a synthetic paste event; a real paste goes through the browser')
  await newEssay(page, 'Paste')
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('text/plain', '# Notes\n\n5 * 3 = 15\n\nAnd **bold**')
    document.querySelector('.body')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(page.locator('.body strong')).toHaveText('bold')
  await saved(page, '**bold**')
  await page.reload()
  await expect(page.locator('.body p').first()).toHaveText('# Notes')
  await expect(page.locator('.body p.raw')).toHaveCount(0)
  await expect(page.locator('.body')).toContainText('5 * 3 = 15')
  await expect(page.locator('.body strong')).toHaveText('bold')
})

test('a line break reads back as written', async ({ page }) => {
  await newEssay(page, 'Breaks')
  await page.keyboard.type('One line')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.press('Shift+Enter') // refused: two in a row
  await page.keyboard.type('and the next')
  await expect(page.locator('.body br:not(.ProseMirror-trailingBreak)')).toHaveCount(1)
  await saved(page, 'and the next')
  await page.reload()
  await expect(page.locator('.body p')).toHaveCount(1)
  await expect(page.locator('.body br:not(.ProseMirror-trailingBreak)')).toHaveCount(1)
  await expect(page.locator('.body p')).toHaveText('One lineand the next')
})

test('opening the app keeps the place where you left off', async ({ page }) => {
  await newEssay(page, 'Place')
  for (let i = 0; i < 10; i++) {
    await page.keyboard.insertText(`${i}. Nobody remembers the first draft. It is written in a hurry, at the kitchen table or on the train, and it is mostly a list of things the writer hopes to say. It has the right shape.`)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.type('The end.')
  const last = await page.locator('.page-button').textContent()
  expect(Number(last)).toBeGreaterThan(1)
  await page.locator('.head .word-button').click()
  await expect(page.locator('.patch')).toHaveText(`page ${last}`)
  await page.reload()
  await page.goto('./#/')
  await expect(page.locator('.patch')).toHaveText(`page ${last}`)
  await page.locator('.continue').click()
  await expect(page.locator('.page-button')).toHaveText(last!)
  await caretToEnd(page)
})

test('words typed just before closing are there on the next launch', async ({ page }) => {
  await newEssay(page, 'Closed quickly')
  // Make every save slow, so the page closes before the database finishes.
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<typeof original>) {
      const tx = original.apply(this, args)
      const block = () => {
        const until = performance.now() + 50
        while (performance.now() < until);
      }
      tx.addEventListener('complete', block)
      return tx
    } as typeof original
  })
  await page.keyboard.type('The last words.')
  await page.reload()
  await expect(page.locator('.body')).toContainText('The last words.')
  await expect(page.locator('.title')).toHaveText('Closed quickly')
})

test('words already stored never leave a "Can\'t save" line behind', async ({ page }) => {
  await newEssay(page, 'Stored')
  await page.keyboard.type('All stored.')
  await saved(page, 'All stored.')
  // A journal entry for words that did reach the database (the save committed as the page unloaded).
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('elbowpatch.unsaved.'))
    if (key) localStorage.removeItem(key)
  })
  const sectionId = await page.evaluate(
    () =>
      new Promise<string>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const all = open.result.transaction('working').objectStore('working').getAll()
          all.onsuccess = () => done((all.result as { sectionId: string }[])[0]!.sectionId)
        }
      }),
  )
  await page.evaluate((sectionId) => {
    localStorage.setItem(
      `elbowpatch.unsaved.${sectionId}`,
      JSON.stringify({ piece: { id: 'p', kind: 'essay', sections: [] }, pieceId: 'p', sectionId, name: 'Stored.md', markdown: 'All stored.', title: null, at: Date.now() }),
    )
  }, sectionId)
  await page.reload()
  await page.goto('./#/')
  await expect(page.locator('.library')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('elbowpatch.unsaved.')).length)).toBe(0)
})
