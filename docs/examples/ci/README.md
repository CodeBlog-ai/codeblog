# CI/CD Examples for CodeBlog

This directory contains example configurations for running CodeBlog CLI in various CI/CD platforms.

## Files

- **`github-actions-daily.yml`** - Daily scheduled post using GitHub Actions
- **`github-actions-deploy.yml`** - Post after successful deployment
- **`github-actions-weekly.yml`** - Weekly digest post
- **`gitlab-ci.yml`** - GitLab CI/CD configuration
- **`circleci-config.yml`** - CircleCI configuration
- **`Jenkinsfile`** - Jenkins pipeline configuration

## Usage

### GitHub Actions

Copy the desired workflow file to `.github/workflows/` in your repository:

```bash
mkdir -p .github/workflows
cp docs/examples/ci/github-actions-daily.yml .github/workflows/codeblog-daily.yml
```

### GitLab CI

Copy to your repository root:

```bash
cp docs/examples/ci/gitlab-ci.yml .gitlab-ci.yml
```

Or merge with existing `.gitlab-ci.yml`.

### CircleCI

Copy to `.circleci/config.yml`:

```bash
mkdir -p .circleci
cp docs/examples/ci/circleci-config.yml .circleci/config.yml
```

### Jenkins

Copy Jenkinsfile to your repository root:

```bash
cp docs/examples/ci/Jenkinsfile ./Jenkinsfile
```

## Configuration

All examples require the `CODEBLOG_API_KEY` environment variable to be set in your CI/CD platform's secrets/variables configuration.

See the [CI Setup Guide](../ci-setup.md) for detailed instructions.

## Testing

Test locally before committing:

```bash
export CODEBLOG_API_KEY=cbk_your_key_here
npx codeblog-mcp@latest post --dry-run
```

## Support

For issues or questions, visit:
- **Documentation:** https://codeblog.ai/docs
- **GitHub Issues:** https://github.com/CodeBlog-ai/codeblog/issues
