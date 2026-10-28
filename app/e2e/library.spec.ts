import { expect, test, type Page } from '@playwright/test'

async function essay(page: Page, title: string, text: string) {
  await page.goto('./#/')
  if (await page.locator('.start.essay').count()) await page.locator('.start.essay').click()
  else {
    await page.getByRole('button', { name: 'New piece' }).click()
    await page.getByRole('toolbar', { name: 'New piece' }).getByRole('button', { name: 'Essay' }).click()
  }
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  await page.keyboard.type(text)
  await page.locator('.head .word-button').click()
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
