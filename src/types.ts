export interface Movie {
  id: string
  title: string
  year: string
  poster: string
  type: string
}

export interface MoviePage {
  movies: Movie[]
  total: number
}
