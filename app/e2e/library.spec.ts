import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, saved, write } from './helpers'

/** The title field the stored place names, if any. */
const storedField = (page: Page): Promise<string | undefined> =>
  page.evaluate(
    () =>
      new Promise<string | undefined>((done) => {
        const open = indexedDB.open('elbowpatch')
        open.onsuccess = () => {
          const all = open.result.transaction('pieces').objectStore('pieces').getAll()
          all.onsuccess = () => {
            open.result.close()
            done((all.result as { place?: { field?: string } }[])[0]?.place?.field)
          }
        }
      }),
  )

async function essay(page: Page, title: string, text: string) {
  await page.goto('./#/')
  if (await page.locator('.start.essay').count()) await page.locator('.start.essay').click()
  else {
    await write(page, 'Essay')
  }
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  await page.keyboard.type(text)
  await page.locator('.head .home').click()
  await expect(page.locator('.continue')).toContainText(text)
}

test('rename and export from the piece menu', async ({ page }) => {
  await essay(page, 'First draft', 'One.')
  await essay(page, 'Second draft', 'Two.')
  // The second is in Continue; the first is a row.
  const row = page.locator('.row', { hasText: 'First draft' })
  await row.click({ button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Rename' }).click()
  await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('A better name')
  await page.keyboard.press('Enter')
  await expect(page.locator('.row', { hasText: 'A better name' })).toBeVisible()

  await page.locator('.row', { hasText: 'A better name' }).focus()
  await page.keyboard.press('Shift+F10')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.getByRole('menuitem', { name: 'Export' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Markdown/ }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('A better name.md')
  await expect(page.getByRole('status').filter({ hasText: 'Saved as A better name.md.' })).toBeVisible()

  await page.reload()
  await page.goto('./#/')
  await expect(page.locator('.row', { hasText: 'A better name' })).toBeVisible()
})

test('the shelf: switched to, remembered, and the piece menu works on it', async ({ page }) => {
  await page.goto('./#/')
  // An empty library has no view switch, only settings.
  await expect(page.getByRole('button', { name: 'Show as a shelf' })).toHaveCount(0)
  await essay(page, 'First draft', 'One.')
  await essay(page, 'Second draft', 'Two.')

  await page.getByRole('button', { name: 'Show as a shelf' }).click()
  const object = page.locator('.shelf-object', { hasText: 'First draft' })
  await expect(object).toContainText('1 word')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Show as a list' })).toBeVisible()
  await expect(page.locator('.shelf-object')).toHaveCount(2)

  await object.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Shelved')
  await page.keyboard.press('Enter')
  const renamed = page.locator('.shelf-object', { hasText: 'Shelved' })
  await expect(renamed).toBeFocused()
  await page.keyboard.press('Shift+F10')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Show as a list' }).click()
  await expect(page.locator('.row', { hasText: 'Shelved' })).toBeVisible()
})

test('on the shelf a long word shrinks the title to fit, not broken in two', async ({ page }) => {
  await page.goto('./#/')
  await page.locator('.start.journal').click()
  await expect(page.locator('.book-title')).toBeFocused()
  await page.keyboard.type('Thoughts')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('A day.')
  await saved(page, 'A day.')
  await page.locator('.head .home').click()
  await essay(page, 'Wanderings', 'One.')
  await essay(page, 'Short', 'Two.')
  await essay(page, 'Unquestionably', 'Three.')
  await page.getByRole('button', { name: 'Show as a shelf' }).click()
  const size = (title: string) =>
    page.locator('.shelf-object .row-title', { hasText: title }).evaluate((el) => ({
      size: Number.parseFloat(getComputedStyle(el).fontSize),
      lines: Math.round(el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight)),
    }))
  // A title that fits keeps its size.
  expect(await size('Short')).toEqual({ size: 15, lines: 1 })
  // One that would break shrinks to stay on one line.
  for (const title of ['Wanderings', 'Thoughts']) {
    const fitted = await size(title)
    expect(fitted.size).toBeLessThan(15)
    expect(fitted.size).toBeGreaterThanOrEqual(12)
    expect(fitted.lines).toBe(1)
  }
  // Never below the line under it: past that, the word breaks.
  expect((await size('Unquestionably')).size).toBe(12)
})

test('on desktop Escape goes back one place: an area to Settings, Settings to the library', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 700, 'Escape is the desktop way back')
  await page.goto('/#/settings/about')
  await expect(page.getByRole('heading', { name: 'About & privacy' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('navigation', { name: 'Library' })).toBeVisible()
})

test.describe('the caret comes back to a piece left while writing', () => {
  test.skip(({ hasTouch }) => hasTouch, 'on a phone the caret waits for a tap')

  test('opened from the library, once another piece has been open', async ({ page }) => {
    await essay(page, 'First draft', 'One.')
    await essay(page, 'Second draft', 'Two.')
    await page.locator('.row', { hasText: 'First draft' }).click()
    await expect(page.locator('.body')).toBeFocused()
    await page.keyboard.type('X')
    await expect(page.locator('.body')).toContainText('One.X')
  })

  test('left with the Back button, and Continued', async ({ page }) => {
    await essay(page, 'First draft', 'One.')
    await page.locator('.continue').click()
    await expect(page.locator('.body')).toBeFocused()
    await page.goBack()
    await page.locator('.continue').click()
    await expect(page.locator('.body')).toBeFocused()
  })

  test('left with the Back button, and opened again after a reload', async ({ page }) => {
    await essay(page, 'First draft', 'One.')
    await page.locator('.continue').click()
    await expect(page.locator('.body')).toBeFocused()
    await page.keyboard.type(' Two.')
    await page.goBack()
    // Continue's words are the place's, stored after the text.
    await expect(page.locator('.continue')).toContainText('One. Two.')
    await page.reload()
    await page.locator('.continue').click()
    await expect(page.locator('.body')).toBeFocused()
    await page.keyboard.type('X')
    await expect(page.locator('.body')).toContainText('One. Two.X')
  })

  test('left in the title, and Continued', async ({ page }) => {
    await essay(page, 'First draft', 'One.')
    await page.locator('.continue').click()
    await page.locator('.title').click()
    await page.locator('.head .home').click()
    await page.locator('.continue').click()
    await expect(page.locator('.title')).toBeFocused()
    await page.keyboard.type('X')
    await expect(page.locator('.title')).toHaveText('First draftX')
  })

  test('left in the title, and opened again after a reload', async ({ page }) => {
    await essay(page, 'First draft', 'One.')
    await page.locator('.continue').click()
    await page.locator('.title').click()
    await page.keyboard.type('!')
    await page.locator('.head .home').click()
    await expect(page.locator('.continue')).toBeVisible()
    await expect.poll(() => storedField(page)).toBe('title')
    await page.reload()
    await page.locator('.continue').click()
    await expect(page.locator('.title')).toBeFocused()
    await page.keyboard.type('X')
    await expect(page.locator('.title')).toContainText('X')
    await expect(page.locator('.body')).toHaveText('One.')
  })

  test("left in a book's subtitle, on its title page, after a reload", async ({ page }) => {
    await page.goto('./#/')
    await write(page, 'Book')
    await expect(page.locator('.book-title')).toBeFocused()
    await page.keyboard.type('A book')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Its subtitle')
    await page.locator('.head .home').click()
    await expect(page.locator('.continue')).toBeVisible()
    await expect.poll(() => storedField(page)).toBe('subtitle')
    await page.reload()
    await page.locator('.continue').click()
    await expect(page.locator('.subtitle')).toBeFocused()
    await expect(page.locator('.subtitle')).toBeInViewport()
    await page.keyboard.type('X')
    await expect(page.locator('.subtitle')).toHaveText('Its subtitleX')
  })

  test('a title clicked out of is reading again: no caret', async ({ page }) => {
    await essay(page, 'First draft', 'One.')
    await page.locator('.continue').click()
    await page.locator('.title').click()
    await page.locator('.title').evaluate((el: HTMLElement) => el.blur())
    await page.locator('.head .home').click()
    await expect(page.locator('.continue')).toBeVisible()
    await expect.poll(() => storedField(page)).toBeUndefined()
    await page.reload()
    await page.locator('.continue').click()
    await expect(page.locator('.page-screen:not([inert])')).toBeVisible()
    await expect(page.locator('.title')).not.toBeFocused()
    await expect(page.locator('.body')).not.toBeFocused()
  })

  test('a journal opened on a new day: the caret in the empty page', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-07T10:00:00') })
    await page.goto('./#/')
    await write(page, 'Journal')
    await expect(page.locator('.book-title')).toBeFocused()
    await caretToEnd(page)
    await page.keyboard.type('Today I wrote.')
    await page.locator('.head .home').click()
    await expect(page.locator('.continue')).toContainText('Today I wrote.')
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00'))
    await page.reload()
    await page.locator('.continue').click()
    await expect(page.locator('.body')).toBeFocused()
    await page.keyboard.type('Tomorrow.')
    await expect(page.locator('.body')).toHaveText('Tomorrow.')
  })
})
