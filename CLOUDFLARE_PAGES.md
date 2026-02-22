# Cloudflare Pages Deploy

- Root directory: `.`
- Build command: `npm ci && npx @cloudflare/next-on-pages`
- Output directory: `.vercel/output/static`

AdSense/Review automation:
- `tools/release_ops.sh cloudflare`
- `tools/release_ops.sh apply-adsense <ca-pub-xxxxxxxxxxxxxxxx> <slot-id>`
- `tools/release_ops.sh check`
