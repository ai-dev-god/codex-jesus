import { test, expect } from '@playwright/test'

test.describe('BioHax landing experience', () => {
  test('displays hero messaging and CTA actions', async ({ page }) => {
    await page.goto('/')

    const heroSection = page.locator('#hero')

    await expect(
      heroSection.getByRole('heading', { name: /Reimagine Your Healthspan/i })
    ).toBeVisible()

    await expect(heroSection.getByRole('button', { name: /Start Free Trial/i })).toBeVisible()
    await expect(heroSection.getByRole('button', { name: /Watch Demo/i })).toBeVisible()
  })
})
