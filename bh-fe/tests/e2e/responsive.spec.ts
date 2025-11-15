import { test, expect } from '@playwright/test'

import { setupAuthenticatedApp } from './utils/appMocks'
import { hasHorizontalOverflow } from './utils/assertions'

const appViews = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'labUpload', label: 'Lab Uploads' },
  { id: 'protocols', label: 'Protocols' },
  { id: 'gym', label: 'Gym' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'practitioner', label: 'Practitioner' },
  { id: 'community', label: 'Community' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'settings', label: 'Settings' },
]

test.describe('mobile viewport coverage', () => {
  test.skip(({ isMobile }) => !isMobile, 'Mobile-only responsive coverage')

  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedApp(page)
  })

  for (const view of appViews) {
    test(`${view.label} view stays within mobile viewport`, async ({ page }) => {
      await page.goto('/')

      if (view.id !== 'dashboard') {
        await page.getByRole('button', { name: view.label }).click()
      }

      const container = page.locator(`[data-testid="view-${view.id}"]`)
      await expect(container).toBeVisible()

      const overflow = await hasHorizontalOverflow(page)
      expect(overflow, `Expected ${view.id} to avoid horizontal scrolling`).toBeFalsy()

      await expect(container.getByRole('button').first()).toBeVisible()
    })
  }
})

