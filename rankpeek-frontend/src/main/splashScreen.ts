export type SplashPalette = {
  logoFile: string
  surfaceColor: string
  glowColor: string
  labelColor: string
}

export type SplashHtmlInput = {
  logoUrl: string
  surfaceColor: string
  glowColor: string
  labelColor: string
}

export function getSplashPalette(useDarkMode: boolean): SplashPalette {
  if (useDarkMode) {
    return {
      logoFile: 'rankpeek-eye-black.png',
      surfaceColor: '#f5f5f0',
      glowColor: 'rgba(10, 16, 30, 0.16)',
      labelColor: '#111827'
    }
  }

  return {
    logoFile: 'rankpeek-eye-white.png',
    surfaceColor: '#04060d',
    glowColor: 'rgba(255, 255, 255, 0.18)',
    labelColor: '#f8fafc'
  }
}

export function buildSplashHtml({
  logoUrl,
  surfaceColor,
  glowColor,
  labelColor
}: SplashHtmlInput): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RankPeek Splash</title>
    <style>
      :root {
        color-scheme: light dark;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
        background: radial-gradient(circle at center, ${glowColor} 0%, transparent 56%), ${surfaceColor};
        overflow: hidden;
      }

      .splash-shell {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 20px;
        text-align: center;
      }

      .splash-logo {
        width: 176px;
        height: 176px;
        object-fit: contain;
        animation: blink 1.6s ease-in-out infinite;
        filter: drop-shadow(0 16px 30px ${glowColor});
      }

      .splash-label {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: 0.12em;
        color: ${labelColor};
        opacity: 0.84;
      }

      @keyframes blink {
        0%,
        100% {
          opacity: 0.38;
          transform: scale(0.985);
        }

        50% {
          opacity: 1;
          transform: scale(1);
        }
      }
    </style>
  </head>
  <body>
    <main class="splash-shell">
      <img class="splash-logo" src="${logoUrl}" alt="RankPeek logo" />
      <p class="splash-label">等待 RankPeek 启动中</p>
    </main>
  </body>
</html>`
}
