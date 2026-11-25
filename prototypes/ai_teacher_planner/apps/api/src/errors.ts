/** An expected failure with a sentence she can act on. The error handler turns it into JSON. */
export class ApiError extends Error {
  readonly status: 403 | 404 | 409 | 422;
  readonly code: string;
  readonly issues: string[] | undefined;
  constructor(
    status: 403 | 404 | 409 | 422,
    code: string,
    message: string,
    issues?: string[],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}
