## Description

<!-- Provide a clear, concise summary of the change and motivation -->

## Related Issues

<!-- Link to any related issues or discussions (e.g., Fixes #123) -->

## Type of Change

- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing behavior to change)
- [ ] Security fix / hardening
- [ ] Documentation update

## Security & Verification Checklist

- [ ] My code adheres to the project's zero-trust, fail-closed policy design.
- [ ] I have not added dependencies with known security vulnerabilities.
- [ ] All new and existing tests pass locally (`npm test` and `npm run test:security`).
- [ ] Type checks pass without errors (`npm run typecheck`).
- [ ] Code formatting conforms to style guidelines (`npm run format:check`).
- [ ] I have added automated tests covering any new branches or edge cases.
- [ ] Sensitive secrets (keys, passwords, tokens) are never logged in plaintext.
