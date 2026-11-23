export type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "OFFLINE"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly statusCode: number;
  readonly recoverable: boolean;

  constructor(
    message: string,
    options?: {
      code?: AppErrorCode;
      statusCode?: number;
      recoverable?: boolean;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = "AppError";
    this.code = options?.code ?? "INTERNAL_ERROR";
    this.statusCode = options?.statusCode ?? 500;
    this.recoverable = options?.recoverable ?? true;
  }
}

/**
 * Normalizes unknown thrown values into a predictable AppError instance.
 */
export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    return new AppError(error.message, {
      code: "INTERNAL_ERROR",
      cause: error,
    });
  }
  return new AppError("An unexpected error occurred.", {
    code: "INTERNAL_ERROR",
    cause: error,
  });
}
