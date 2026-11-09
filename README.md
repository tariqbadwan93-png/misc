# misc.* design house — website

Single-page site. No build step: plain `index.html`, `css/style.css`, `js/` (ES modules), `assets/`.
Libraries (GSAP with ScrollTrigger and SplitText, Lenis, three.js, fonts) load from jsDelivr and Google Fonts.

- `js/main.js` wires smooth scroll, reveals and which colour the backdrop leans toward.
- `js/scene.js` is the fixed WebGL backdrop: the teal/orange light field and the glass asterisk.
- `js/gallery.js` is the Selected work gallery: a 3D row panned by scroll or drag; a click opens a project.
- Add `?static=1` to any URL to see the reduced-motion version (also handy for screenshots).
- Version 1 of the site (the busy one) is kept as the git tag `v1-busy`.

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
   - *Email Address Obfuscation* (rewrites the `hello@wearemisc.com` links)
   - Leave *Brotli* and caching on; the nginx config already sets long cache headers for assets.
7. Deploy. Every push to the tracked branch redeploys (enable the webhook in Coolify → Application → Webhooks, or leave polling on).
8. **After each deploy: Cloudflare → Caching → Purge Everything.** CSS/JS are unversioned; nginx caches them for 10 minutes and Cloudflare's edge may hold them longer.

### Certificate note

Let's Encrypt HTTP-01 works through the Cloudflare proxy as long as port 80 reaches the server and SSL mode is Full (strict). If issuance ever fails, generate a **Cloudflare Origin Certificate** (SSL/TLS → Origin Server) and paste it into Coolify → Server → Proxy → Custom certificate instead.

### Hetzner firewall

Allow inbound 80 and 443 from anywhere (or restrict to [Cloudflare's IP ranges](https://www.cloudflare.com/ips/)), plus 22 and Coolify's 8000 from your own IP only.

## Editing content

All copy is in `index.html`. Each project in Selected work is one `<li class="card">`: the image, the title,
the `discipline — year` line and a one-sentence description. `data-mix` (0 to 1) sets how far the backdrop leans
from teal to orange while that project is in front. The project names and descriptions are placeholders.

Photos live in `assets/work/` as 1050×1400 WebP (3:4). They are free Unsplash photos used as stand-ins;
`assets/work/credits.json` lists each photographer and source. Replace them with real project photography.
