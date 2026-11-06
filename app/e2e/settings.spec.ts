import { expect, type Page, test } from '@playwright/test'
import manifest from '../package.json' with { type: 'json' }
import { openTools, saved, write } from './helpers'

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
  await saved(page, text)
  await page.locator('.head .home').click()
  await expect(page.locator('.continue')).toContainText(text)
}

test('export everything, and bring it all back in another browser', async ({ page, browser }) => {
  await essay(page, 'Kept forever', 'First words.')
  await page.locator('.continue').click()
  await page.locator('.body p').last().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' More words.')
  await saved(page, 'More words.')
  await page.locator('.head .home').click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /Export & import/ }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^Elbowpatch \d{1,2} \w+ \d{4}\.zip$/)
  await expect(page.getByText(/^Everything is in Elbowpatch .*\.zip\.$/)).toBeVisible()
  const path = await file.path()

  // A browser that has never seen this app.
  const other = await browser.newContext()
  const fresh = await other.newPage()
  await fresh.goto('./#/settings/export')
  await fresh.locator('input[type=file]').setInputFiles(path)
  await expect(fresh.getByText('1 piece added.')).toBeVisible()
  // Importing it again adds nothing: never overwrites, never doubles.
  await fresh.locator('input[type=file]').setInputFiles(path)
  await expect(fresh.getByText('0 pieces added. 1 was already here.')).toBeVisible()
  await fresh.goto('./#/')
  await fresh.locator('.row', { hasText: 'Kept forever' }).click()
  await expect(fresh.locator('.title')).toHaveText('Kept forever')
  await expect(fresh.locator('.body')).toContainText('First words. More words.')
  await other.close()
})

test('put away, undo; put away, bring back from Settings', async ({ page }) => {
  await essay(page, 'Going away', 'Still here.')
  await essay(page, 'Staying', 'Other.')
  const row = page.locator('.row', { hasText: 'Going away' })
  await row.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Put away' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Put away for 30 days.' })).toBeVisible()
  await expect(row).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(row).toBeVisible()

  await row.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Put away' }).click()
  await expect(row).toHaveCount(0)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('button', { name: /Put away 1 piece · the next goes in 30 days/ })).toBeVisible()
  await page.getByRole('button', { name: /Put away/ }).click()
  await expect(page.getByText('Essay · put away')).toBeVisible()
  await page.getByRole('button', { name: 'Bring back' }).click()
  await expect(page.getByText('Brought back to the library.')).toBeVisible()
  await expect(page.getByText('Nothing is put away.')).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Library' }).click()
  await page.locator('.row', { hasText: 'Going away' }).click()
  await expect(page.locator('.body')).toContainText('Still here.')
})

test('a loose .md file comes in with its kind chosen first', async ({ page }) => {
  await page.goto('./#/settings/export')
  await page.locator('input[type=file]').setInputFiles(['e2e/fixtures/winter.md', 'e2e/fixtures/walk.md'])
  const sheet = page.getByRole('dialog', { name: 'Import' })
  await expect(sheet).toContainText('2 files')
  await expect(sheet.getByRole('radiogroup', { name: 'Kind of winter' }).getByRole('radio', { name: 'Book' })).toHaveAttribute('aria-checked', 'true')
  await expect(sheet.getByRole('radiogroup', { name: 'Kind of winter' }).getByRole('radio', { name: 'Journal' })).toHaveCount(0)
  await expect(sheet.getByRole('radiogroup', { name: 'Kind of On walking' }).getByRole('radio', { name: 'Essay' })).toHaveAttribute('aria-checked', 'true')
  await sheet.getByRole('button', { name: 'Import' }).click()
  await expect(page.getByText('2 pieces added.')).toBeVisible()
  await page.goto('./#/')
  await expect(page.locator('.row', { hasText: 'winter' })).toContainText('2 chapters')
  await page.locator('.row', { hasText: 'On walking' }).click()
  await expect(page.locator('.body em')).toHaveText('short')
})

test('a put-away piece cannot be reopened with the Back button', async ({ page }) => {
  await essay(page, 'Gone for now', 'Hidden.')
  await essay(page, 'Here', 'Other.')
  await page.locator('.row', { hasText: 'Gone for now' }).click()
  await expect(page.locator('.title')).toHaveText('Gone for now')
  await page.locator('.head .home').click()
  await page
    .locator('.continue')
    .click({ button: 'right' })
    .catch(() => {})
  await page.keyboard.press('Escape')
  // "Gone for now" is in Continue now; open "Here" and come back so it is a row.
  await page.locator('.row', { hasText: 'Here' }).click()
  await page.locator('.head .home').click()
  await page.locator('.row', { hasText: 'Gone for now' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Put away' }).click()
  await page.goBack()
  await page.goBack()
  await expect(page.locator('.library')).toBeVisible()
  await expect(page.locator('.title', { hasText: 'Gone for now' })).toHaveCount(0)
})

test('the only piece can be put away from Continue', async ({ page }) => {
  await essay(page, 'The only one', 'Alone.')
  // In Continue, and in its group too.
  await expect(page.locator('.row', { hasText: 'The only one' })).toHaveCount(1)
  await page.locator('.continue').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Put away' }).click()
  await expect(page.locator('.empty-library')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.continue')).toContainText('Alone.')
  await page.locator('.continue').focus()
  await page.keyboard.press('Shift+F10')
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Renamed alone')
  await page.keyboard.press('Enter')
  await expect(page.locator('.continue')).toContainText('Renamed alone')
})

test('the page button is a circle; text settings sit above the tools bar, or under their control on desktop', async ({ page }) => {
  await page.goto('./')
  await page.locator('.start.essay').click()
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type('Shapes')
  await openTools(page)
  await page.getByRole('button', { name: 'Text settings' }).click()
  const sheet = (await page.getByRole('dialog', { name: 'Text settings' }).boundingBox())!
  if (page.viewportSize()!.width < 700) {
    const bar = (await page.getByRole('toolbar', { name: 'Tools' }).boundingBox())!
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(bar.y)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    const button = (await page.locator('.page-button').boundingBox())!
    expect(Math.round(button.width)).toBe(Math.round(button.height))
    return
  }
  const control = page.getByRole('button', { name: 'Text settings' })
  const c = (await control.boundingBox())!
  expect(sheet.y).toBeGreaterThanOrEqual(c.y + c.height)
  expect(Math.round(sheet.x + sheet.width)).toBe(Math.round(c.x + c.width))
  await expect(control).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(control).toBeFocused()
  await expect(control).toHaveAttribute('aria-pressed', 'false')
})

test('no storage warning; a quiet export reminder after 30 days without a copy', async ({ page }) => {
  await essay(page, 'Reminded', 'Words.')
  await expect(page.getByText(/lives only in this browser/)).toHaveCount(0)
  await expect(page.locator('.export-reminder')).toHaveCount(0)
  await page.evaluate(() => localStorage.setItem('elbowpatch.lastExport', String(Date.now() - 40 * 86_400_000)))
  await page.reload()
  await page.goto('./#/')
  const reminder = page.locator('.export-reminder')
  await expect(reminder).toContainText('Last exported 5 weeks ago')
  const download = page.waitForEvent('download')
  await reminder.getByRole('button', { name: 'Export' }).click()
  expect((await download).suggestedFilename()).toMatch(/^Elbowpatch .*\.zip$/)
  await expect(page.getByText(/^Everything is in Elbowpatch .*\.zip\.$/)).toBeVisible()
  await expect(reminder).toHaveCount(0)
})

test('Help opens from Settings, and says only what this screen can use', async ({ page }) => {
  await page.goto('./#/settings')
  await page.getByRole('button', { name: /^Help/ }).click()
  await expect(page.getByRole('heading', { name: 'Help', level: 1 })).toBeFocused()
  await expect(page.getByText('In this browser, on this device.')).toBeVisible()
  // The keys are for a keyboard: desktop only.
  const phone = (page.viewportSize()?.width ?? 0) < 700
  await expect(page.getByText('Turn the page')).toBeVisible({ visible: !phone })
  await expect(page.getByText('On an iPhone or iPad')).toHaveCount(0)
  await page.getByRole('link', { name: 'Export & import' }).click()
  await expect(page.getByRole('heading', { name: 'Export & import', level: 1 })).toBeVisible()
})

test("the library's About opens About & privacy, one step inside Settings", async ({ page }) => {
  await page.goto('./#/')
  await page.getByRole('link', { name: 'About', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'About & privacy', level: 1 })).toBeFocused()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  await page.goBack()
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('link', { name: 'About', exact: true })).toBeVisible()
})

test('About & privacy opens at its top, however far down the list was', async ({ page }) => {
  // A window so short that the list itself scrolls: Settings stays open from one area to the next.
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 0, height: 240 })
  await page.goto('./#/settings')
  const view = page.locator('.settings')
  await view.evaluate((settings) => settings.scrollTo(0, settings.scrollHeight))
  const row = page.getByRole('button', { name: /^About & privacy/ })
  await row.scrollIntoViewIfNeeded()
  expect(await view.evaluate((settings) => settings.scrollTop)).toBeGreaterThan(0)
  await row.click()
  await expect(page.getByRole('heading', { name: 'About & privacy', level: 1 })).toBeFocused()
  expect(await view.evaluate((settings) => settings.scrollTop)).toBe(0)
})

test('About & privacy says what it promises, and only what is true here', async ({ page }) => {
  await page.goto('./#/settings/about')
  await expect(page.getByText('A quiet place to write journals, essays and books, for people who want to do the writing themselves.')).toBeVisible()
  for (const heading of ['Your writing', 'Privacy', 'No warranty', 'The project']) {
    await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible()
  }
  await expect(page.getByText('It stays on this device.', { exact: true })).toBeVisible()
  await expect(page.getByText('No cookies, no fingerprinting, no tracking in the editor.', { exact: true })).toBeVisible()
  await expect(page.getByText('Open source under the MIT License. The main copy runs on a best-effort basis, and anyone can host their own.')).toBeVisible()
  await expect(page.getByText('Set in Literata by TypeTogether and EB Garamond by Georg Duffner, both under the SIL Open Font License.')).toBeVisible()
  // Neither is true yet: nothing can be connected, and nothing counts visits.
  await expect(page.getByText('a place you connect')).toHaveCount(0)
  await expect(page.getByText('Visits to this site are counted')).toHaveCount(0)
  await expect(page.getByText('Elbowpatch is provided as-is, with no warranty. Export what matters:')).toBeVisible()
  await page.getByRole('link', { name: 'Export & import' }).click()
  await expect(page.getByRole('heading', { name: 'Export & import', level: 1 })).toBeVisible()
})

test('Settings shows the version in full, and About & privacy shows the same', async ({ page }) => {
  await page.goto('./#/settings')
  await expect(page.locator('.row-title')).toHaveText(['Export & import', 'Put away', 'About & privacy', 'Help'])
  const row = page.getByRole('button', { name: /^About & privacy/ })
  await expect(row.locator('.row-meta')).toHaveText(`Version ${manifest.version}`)
  await row.click()
  await expect(page.getByRole('heading', { name: 'About & privacy', level: 1 })).toBeFocused()
  await expect(page.getByText('Version', { exact: true }).locator('+ dd')).toHaveText(manifest.version)
})

test("Source in About & privacy opens the library's address in a new tab", async ({ page }) => {
  await page.goto('./#/')
  const address = await page.getByRole('link', { name: 'Source', exact: true }).getAttribute('href')
  expect(address).toBe('https://github.com/jonanderdev/elbowpatch')
  await page.goto('./#/settings/about')
  const source = page.getByRole('link', { name: 'GitHub' })
  await expect(source).toHaveAttribute('href', address ?? '')
  await expect(source).toHaveAttribute('target', '_blank')
  await expect(source).toHaveAttribute('rel', /\bnoopener\b/)
})

test('in Safari on an iPhone, Show me how lands on the Home Screen steps', async ({ browser }) => {
  const iphone = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
  })
  const phone = await iphone.newPage()
  await phone.goto('./#/')
  await expect(phone.getByText('Write from your Home Screen and your words stay.')).toBeVisible()
  await phone.getByRole('link', { name: 'Show me how' }).click()
  await expect(phone.getByRole('heading', { name: 'On your Home Screen', level: 1 })).toBeVisible()
  await expect(phone.getByRole('listitem')).toHaveCount(4)
  await phone.getByRole('button', { name: 'Help' }).click()
  await expect(phone.getByText('On an iPhone or iPad')).toBeVisible()
  await expect(phone.getByText('Turn the page')).toBeHidden()
  await iphone.close()
})
