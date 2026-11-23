import type { Movie, MoviePage } from '../types'

const DEFAULT_API_URL = 'https://www.omdbapi.com/'

interface OmdbMovie {
  Title: string
  Year: string
  imdbID: string
  Type: string
  Poster: string
}

interface OmdbResponse {
  Response?: unknown
  Search?: unknown
  totalResults?: unknown
  Error?: unknown
}

function isOmdbMovie (value: unknown): value is OmdbMovie {
  if (typeof value !== 'object' || value === null) return false
  const movie = value as Record<string, unknown>
  return typeof movie.Title === 'string' &&
    typeof movie.Year === 'string' &&
    typeof movie.imdbID === 'string' &&
    typeof movie.Type === 'string' &&
    typeof movie.Poster === 'string' &&
    /^tt\d+$/.test(movie.imdbID)
}

export async function searchMovies (query: string, page: number, signal: AbortSignal): Promise<MoviePage> {
  const apiKey = import.meta.env.VITE_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('Falta VITE_API_KEY. Configure su clave de OMDb en el archivo .env.')
  }

  const url = new URL(import.meta.env.VITE_API_URL || DEFAULT_API_URL)
  url.searchParams.set('apikey', apiKey)
  url.searchParams.set('s', query)
  url.searchParams.set('page', String(page))

  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`No se pudo conectar con OMDb (HTTP ${response.status}).`)
  }

  const data: unknown = await response.json()
  if (typeof data !== 'object' || data === null) {
    throw new Error('OMDb ha devuelto una respuesta inesperada.')
  }
  const payload = data as OmdbResponse
  if (payload.Response === 'False') {
    const message = typeof payload.Error === 'string' ? payload.Error : ''
    if (/movie not found/i.test(message)) return { movies: [], total: 0 }
    throw new Error(message || 'OMDb no ha podido completar la búsqueda.')
  }
  if (payload.Response !== 'True' || !Array.isArray(payload.Search)) {
    throw new Error('OMDb ha devuelto datos de búsqueda no válidos.')
  }

  const movies: Movie[] = payload.Search.filter(isOmdbMovie).map(movie => ({
    id: movie.imdbID,
    title: movie.Title,
    year: movie.Year,
    poster: movie.Poster,
    type: movie.Type
  }))
  const count = Number(payload.totalResults)

  return { movies, total: Number.isFinite(count) && count >= 0 ? count : movies.length }
}
