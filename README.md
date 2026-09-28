# misc.* design house — website

Single-page site. No build step: plain `index.html`, `css/`, `js/` (ES modules), `assets/`.
Libraries (GSAP, ScrollTrigger, Lenis, fonts) load from CDN.

## Preview locally

```bash
python -m http.server 8765
```

Then open http://localhost:8765.

## Deploy — Coolify on Hetzner, behind Cloudflare

1. **Push this folder to a git repo** (GitHub/GitLab/Gitea) that your Coolify instance can read.
2. **Coolify → New Resource → Application → your repo.**
   - Build pack: **Dockerfile** (the one in this repo builds an nginx image).
   - Port: **80**.
   - Domain: `https://wearemisc.com` (and `https://www.wearemisc.com` if you want both; add a redirect rule in Coolify).
   - Leave "Force HTTPS" on. Coolify's Traefik issues a Let's Encrypt cert.
3. **Cloudflare DNS** (zone `wearemisc.com`):
   - `A  @    <hetzner-ipv4>`  proxied (orange cloud)
   - `A  www  <hetzner-ipv4>`  proxied
   - If the server has IPv6, add matching `AAAA` records.
4. **Cloudflare SSL/TLS → Overview → Full (strict).** Never "Flexible": Coolify already serves HTTPS and Flexible causes redirect loops.
5. **Cloudflare SSL/TLS → Edge Certificates**: turn on *Always Use HTTPS* and *Automatic HTTPS Rewrites*.
6. **Cloudflare Speed / Scrape Shield — switch these OFF for the zone** (each one breaks something here):
   - *Rocket Loader* (reorders the GSAP/Lenis scripts before the module runs)
   - *Mirage* / *Polish* (they rewrite the dithered JPGs the canvases sample from)
   - *Email Address Obfuscation* (wraps `hello@wearemisc.com` in a script, killing the contact hover)
   - Leave *Brotli* and caching on; the nginx config already sets long cache headers for assets.
7. Deploy. Every push to the tracked branch redeploys (enable the webhook in Coolify → Application → Webhooks, or leave polling on).
8. **After each deploy: Cloudflare → Caching → Purge Everything.** CSS/JS are unversioned; nginx caches them for 10 minutes and Cloudflare's edge may hold them longer.

### Certificate note

Let's Encrypt HTTP-01 works through the Cloudflare proxy as long as port 80 reaches the server and SSL mode is Full (strict). If issuance ever fails, generate a **Cloudflare Origin Certificate** (SSL/TLS → Origin Server) and paste it into Coolify → Server → Proxy → Custom certificate instead.

### Hetzner firewall

Allow inbound 80 and 443 from anywhere (or restrict to [Cloudflare's IP ranges](https://www.cloudflare.com/ips/)), plus 22 and Coolify's 8000 from your own IP only.

## Editing content

All copy is in `index.html`. Project cards, people and studio numbers are plain HTML: swap the `[bracketed]` placeholders when you have real projects. Photos in `assets/img/` are grayscale; the site duotones and dithers them at runtime, so drop in any new grayscale JPG and it will match.
