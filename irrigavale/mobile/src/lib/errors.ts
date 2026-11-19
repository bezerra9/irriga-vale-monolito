export function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Algo inesperado aconteceu. Tente novamente.';
}
