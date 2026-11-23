import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

interface MockMovie {
  Title: string
  Year: string
  imdbID: string
  Type: string
  Poster: string
}

const movies: MockMovie[] = [
  { Title: 'The Matrix Reloaded', Year: '2003', imdbID: 'tt0234215', Type: 'movie', Poster: 'N/A' },
  { Title: 'The Matrix', Year: '1999', imdbID: 'tt0133093', Type: 'movie', Poster: 'N/A' },
  { Title: 'The Matrix Revolutions', Year: '2003', imdbID: 'tt0242653', Type: 'movie', Poster: 'N/A' }
]

type MockResponder = (params: URLSearchParams, route: Route) => Promise<void>

async function mockApi (page: Page, responder?: MockResponder): Promise<string[]> {
  const requests: string[] = []
  await page.route(/^https:\/\/www\.omdbapi\.com\/\?/, async route => {
    const params = new URL(route.request().url()).searchParams
    requests.push(params.get('s') ?? '')
    if (responder) {
      await responder(params, route)
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Search: movies, totalResults: '3', Response: 'True' })
    })
  })
  return requests
}

async function search (page: Page, title = 'Matrix'): Promise<void> {
  await page.getByRole('searchbox', { name: 'Título de la película' }).fill(title)
  await page.getByRole('button', { name: /Buscar/ }).click()
}

test('does not display an error or issue requests on initial load', async ({ page }) => {
  const requests = await mockApi(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tu próxima película')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('Historias que esperan ser descubiertas')).toBeVisible()
  expect(requests).toHaveLength(0)
})

test('validates an empty manual search without requesting the API', async ({ page }) => {
  const requests = await mockApi(page)
  await page.goto('/')
  await page.getByRole('button', { name: /Buscar/ }).click()
  await expect(page.getByRole('alert')).toContainText('Introduzca un título')
  expect(requests).toHaveLength(0)
})

test('searches automatically with debounce and renders titles, years and posters', async ({ page }) => {
  const requests = await mockApi(page)
  await page.goto('/')
  const box = page.getByRole('searchbox', { name: 'Título de la película' })
  await box.fill('Ma')
  await box.fill('Matrix')
  await expect(page.getByRole('list', { name: 'Películas encontradas' }).locator('li')).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'The Matrix', exact: true })).toBeVisible()
  await expect(page.getByText('1999', { exact: true })).toBeVisible()
  await expect(page.getByAltText('Póster de The Matrix', { exact: true })).toHaveAttribute('src', '/poster-placeholder.svg')
  await page.waitForTimeout(650)
  expect(requests).toEqual(['Matrix'])
})

test('manual search is immediate and repeated requests are deduplicated', async ({ page }) => {
  const requests = await mockApi(page)
  await page.goto('/')
  await search(page)
  await expect(page.getByRole('heading', { name: 'The Matrix', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Buscar/ }).click()
  await page.waitForTimeout(650)
  expect(requests).toEqual(['Matrix'])
})

test('sorts result cards alphabetically and can restore original order', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await search(page)
  const cards = page.locator('.movie-card h3')
  await expect(cards).toHaveCount(3)
  expect(await cards.allTextContents()).toEqual(['The Matrix Reloaded', 'The Matrix', 'The Matrix Revolutions'])
  await page.getByRole('checkbox', { name: 'Ordenar por título (A–Z)' }).check()
  expect(await cards.allTextContents()).toEqual(['The Matrix', 'The Matrix Reloaded', 'The Matrix Revolutions'])
  await page.getByRole('checkbox', { name: 'Ordenar por título (A–Z)' }).uncheck()
  expect(await cards.allTextContents()).toEqual(['The Matrix Reloaded', 'The Matrix', 'The Matrix Revolutions'])
})

test('shows a friendly empty result', async ({ page }) => {
  await mockApi(page, async (_params, route) => {
    await route.fulfill({ json: { Response: 'False', Error: 'Movie not found!' } })
  })
  await page.goto('/')
  await search(page, 'Unknown movie')
  await expect(page.getByText('No hemos encontrado coincidencias')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('shows OMDb errors and allows retrying', async ({ page }) => {
  let calls = 0
  await mockApi(page, async (_params, route) => {
    calls += 1
    const result = calls === 1
      ? { Response: 'False', Error: 'Invalid API key!' }
      : { Response: 'True', Search: movies, totalResults: '3' }
    await route.fulfill({ json: result })
  })
  await page.goto('/')
  await search(page)
  await expect(page.getByRole('alert')).toContainText('Invalid API key!')
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'The Matrix', exact: true })).toBeVisible()
  expect(calls).toBe(2)
})

test('resets search input, sorting, filters and results', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await search(page)
  await expect(page.locator('.movie-card')).toHaveCount(3)
  await page.getByRole('checkbox', { name: 'Ordenar por título (A–Z)' }).check()
  await page.getByRole('button', { name: /Reiniciar búsqueda/ }).click()
  await expect(page.getByRole('searchbox', { name: 'Título de la película' })).toHaveValue('')
  await expect(page.getByRole('checkbox', { name: 'Ordenar por título (A–Z)' })).not.toBeChecked()
  await expect(page.locator('.movie-card')).toHaveCount(0)
  await expect(page.getByText('Historias que esperan ser descubiertas')).toBeVisible()
})

test('loads more results without inserting duplicate movies', async ({ page }) => {
  const requests = await mockApi(page, async (params, route) => {
    const nextPage = params.get('page') === '2'
    await route.fulfill({
      json: {
        Response: 'True',
        totalResults: '4',
        Search: nextPage
          ? [movies[1], { Title: 'The Matrix Resurrections', Year: '2021', imdbID: 'tt10838180', Type: 'movie', Poster: 'N/A' }]
          : movies.slice(0, 2)
      }
    })
  })
  await page.goto('/')
  await search(page)
  await expect(page.locator('.movie-card')).toHaveCount(2)
  await page.getByRole('button', { name: 'Cargar más películas' }).click()
  await expect(page.locator('.movie-card')).toHaveCount(3)
  await expect(page.getByText('Mostrando 3 de 4 resultados')).toBeVisible()
  expect(requests).toEqual(['Matrix', 'Matrix'])
})

test('persists favorites across reloads and filters current results', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await search(page)
  const favorite = page.getByRole('button', { name: 'Añadir The Matrix a favoritos', exact: true })
  await favorite.click()
  await expect(page.getByRole('button', { name: 'Quitar The Matrix de favoritos' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('checkbox', { name: /Solo favoritos/ }).check()
  await expect(page.locator('.movie-card')).toHaveCount(1)
  await page.reload()
  await search(page)
  await page.getByRole('checkbox', { name: /Solo favoritos/ }).check()
  await expect(page.locator('.movie-card')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Quitar The Matrix de favoritos' })).toBeVisible()
})

test('discards stale requests when the query changes', async ({ page }) => {
  await mockApi(page, async (params, route) => {
    if (params.get('s') === 'Matrix') {
      await new Promise(resolve => setTimeout(resolve, 900))
      try {
        await route.fulfill({ json: { Response: 'True', totalResults: '3', Search: movies } })
      } catch {
        // Aborted requests need no response.
      }
    } else {
      await route.fulfill({ json: { Response: 'False', Error: 'Movie not found!' } })
    }
  })
  await page.goto('/')
  await search(page)
  await page.getByRole('searchbox', { name: 'Título de la película' }).fill('Another film')
  await expect(page.getByText('No hemos encontrado coincidencias')).toBeVisible()
  await page.waitForTimeout(950)
  await expect(page.locator('.movie-card')).toHaveCount(0)
})

test('handles HTTP failures without crashing the page', async ({ page }) => {
  await mockApi(page, async (_params, route) => {
    await route.fulfill({ status: 503, json: { error: 'temporarily unavailable' } })
  })
  await page.goto('/')
  await search(page)
  await expect(page.getByRole('alert')).toContainText('HTTP 503')
  await expect(page.getByRole('heading', { name: /Tu próxima película/ })).toBeVisible()
})

test('keeps the page within a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await mockApi(page)
  await page.goto('/')
  await search(page)
  await expect(page.locator('.movie-card')).toHaveCount(3)
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(pageWidth).toBeLessThanOrEqual(375)
})
