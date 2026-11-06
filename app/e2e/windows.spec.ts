import { expect, type Page, test } from '@playwright/test'
import { caretToEnd, openTools, saved } from './helpers'

test('a second window opens the piece read-only, and Write here hands it over', async ({ page, context }) => {
  await page.goto('./')
  await page.locator('.start.essay').click()
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type('Two windows')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Written in the first.')
  await saved(page, 'Written in the first.')

  const second = await context.newPage()
  await second.goto(page.url())
  await expect(second.getByRole('status').filter({ hasText: 'Open in another window' })).toBeVisible()
  await expect(second.locator('.body')).toHaveAttribute('contenteditable', 'false')

  // Words typed a moment before the other window takes over are not lost.
  await page.keyboard.type(' Last words here.')
  await second.getByRole('button', { name: 'Write here' }).click()
  // The first window saved before letting go; the second starts from it.
  await expect(second.locator('.body')).toContainText('Written in the first. Last words here.')
  await expect(second.locator('.body')).toHaveAttribute('contenteditable', 'true')
  await expect(page.getByRole('status').filter({ hasText: 'Open in another window' })).toBeVisible()
  await expect(page.locator('.body')).toHaveAttribute('contenteditable', 'false')

  await caretToEnd(second)
  await second.keyboard.type(' And in the second.')
  await saved(second, 'And in the second.')
  await second.reload()
  await expect(second.locator('.body')).toContainText('Last words here. And in the second.')
})

const machine = (page: Page) => page.locator('.time-machine')
const bringBack = (page: Page) => machine(page).getByRole('button', { name: 'Bring essay back' })

async function lookBack(page: Page): Promise<void> {
  await openTools(page)
  await page.getByRole('button', { name: 'Time Machine' }).click()
  await expect(machine(page)).toBeVisible()
  await expect(machine(page).locator('.moment-name, .moment-note').first()).not.toHaveText('Finding your moments…')
}

/** An essay in the first window with a moment behind it: "Earlier words." then "Later words.". */
async function essayWithAMoment(page: Page): Promise<void> {
  await page.goto('./')
  await page.locator('.start.essay').click()
  await expect(page.locator('.title')).toBeFocused()
  await page.keyboard.type('Two windows')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Earlier words.')
  await saved(page, 'Earlier words.')
  await lookBack(page)
  await machine(page).getByRole('button', { name: 'Back to now' }).click()
  await caretToEnd(page)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Later words.')
  await saved(page, 'Later words.')
}

test('another window can look back, but bring back is off and Copy stands alone', async ({ page, context }) => {
  await essayWithAMoment(page)
  const second = await context.newPage()
  await second.goto(page.url())
  await expect(second.getByRole('status').filter({ hasText: 'Open in another window' })).toBeVisible()
  await lookBack(second)
  await expect(machine(second).locator('.body')).toContainText('Earlier words.')

  // Standing in secondary, and doing nothing.
  await expect(bringBack(second)).toHaveAttribute('aria-disabled', 'true')
  await bringBack(second).click({ force: true })
  await expect(machine(second)).toBeVisible()
  await expect(machine(second).getByRole('alert')).toHaveCount(0)

  // Selected words offer Copy alone.
  await machine(second)
    .locator('.body')
    .evaluate((body) => {
      const range = document.createRange()
      range.selectNodeContents(body.querySelector('p')!)
      getSelection()!.removeAllRanges()
      getSelection()!.addRange(range)
    })
  await expect(second.getByRole('toolbar', { name: 'Selected words' }).getByRole('button')).toHaveText(['Copy'])

  // Nothing was written: the piece is as the first window left it.
  await second.getByRole('button', { name: 'Back to now' }).click()
  await expect(second.getByRole('status').filter({ hasText: 'Open in another window' })).toBeVisible()
  await expect(second.getByRole('button', { name: 'Write here' })).toBeVisible()
  await expect(second.locator('.body')).toContainText('Later words.')
  await second.reload()
  await expect(second.locator('.body')).toContainText('Later words.')

  // Keep a copy leaves the piece alone, and still works.
  await lookBack(second)
  await machine(second).getByRole('button', { name: 'Keep a copy' }).click()
  await expect(machine(second)).toHaveCount(0)
  await expect(second.locator('.line.calm')).toContainText('kept as a new essay')
})

test('losing the piece to another window while looking back turns bring back off', async ({ page, context }) => {
  await essayWithAMoment(page)
  await lookBack(page)
  await expect(bringBack(page)).not.toHaveAttribute('aria-disabled', 'true')

  const second = await context.newPage()
  await second.goto(page.url())
  await second.getByRole('button', { name: 'Write here' }).click()
  await expect(second.locator('.body')).toHaveAttribute('contenteditable', 'true')

  await expect(bringBack(page)).toHaveAttribute('aria-disabled', 'true')
  await bringBack(page).click({ force: true })
  await expect(machine(page)).toBeVisible()
  await page.getByRole('button', { name: 'Back to now' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Open in another window' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Write here' })).toBeVisible()
  await expect(page.locator('.body')).toContainText('Later words.')
})
