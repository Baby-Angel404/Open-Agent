export interface RedactionConfig {
  sensitiveKeys?: string[];
  patterns?: RegExp[];
  maskString?: string;
}

export class SecretRedactor {
  private sensitiveKeys: Set<string>;
  private patterns: RegExp[];
  private maskString: string;

  private static readonly DEFAULT_SENSITIVE_KEYS = [
    "password",
    "passwd",
    "passphrase",
    "pin",
    "otp",
    "secret",
    "secret_key",
    "token",
    "api_key",
    "apikey",
    "access_token",
    "refresh_token",
    "private_key",
    "authorization",
    "proxy-authorization",
    "auth",
    "cookie",
    "cookies",
    "set-cookie",
    "credentials",
    "cvv",
    "cvc",
    "ssn",
    "card_number",
    "credit_card",
  ];

  private static readonly DEFAULT_PATTERNS = [
    /bearer\s+[a-zA-Z0-9._~+/-]+=*/gi,
    /basic\s+[a-zA-Z0-9+/=]+/gi,
    /sk-[a-zA-Z0-9]{20,}/g,
    /ghp_[a-zA-Z0-9]{20,}/g,
    /ey[A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g,
    /([?&](?:api_key|token|access_token|secret|password|auth)=)[^&]+/gi,
  ];

  constructor(config?: RedactionConfig) {
    const keys = config?.sensitiveKeys ?? SecretRedactor.DEFAULT_SENSITIVE_KEYS;
    this.sensitiveKeys = new Set(keys.map((k) => k.toLowerCase()));
    this.patterns = config?.patterns ?? SecretRedactor.DEFAULT_PATTERNS;
    this.maskString = config?.maskString ?? "[REDACTED]";
  }

  redactString(text: string): string {
    let result = text;
    for (const pattern of this.patterns) {
      if (pattern.source.includes("([?&]")) {
        result = result.replace(pattern, `$1${this.maskString}`);
      } else {
        result = result.replace(pattern, this.maskString);
      }
    }
    return result;
  }

  redactObject<T>(input: T): T {
    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input === "string") {
      return this.redactString(input) as unknown as T;
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.redactObject(item)) as unknown as T;
    }

    if (typeof input === "object") {
      const obj = input as Record<string, unknown>;

      // Check structured form metadata: if input is an element or field descriptor
      const isSensitiveField =
        obj.type === "password" ||
        obj.fieldType === "password" ||
        obj.inputType === "password" ||
        obj.isSensitive === true;

      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();

        if (this.sensitiveKeys.has(lowerKey)) {
          sanitized[key] = this.maskString;
        } else if (
          isSensitiveField &&
          (lowerKey === "value" || lowerKey === "text" || lowerKey === "input")
        ) {
          sanitized[key] = this.maskString;
        } else {
          sanitized[key] = this.redactObject(value);
        }
      }
      return sanitized as T;
    }

    return input;
  }
}
