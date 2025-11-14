import { test, expect } from '@playwright/test'

test.describe('BioHax demo counter', () => {
  test('loads landing page and persists counter state', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Vite + React' })).toBeVisible()

    const counterText = page.getByText(/count is/i)
    await expect(counterText).toHaveText(/count is 0/i)

    await page.getByRole('button', { name: '+1' }).click()
    await expect(counterText).toHaveText(/count is 1/i)

    await page.reload()
    await expect(counterText).toHaveText(/count is 1/i)

    await page.getByRole('button', { name: 'Reset persisted state' }).click()
    await expect(counterText).toHaveText(/count is 0/i)
  })
})
