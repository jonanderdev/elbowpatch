import { expect, type Page, test } from '@playwright/test'
import { saved, write } from './helpers'

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
