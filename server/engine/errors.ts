export class EngineError extends Error {
  readonly code: string
  readonly isEngineError = true

  constructor(message: string, code = "ENGINE_ERROR") {
    super(message)
    this.name = new.target.name
    this.code = code
  }
}

export class EngineUnavailableError extends EngineError {
  constructor(message = "Engine is not running. Start the app with `npm run dev`.") {
    super(message, "ENGINE_UNAVAILABLE")
  }
}

export class AuthRequiredError extends EngineError {
  constructor(message = "You need to sign in to TikTok first.") {
    super(message, "AUTH_REQUIRED")
  }
}

export class AlreadyAuthenticatedError extends EngineError {
  constructor(message = "Already signed in.") {
    super(message, "ALREADY_AUTHENTICATED")
  }
}

export class CaptchaError extends EngineError {
  constructor(message = "TikTok requires human verification. Complete it in the opened browser window.") {
    super(message, "CAPTCHA")
  }
}

export class NotEligibleError extends EngineError {
  constructor(message = "This account is not eligible to go live from the web.") {
    super(message, "NOT_ELIGIBLE")
  }
}

export class NotLiveError extends EngineError {
  constructor(message = "The requested user is not currently live.") {
    super(message, "NOT_LIVE")
  }
}

export class LoginPageFailedError extends EngineError {
  constructor(message = "Could not load the TikTok login page. Check your network connection and try again.") {
    super(message, "LOGIN_PAGE_FAILED")
  }
}

export class LoginRateLimitedError extends EngineError {
  readonly retryAfter: number

  constructor(
    message = "TikTok is rate-limiting QR login attempts from this network. Wait a few minutes, or use \"Open login window\".",
    retryAfter = 300,
  ) {
    super(message, "LOGIN_RATE_LIMITED")
    this.retryAfter = retryAfter
  }
}

export class SessionImportFailedError extends EngineError {
  constructor(
    message = "No TikTok session found in Firefox. Log in to tiktok.com in Firefox first, then import again.",
  ) {
    super(message, "NO_SESSION_FOUND")
  }
}

export class ExtractionFailedError extends EngineError {
  constructor(message = "Could not extract the stream key from TikTok.") {
    super(message, "EXTRACTION_FAILED")
  }
}
