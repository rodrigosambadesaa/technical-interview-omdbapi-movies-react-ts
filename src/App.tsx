import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { searchMovies } from './api/omdb'
import type { Movie, MoviePage } from './types'

type Status = 'idle' | 'loading' | 'success' | 'error'
type CachedSearch = MoviePage & { page: number }
type ActiveRequest = { query: string, page: number, controller: AbortController }

const FAVORITES_KEY = 'omdb-movie-favorites-v1'
const DEBOUNCE_MS = 500

function normalizedQuery (value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function readFavorites (): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]')
    return Array.isArray(stored)
      ? stored.filter((value): value is string => typeof value === 'string' && /^tt\d+$/.test(value))
      : []
  } catch {
    return []
  }
}

function movieLabel (type: string): string {
  if (type === 'movie') return 'Película'
  if (type === 'series') return 'Serie'
  if (type === 'episode') return 'Episodio'
  return type
}

function MovieCard ({ movie, favorite, onFavorite }: {
  movie: Movie
  favorite: boolean
  onFavorite: (id: string) => void
}) {
  const [posterError, setPosterError] = useState(false)
  const poster = posterError || movie.poster === 'N/A' || !movie.poster
    ? '/poster-placeholder.svg'
    : movie.poster

  return (
    <li className="movie-card">
      <div className="poster-wrap">
        <img
          src={poster}
          alt={`Póster de ${movie.title}`}
          loading="lazy"
          onError={() => setPosterError(true)}
        />
        <span className="movie-type">{movieLabel(movie.type)}</span>
        <button
          className={`favorite-button ${favorite ? 'is-favorite' : ''}`}
          type="button"
          aria-label={favorite ? `Quitar ${movie.title} de favoritos` : `Añadir ${movie.title} a favoritos`}
          aria-pressed={favorite}
          onClick={() => onFavorite(movie.id)}
          title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        >
          {favorite ? '♥' : '♡'}
        </button>
      </div>
      <div className="movie-information">
        <h3>{movie.title}</h3>
        <div className="movie-meta">
          <span>{movie.year}</span>
          <a
            href={`https://www.imdb.com/title/${movie.id}/`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Ver ${movie.title} en IMDb (abre en otra pestaña)`}
          >
            IMDb ↗
          </a>
        </div>
      </div>
    </li>
  )
}

function App () {
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [movies, setMovies] = useState<Movie[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [validationError, setValidationError] = useState('')
  const [pageError, setPageError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [sortByTitle, setSortByTitle] = useState(false)
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(readFavorites)

  const cache = useRef(new Map<string, CachedSearch>())
  const activeRequest = useRef<ActiveRequest | null>(null)
  const activeQueryKey = useRef('')
  const debounceTimer = useRef<number | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
    } catch {
      // Private browsing or blocked storage must not prevent searching.
    }
  }, [favorites])

  const abortRequest = useCallback(() => {
    activeRequest.current?.controller.abort()
    activeRequest.current = null
  }, [])

  const runSearch = useCallback((value: string) => {
    const term = normalizedQuery(value)
    if (!term) return
    const key = term.toLocaleLowerCase()

    if (activeRequest.current?.query === key && activeRequest.current.page === 1) return
    abortRequest()
    activeQueryKey.current = key
    setActiveQuery(term)
    setValidationError('')
    setPageError('')

    const cached = cache.current.get(key)
    if (cached) {
      setMovies(cached.movies)
      setTotal(cached.total)
      setPage(cached.page)
      setStatus('success')
      setLoadingMore(false)
      setError('')
      return
    }

    const controller = new AbortController()
    activeRequest.current = { query: key, page: 1, controller }
    setMovies([])
    setTotal(0)
    setPage(0)
    setError('')
    setLoadingMore(false)
    setStatus('loading')

    void searchMovies(term, 1, controller.signal)
      .then(result => {
        if (activeRequest.current?.controller !== controller) return
        cache.current.set(key, { ...result, page: 1 })
        setMovies(result.movies)
        setTotal(result.total)
        setPage(1)
        setStatus('success')
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || activeRequest.current?.controller !== controller) return
        setError(cause instanceof Error ? cause.message : 'Se produjo un error inesperado.')
        setStatus('error')
      })
      .finally(() => {
        if (activeRequest.current?.controller === controller) activeRequest.current = null
      })
  }, [abortRequest])

  useEffect(() => {
    if (normalizedQuery(query).length < 2) return
    const timer = window.setTimeout(() => runSearch(query), DEBOUNCE_MS)
    debounceTimer.current = timer
    return () => {
      window.clearTimeout(timer)
      if (debounceTimer.current === timer) debounceTimer.current = null
    }
  }, [query, runSearch])

  useEffect(() => () => {
    activeRequest.current?.controller.abort()
  }, [])

  const changeQuery = (value: string) => {
    setQuery(value)
    setValidationError('')
    const key = normalizedQuery(value).toLocaleLowerCase()
    if (key !== activeQueryKey.current) {
      abortRequest()
      activeQueryKey.current = ''
      setMovies([])
      setTotal(0)
      setPage(0)
      setStatus('idle')
      setError('')
      setPageError('')
      setLoadingMore(false)
    }
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current)
    if (!normalizedQuery(query)) {
      abortRequest()
      setValidationError('Introduzca un título para buscar películas.')
      return
    }
    runSearch(query)
  }

  const reset = () => {
    abortRequest()
    if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current)
    activeQueryKey.current = ''
    setQuery('')
    setActiveQuery('')
    setMovies([])
    setTotal(0)
    setPage(0)
    setStatus('idle')
    setError('')
    setValidationError('')
    setPageError('')
    setLoadingMore(false)
    setSortByTitle(false)
    setOnlyFavorites(false)
  }

  const loadMore = () => {
    if (loadingMore || !activeQuery || movies.length >= total || status !== 'success') return
    const term = activeQuery
    const key = normalizedQuery(term).toLocaleLowerCase()
    const nextPage = page + 1
    const controller = new AbortController()
    abortRequest()
    activeRequest.current = { query: key, page: nextPage, controller }
    setLoadingMore(true)
    setPageError('')
    void searchMovies(term, nextPage, controller.signal)
      .then(result => {
        if (activeRequest.current?.controller !== controller) return
        setMovies(previous => {
          const known = new Set(previous.map(movie => movie.id))
          const additional = result.movies.filter(movie => !known.has(movie.id))
          const combined = [...previous, ...additional]
          cache.current.set(key, { movies: combined, total: result.total, page: nextPage })
          return combined
        })
        setTotal(result.total)
        setPage(nextPage)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || activeRequest.current?.controller !== controller) return
        setPageError(cause instanceof Error ? cause.message : 'No se pudo cargar la siguiente página.')
      })
      .finally(() => {
        if (activeRequest.current?.controller === controller) {
          activeRequest.current = null
          setLoadingMore(false)
        }
      })
  }

  const toggleFavorite = (id: string) => {
    setFavorites(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  const visibleMovies = useMemo(() => {
    const filtered = onlyFavorites ? movies.filter(movie => favorites.includes(movie.id)) : [...movies]
    return sortByTitle ? [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'es')) : filtered
  }, [movies, sortByTitle, onlyFavorites, favorites])

  const hasMore = status === 'success' && movies.length < total
  const feedback = validationError || (status === 'error' ? error : '')

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="CineFinder, inicio">
          <span className="brand-symbol" aria-hidden="true">▶</span>
          <span>Cine<span className="brand-accent">Finder</span></span>
        </a>
        <span className="header-note">Explora el universo del cine</span>
      </header>

      <main>
        <section className="hero" aria-labelledby="main-title">
          <p className="eyebrow">DESCUBRE · BUSCA · GUARDA</p>
          <h1 id="main-title">Tu próxima película <em>favorita</em> está aquí.</h1>
          <p className="hero-description">
            Encuentra películas y series en la base de datos de OMDb. Busca por título y guarda lo que quieras ver.
          </p>
          <form role="search" className="search-form" onSubmit={submitSearch} noValidate>
            <label className="sr-only" htmlFor="movie-search">Título de la película</label>
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              id="movie-search"
              type="search"
              name="search"
              autoComplete="off"
              placeholder="Busca una película… p. ej., Matrix"
              value={query}
              onChange={event => changeQuery(event.target.value)}
              aria-invalid={Boolean(validationError)}
              aria-describedby={validationError ? 'search-error' : undefined}
            />
            <button className="primary-button" type="submit">Buscar <span aria-hidden="true">→</span></button>
          </form>
          {validationError && <p id="search-error" className="form-error" role="alert">{validationError}</p>}
          <p className="search-hint">Búsqueda automática al escribir · Sin necesidad de pulsar Buscar</p>
        </section>

        <section className="results" aria-labelledby="results-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">TU CARTELERA</p>
              <h2 id="results-title">{activeQuery ? `Resultados de «${activeQuery}»` : 'Descubre algo increíble'}</h2>
              {status === 'success' && (
                <p className="results-count" aria-live="polite">
                  {total === 0 ? 'No se encontraron títulos.' : `Mostrando ${movies.length} de ${total} resultados`}
                </p>
              )}
            </div>
            <button className="reset-button" type="button" onClick={reset}>Reiniciar búsqueda ↺</button>
          </div>

          <div className="toolbar">
            <label className="toggle-option" htmlFor="sort-by-title">
              <input
                id="sort-by-title"
                type="checkbox"
                checked={sortByTitle}
                onChange={event => setSortByTitle(event.target.checked)}
              />
              Ordenar por título (A–Z)
            </label>
            <label className="toggle-option" htmlFor="only-favorites">
              <input
                id="only-favorites"
                type="checkbox"
                checked={onlyFavorites}
                onChange={event => setOnlyFavorites(event.target.checked)}
              />
              Solo favoritos <span className="favorite-count">{favorites.length}</span>
            </label>
          </div>

          {status === 'idle' && !feedback && (
            <div className="empty-state">
              <span className="empty-icon" aria-hidden="true">✦</span>
              <h3>Historias que esperan ser descubiertas</h3>
              <p>Escribe un título en el buscador para explorar películas y series.</p>
            </div>
          )}
          {status === 'loading' && (
            <div className="empty-state" role="status" aria-live="polite">
              <span className="loading-spinner" aria-hidden="true" />
              <p>Buscando películas…</p>
            </div>
          )}
          {status === 'error' && !validationError && (
            <div className="notice notice-error" role="alert">
              <h3>No se pudo realizar la búsqueda</h3>
              <p>{error}</p>
              <button type="button" onClick={() => runSearch(query)}>Reintentar</button>
            </div>
          )}
          {status === 'success' && movies.length === 0 && (
            <div className="empty-state" role="status">
              <span className="empty-icon" aria-hidden="true">⌕</span>
              <h3>No hemos encontrado coincidencias</h3>
              <p>Prueba con otro título o revisa su ortografía.</p>
            </div>
          )}
          {status === 'success' && movies.length > 0 && visibleMovies.length === 0 && (
            <div className="empty-state" role="status">
              <h3>No hay favoritos entre estos resultados</h3>
              <p>Marca el corazón de una película para guardarla.</p>
            </div>
          )}
          {status === 'success' && visibleMovies.length > 0 && (
            <ul className="movie-grid" aria-label="Películas encontradas">
              {visibleMovies.map(movie => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  favorite={favorites.includes(movie.id)}
                  onFavorite={toggleFavorite}
                />
              ))}
            </ul>
          )}
          {status === 'success' && pageError && (
            <div className="notice notice-error" role="alert">
              <p>{pageError}</p>
              <button type="button" onClick={loadMore}>Reintentar carga</button>
            </div>
          )}
          {hasMore && (
            <div className="load-more-wrap">
              <button className="load-more-button" type="button" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Cargando…' : 'Cargar más películas'}
              </button>
            </div>
          )}
        </section>
      </main>
      <footer>Datos proporcionados por <a href="https://www.omdbapi.com/" target="_blank" rel="noopener noreferrer">OMDb API</a> · CineFinder</footer>
    </div>
  )
}

export default App
