# RankPeek

英雄联盟对局助手（Windows 桌面版）。**赛前看队友，海斗选强化。**

官网与下载：<https://rankpeek.cn>

## 这个仓库包含什么

| 目录 | 内容 |
| --- | --- |
| `rankpeek-frontend/` | Electron + Vue 3 + TypeScript 桌面端 |
| `rankpeek-backend/` | Spring Boot 3 本地后端（GraalVM 原生镜像，单文件约 100 MB） |
| `rankpeek-cloudflare/` | Cloudflare Worker：意见反馈、公告下发、下载分发 |
| `rankpeek-server/service/` | 自建数据接收端（Python 标准库，无第三方依赖） |

## 这个仓库**不**包含什么

| 缺的部分 | 原因 |
| --- | --- |
| `rankpeek-server/scripts/` | 数据聚合与发布 —— 榜单具体怎么算出来的 |
| `rankpeek-server/deploy/` | 部署脚本 |
| `rankpeek-frontend/public/ocr-models/` | OCR 模型（约 20 MB，第三方转换产物，授权待确认） |

**这不影响「客户端有没有偷偷上传」这件事的审查。** 那只需要看客户端发什么，以及接收端收什么 —— 两者都在这个仓库里。

## 隐私

一句话：**上传默认关闭；开了也只传游戏数据。**

完整的字段白名单、绝不上传清单、去重哈希算法、保留期为什么不能靠过期删除、怎么撤回，全部写在 [PRIVACY.md](PRIVACY.md)。

这些说法不是空口承诺，可以逐条对照代码：

- **白名单与反向黑名单** → `rankpeek-server/service/hextech_ingest.py`（出现 `puuid` / `gameName` / `tagLine` / `summonerId` 直接 400）
- **不存明细** → 同文件，只落 `actor_cell` 匿名计数，不保存逐局记录
- **本机编号只存哈希** → 同文件，`sha256(installId + 服务端盐)`
- **客户端到底发了什么** → `rankpeek-backend/src/main/java/io/rankpeek/hextech/HextechContributionService.java`
- **开关默认关闭** → `rankpeek-frontend/src/renderer/views/HextechView.vue`

## 从源码构建

需要 Windows + GraalVM JDK 21 + Visual Studio Build Tools（C++ 桌面工作负载）+ Node.js 18+。

```
build.bat
```

产物在 `rankpeek-frontend/release/`。构建前请确认 `GRAALVM_HOME` 指向你的 GraalVM。

> **构建出来的版本不含上传目标地址。** 地址放在
> `rankpeek-backend/src/main/resources/endpoints.properties`（不入库，见 `.gitignore`）。
> 拿不到这个文件时，海斗的自建数据、数据包与上传会整块关闭，其余功能照常 ——
> 这是刻意的：避免任何人克隆一份就往我们的服务器传数据。

### OCR 模型

`rankpeek-frontend/public/ocr-models/` 不在仓库里。首次使用屏幕识别时，客户端会自动把模型下载到本机缓存目录（`%LOCALAPPDATA%\RankPeek\hextech\ocr-models`）；也可以在构建前手动放回该目录，让它随包分发。

## 许可

MIT，见 [LICENSE](LICENSE)。

RankPeek 是非官方工具，与 Riot Games 及腾讯无任何关联。
