# RankPeek Cloudflare API

Cloudflare Worker for RankPeek feedback, announcements, and the announcement admin page.

## Commands

```bash
npm install
npm test
npm run deploy
```

## Announcement Admin

The Worker serves a browser admin page at:

```text
https://api.rankpeek.cn/admin
```

Before using it in production, configure the admin token as a Worker secret:

```bash
npx wrangler secret put ADMIN_TOKEN
```

Open `/admin`, paste the same token into the token field, then create or edit announcements. The page calls:

- `GET /admin/announcements`
- `POST /admin/announcements`
- `PATCH /admin/announcements/:id`

All admin JSON endpoints require:

```text
Authorization: Bearer <ADMIN_TOKEN>
```

Published and enabled announcements are read by the desktop client through the existing public endpoint:

```text
GET /app/announcements
```
