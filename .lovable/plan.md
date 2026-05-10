## 目標

製作一支 30-60 秒、繁體中文、9:16 直式宣傳影片，**畫面是 Runward app 內真實功能的截圖序列**（不再是純動畫），讓觀眾一看就知道 app 在做什麼。

---

## 整體流程

1. **登入 + 切換到中文**：用 browser 工具開 preview，登入 `admin@dinhaylo.com`，把 app 語言切到繁中。
2. **建立 dummy 數據**：
   - 用 SQL migration 為這個 admin user 插入 1-2 筆 dummy 跑步活動（含距離、配速、心率、GPS 路線、HR zones），讓 Activities / Analytics / AI 分析等畫面有東西可看。
   - **跑姿分析**：上傳一段示範跑步影片（會用 `videogen--generate_video` 生一段 5 秒側面跑步影片當作 dummy 影片），透過 app 的上傳流程觸發 `analyze-posture` edge function，拿到真實雷達圖/分數結果。
3. **逐功能截圖**（用 browser 工具，9:16 mobile viewport 390x844）：
   - 啟動畫面 / Landing
   - Activities Tab：活動列表、活動詳情（地圖 + 心率 + 配速）、AI 分析結果
   - Analytics Tab：Performance（訓練負荷、年熱力圖、HR zones、Race predictor、Trends）、Posture（雷達圖 + 強弱項）
   - Training / Programs Tab：個人化訓練計畫
   - AI Coach：浮動聊天按鈕 + 對話 modal
   - Rewards Tab：每日簽到、排行榜、領土地圖、戰利品
   - Community Tab
   - More Tab：個人檔案、心率區間設定（含 RHR 說明）
   每個畫面截 1-2 張，總共約 15-20 張。
4. **組裝成 Remotion 影片**：
   - 把所有截圖放到 `remotion/public/captures/`
   - 重新設計 `MainVideo.tsx`：每個 scene = 1 張手機截圖 + 旁邊浮現繁中 caption（功能名稱 + 一句話說明）+ 高亮框/箭頭指出重點 UI
   - 直式 1080x1920、30fps、約 45 秒（1350 frames）
   - 開頭 3 秒品牌 hook、結尾 3 秒 logo + 「立即下載 runward.app」
   - 場景間用快切 + slide 轉場，配合 spring 動畫，保持 kinetic energy 風格

---

## 已知限制（請先看）

- **Sandbox 無法錄真實螢幕影片**，所以做法是「真實截圖 + Remotion 動畫排版」，不是 native app 螢幕錄影。如果要真正的螢幕錄影，需要你自己用手機錄一段傳給我，我再剪進去。
- **跑姿分析需要真實影片才能跑 AI**：我會用 `videogen` 生一段示範跑步側面影片，但 AI 給出的分數會基於這段生成影片，不是真人跑姿，僅作為「畫面有東西」的展示用途。
- **建立的 dummy 活動會留在 admin@dinhaylo.com 帳號下**，做完後我可以再用 SQL 清掉，請告訴我要不要清。
- **影片總長度約 45 秒**：要塞滿你列的所有功能（Activities、Analytics、Posture、Training、Programs、AI Coach、Rewards、Community、More），每個功能大約只有 3-4 秒。如果想每個功能講更深入，會超過 1 分鐘，請告訴我偏好。
- **渲染時間**：Remotion render 在 sandbox 上限是 10 分鐘，45 秒 9:16 影片大約需 5-8 分鐘渲染。

---

## 交付物

1. `/mnt/documents/runward-app-demo-9x16.mp4`（同時複製到 `public/` 方便下載）
2. 截圖原檔保留在 `remotion/public/captures/`，方便你之後想替換或加新功能
3. 更新後的 `remotion/src/MainVideo.tsx` 與場景檔，方便重新渲染

---

## 技術細節（給開發者）

- 透過 `browser--navigate_to_sandbox` + `set_viewport_size(390, 844)` 模擬 iPhone 直式
- 登入後用 `act` 點 More → 語言切換成繁中
- 用 SQL migration insert dummy `activities` + 對應 `activity_streams`（HR、pace、GPS）
- Posture：用 `videogen--generate_video` 生 5s 側面跑步動畫 → 透過 app 的 PostureTab 上傳介面 act → 等 `analyze-posture` 回傳 → 截圖結果
- 截圖透過 `browser--screenshot` 取得 PNG，存到 `/tmp/` 後 `code--copy` 進 `remotion/public/captures/`
- Remotion 用 `<Img src={staticFile('captures/xxx.png')} />` 加 spring 進場 + 文字疊層
- 用既有 `scripts/render-remotion.mjs` 程式化渲染
