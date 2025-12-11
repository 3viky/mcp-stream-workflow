# Conventional Commit Guidelines

This project uses **automated semantic versioning** based on commit messages.

## Commit Message Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Types and Version Bumps

| Type | Version Bump | Example |
|------|--------------|---------|
| `feat:` | **Minor** (0.1.0 → 0.2.0) | New features |
| `fix:` | **Patch** (0.1.0 → 0.1.1) | Bug fixes |
| `feat!:` or `BREAKING CHANGE:` | **Major** (0.1.0 → 1.0.0) | Breaking changes |
| `chore:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:` | **None** (no release) | Non-functional changes |

## Examples

### Minor Version Bump (New Feature)
```bash
git commit -m "feat: add getMCPServiceSubdir helper function"
# 1.0.0 → 1.1.0
```

### Patch Version Bump (Bug Fix)
```bash
git commit -m "fix: correct version path resolution in ESM modules"
# 1.0.0 → 1.0.1
```

### Major Version Bump (Breaking Change)
```bash
git commit -m "feat!: rename createVersionInfo to buildVersionInfo

BREAKING CHANGE: createVersionInfo function renamed to buildVersionInfo.
Update all imports."
# 1.0.0 → 2.0.0
```

### No Version Bump
```bash
git commit -m "docs: update installation instructions"
git commit -m "chore: update dependencies"
git commit -m "test: add unit tests for version helper"
# No version bump - no release created
```

## Automation Workflow

**On every push to `main`:**
1. GitHub Actions analyzes commits since last tag
2. Determines version bump type
3. Updates `package.json`
4. Creates git tag
5. Publishes to GitHub Packages
6. Creates GitHub Release

**To skip CI** (prevent infinite loop):
```bash
git commit -m "chore: update docs [skip ci]"
```

## Multi-line Commits

```bash
git commit -m "feat: add data directory management

- Add getMCPServiceSubdir() helper
- Support cross-platform cache directories
- Follow OS conventions for temporary data"
```

## Scopes (Optional)

```bash
git commit -m "feat(version): add package validation"
git commit -m "fix(types): export MCPResponse interface"
git commit -m "docs(readme): clarify installation steps"
```

## Best Practices

1. **One logical change per commit** - Makes version history clear
2. **Use imperative mood** - "add feature" not "added feature"
3. **Keep subject line under 72 characters** - Better readability
4. **Explain WHY in body** - What changed is in the diff
5. **Reference issues** - `Fixes #123` in footer

## Migration from Manual Versioning

**Old workflow (manual):**
```bash
./release.sh patch
git push origin main --tags
```

**New workflow (automatic):**
```bash
git commit -m "fix: correct edge case in version detection"
git push origin main
# GitHub Actions handles everything automatically
```

## Troubleshooting

### No release created

**Cause:** Commit type doesn't trigger version bump (e.g., `docs:`, `chore:`)

**Solution:** Use `feat:` or `fix:` for releasable changes

### Wrong version bump

**Cause:** Incorrect commit type

**Solution:** Check commit message follows convention

### Release loop

**Cause:** Missing `[skip ci]` in automated commits

**Solution:** Workflow already includes `[skip ci]` in version bump commits
