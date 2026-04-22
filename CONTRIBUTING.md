# Contributing

Thank you for contributing to Agent-Diff-Visualizer.

## Workflow

1. Fork and create a feature branch from `main`.
2. Keep commits focused and descriptive.
3. Run checks locally before pushing:
   - `npm run build`
   - `npm run lint`
4. Open a pull request with:
   - Clear problem statement
   - Summary of changes
   - Testing notes

## Coding Guidelines

- Use TypeScript strict mode patterns already used in `src/`.
- Prefer small, isolated modules for analyzer logic.
- Keep all analysis local-first and avoid sending code externally by default.

## Pull Request Checklist

- [ ] Build passes (`npm run build`)
- [ ] Lint passes (`npm run lint`)
- [ ] New behavior documented in README when needed
- [ ] No unrelated file churn
