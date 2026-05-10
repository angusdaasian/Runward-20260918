## 任務目標

為 Runward 製作繁體中文 Threads 宣傳素材：3 個風格的貼文文案 + 1 支 9:16 直式 Remotion 動畫廣告。

---

## Part 1：Threads 貼文（3 版本，繁體中文）

全部交付為一份 Markdown 檔案 `/mnt/documents/runward-threads-posts.md`，方便你直接複製。

**版本 A — 熱血激勵型**
- 強烈口號開場（例如「跑步的痛，比放棄的痛還短」）
- 2-3 行情緒拉滿的句子 + emoji（🏃‍♂️🔥💪）
- 結尾 CTA：下載 Runward
- 5-8 個相關 hashtag（#跑步 #馬拉松 #RunwardApp …）

**版本 B — 功能介紹型**
- 開頭一句痛點（「還在用三個 app 看跑步數據？」）
- 條列 Runward 主要功能：AI 教練、姿勢分析、訓練計畫、Garmin/Strava 同步、獎勵系統
- 結尾簡短 CTA + hashtag

**版本 C — 故事/日常型**
- 第一人稱日常口吻（「今天清晨 6 點，配速比上週快了 15 秒…」）
- 自然帶出 app 怎麼幫助到他
- 結尾溫暖 CTA + hashtag

每則貼文都會控制在 Threads 500 字元上限內。

---

## Part 2：Remotion 9:16 直式動畫宣傳片

**規格**
- 1080 x 1920、30 fps、約 18 秒（540 frames）
- 全程繁體中文文案、零互動、靜音輸出
- 輸出至 `/mnt/documents/runward-promo-9x16.mp4`

**美術方向**
- 風格：Tech Product + Kinetic Energy 混搭（乾淨幾何、快節奏文字動畫、運動感）
- 配色：取自 Runward 既有品牌色（會先讀 `src/index.css` / `tailwind.config.ts` 取 primary tokens），預期是深色背景 + 鮮明 accent
- 字型：Noto Sans TC（繁中）+ 一個 display 英文字（如 Inter / Space Grotesk）載入透過 `@remotion/google-fonts`
- 動效系統：spring 進場、文字逐字顯示、scene 之間用 wipe / slide 轉場

**5 個 scene 分鏡**

1. **Hook（0-3s）**：黑底 → 大字「你的下一場 PB，從這裡開始。」逐字浮現，背景有跑道線條向前延伸
2. **痛點（3-6s）**：分割畫面 + 文字「數據散落在三個 app？訓練沒方向？」配快切動畫
3. **功能展示（6-12s）**：四個卡片依序彈入
   - 🤖 AI 跑步教練
   - 📊 姿勢分析
   - 📅 個人化訓練計畫
   - 🏆 跑步獎勵 & 排行榜
4. **數據/社群感（12-15s）**：抽象視覺呈現「同步 Garmin・Strava・Apple Health」+ 跳動的數字（VO₂max、配速、距離）
5. **Logo + CTA（15-18s）**：Runward logo 大字進場，下方「立即下載 · runward.app」+ QR code 風格裝飾

**關於「進入 native view 截圖」**
我評估後**不採用實機截圖路線**，原因：
- Remotion 在 sandbox 是無頭渲染，無法真的開 native shell 拿畫面
- 用 browser 對 preview URL 截圖會抓到 web landing 而非 native 頁面，效果不真實
- 純 Remotion 動畫式廣告（你選的選項）視覺更一致、更像 agency 級宣傳片

如果你之後想要「app 畫面實錄」風格，我建議你自己錄一段 native app 的螢幕錄影傳給我，我再剪進 Remotion 影片裡，會比模擬截圖真實很多。

---

## 技術細節（給開發者）

- 在專案根目錄建立 `remotion/` 子專案，`bun init` + 安裝 `remotion @remotion/cli @remotion/renderer @remotion/bundler @remotion/transitions @remotion/google-fonts @remotion/compositor-linux-x64-musl`
- 修補 compositor binary（musl → gnu 目錄）並 symlink 系統 ffmpeg/ffprobe
- 5 個 scene 各自一個 `.tsx`，由 `MainVideo.tsx` 用 `<TransitionSeries>` 串接
- 用 `scripts/render-remotion.mjs` 走程式化渲染（`chromeMode: "chrome-for-testing"`、`muted: true`、`concurrency: 1`）
- 渲染完成後輸出 mp4 到 `/mnt/documents/`，並用 `<presentation-artifact>` 呈現給你下載

---

## 交付物

1. `/mnt/documents/runward-threads-posts.md` — 三版繁中 Threads 貼文
2. `/mnt/documents/runward-promo-9x16.mp4` — 18 秒直式 Remotion 宣傳片
3. `remotion/` 目錄留在專案中，方便你之後改文案重新渲染
