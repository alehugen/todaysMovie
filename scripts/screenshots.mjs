/**
 * Drives the real application in a headless browser and captures the screenshots
 * used in the README. Also doubles as an end-to-end smoke test: if the sign-in,
 * the questionnaire, the training run or the daily pick break, this script fails.
 *
 *   sudo npx playwright install-deps chromium   # once, Linux/WSL only
 *   npm run dev                                 # in one terminal
 *   node scripts/screenshots.mjs
 *
 * The first command installs the system libraries Chromium needs (libnss3,
 * libnspr4, libasound2). Without them the browser exits with
 * "error while loading shared libraries" before the script can start.
 */

import { mkdir } from 'node:fs/promises'

import { chromium } from 'playwright'

const BASE_URL = process.env.SCREENSHOT_URL ?? 'http://localhost:5173'
const OUT_DIR = 'docs/screenshots'

const LIKES = 10
const DISLIKES = 4

async function shot(page, name) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` })
  console.log(`  captured ${name}.png`)
}

async function setTheme(page, label) {
  await page.getByRole('group', { name: 'Color theme' }).getByRole('button', { name: label }).click()
  await page.waitForTimeout(300)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()

  console.log('sign in')
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await setTheme(page, 'Light')
  await shot(page, '01-sign-in')

  await page.locator('#name').fill('Alessandro')
  await page.getByRole('button', { name: 'Get started' }).click()

  console.log('profile step')
  await page.locator('#birth-year').fill('1993')
  for (const genre of ['Sci-Fi', 'Thriller', 'Drama']) {
    await page.getByRole('button', { name: genre, exact: true }).click()
  }
  await shot(page, '02-onboarding-profile')

  console.log('fetching movies from OMDb')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Liked' }).first().waitFor({ timeout: 90_000 })
  await page.waitForTimeout(1500)
  await shot(page, '03-onboarding-ratings')

  console.log('rating movies')
  for (let index = 0; index < LIKES; index += 1) {
    await page.getByRole('button', { name: 'Liked' }).nth(index).click()
  }
  for (let index = LIKES; index < LIKES + DISLIKES; index += 1) {
    await page.getByRole('button', { name: 'Disliked' }).nth(index).click()
  }
  await page.waitForTimeout(500)
  await shot(page, '04-onboarding-ready')

  console.log('training the model (this takes a few seconds)')
  await page.getByRole('button', { name: 'See my recommendations' }).click()
  await page.getByText("Today's movie").waitFor({ timeout: 180_000 })
  await page.waitForTimeout(1500)
  await shot(page, '05-daily-pick-light')

  console.log('dark theme')
  await setTheme(page, 'Dark')
  await shot(page, '06-daily-pick-dark')

  console.log('library')
  await page.getByRole('link', { name: 'Library' }).click()
  await page.getByRole('heading', { name: 'Your library' }).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  await shot(page, '07-library-dark')

  await browser.close()
  console.log('\ndone')
}

main().catch((error) => {
  console.error('\nFAILED:', error.message)
  process.exit(1)
})
