import { useState } from "react";
import {
  BookOpen, Activity, Dumbbell, Trophy, Users, BarChart3, Settings2,
  ChevronDown, Rocket, Crown,
} from "lucide-react";
import { Lang } from "@/lib/i18n";

interface HowToUseGuideProps {
  lang: Lang;
  /** "app" = compact in-app accordions; "web" = expanded website layout */
  variant?: "app" | "web";
}

type Item = {
  title: string;
  where: string;
  what: string;
  steps: string[];
  premium?: boolean;
};

type Group = {
  icon: typeof Activity;
  title: string;
  items: Item[];
};

const HowToUseGuide = ({ lang, variant = "app" }: HowToUseGuideProps) => {
  const zh = lang === "zh";
  const tx = (en: string, z: string) => (zh ? z : en);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);

  const quickStart: string[] = zh
    ? [
        "建立帳戶並登入（訪客模式可試用，但紀錄不會儲存）。",
        "點擊左上角頭像，再選擇「健身應用程式」，連接 Garmin、Coros、Suunto、Strava、Polar 或 Apple Health，跑步紀錄會自動同步。",
        "點擊左上角頭像，設定個人最佳成績與心率區間，分析結果會更準確。",
        "在「賽事」加入你的目標比賽，然後到「訓練」建立訓練計劃。",
        "在「社群」建立或加入跑班排行榜，與隊友比拚每月跑量。",
      ]
    : [
        "Create an account and sign in (guest mode works for a look around, but nothing is saved).",
        "Click the avatar image on the top left, then choose Fitness Apps and connect Garmin, Coros, Suunto, Strava, Polar or Apple Health so your runs sync automatically.",
        "Click the avatar image on the top left to set your personal bests and heart rate zones so the analysis fits you.",
        "Add your goal race in Races, then build a plan in Training.",
        "Create or join a group leaderboard in Community to compare monthly distance with friends.",
      ];

  const groups: Group[] = [
    {
      icon: Activity,
      title: tx("Activities", "活動"),
      items: [
        {
          title: tx("Automatic run sync", "自動同步跑步紀錄"),
          where: tx("Activities tab", "「活動」分頁"),
          what: tx(
            "Runs recorded by your watch or phone appear here by themselves, with distance, pace, time and heart rate.",
            "手錶或手機錄到的跑步會自動出現在這裡，包含距離、配速、時間與心率。"
          ),
          steps: [
            tx("Click the avatar image on the top left, then choose Fitness Apps to connect your device once.", "點擊左上角頭像，再選擇「健身應用程式」連接一次裝置。"),
            tx("Finish a run and let your watch app upload it as usual.", "跑完步後，讓手錶的原生 App 照常上傳紀錄。"),
            tx("Pull down on the Activities list to refresh if a run has not shown up yet.", "如果紀錄未出現，在活動列表下拉刷新即可。"),
          ],
        },
        {
          title: tx("Activity detail: map, splits and heart rate", "活動詳情：地圖、分段與心率"),
          where: tx("Activities tab → tap any run", "「活動」分頁 → 點擊任何一次跑步"),
          what: tx(
            "The full breakdown of one run: route map, every split with its own pace and average heart rate, heart rate zones, and pace / heart rate / elevation charts.",
            "單次跑步的完整分析：路線地圖、每個分段的配速與平均心率、心率區間，以及配速／心率／爬升圖表。"
          ),
          steps: [
            tx("Tap a run card to open it.", "點擊跑步卡片打開詳情。"),
            tx("Scroll through the map, splits list and charts.", "向下滑動查看地圖、分段列表與圖表。"),
            tx("Switch the split view between watch laps and 1 km splits.", "分段可切換手錶圈數或每公里分段。"),
          ],
        },
        {
          title: tx("Smart Segments (interval detection)", "智能分段（間歇偵測）"),
          where: tx("Activity detail → Smart Segments toggle", "活動詳情 → 「智能分段」開關"),
          what: tx(
            "For interval sessions, the app works out each hard rep from your pace data — even irregular ones like 5k-4k-3k-2k-1k — and shows the distance, time, pace and average heart rate of every rep.",
            "做間歇時，App 會從配速資料自動找出每組快跑（即使是 5k-4k-3k-2k-1k 這種不規則組合），顯示每組的距離、時間、配速與平均心率。"
          ),
          steps: [
            tx("Open an interval run.", "打開一次間歇跑。"),
            tx("Turn on Smart Segments — it only appears when reps are detected.", "打開「智能分段」——只有偵測到快跑組數時才會出現。"),
            tx("Read each rep row; rest and warm-up are excluded.", "逐行查看每組數據；熱身與休息不會計入。"),
          ],
        },
        {
          title: tx("Photos and share cards", "照片與分享卡"),
          where: tx("Activity detail → photos / share", "活動詳情 → 照片／分享"),
          what: tx(
            "Add up to six of your own photos to a run, then build a share card with your stats laid transparently over the picture — Garmin style.",
            "每次跑步可加入最多六張自己的照片，然後製作分享卡，把數據透明地疊在照片上（Garmin 風格）。"
          ),
          steps: [
            tx("Tap the photo area and pick pictures from your phone.", "點擊照片區，從手機選擇圖片。"),
            tx("Tap Share and choose the photo card.", "點擊分享，選擇照片卡。"),
            tx("Drag each block (stats, splits, charts, heart rate zones, route) to move it, and use the size slider to resize it.", "拖動每個區塊（數據、分段、圖表、心率區間、路線）調整位置，用大小滑桿調整尺寸。"),
            tx("Choose 400 m laps, 1 km splits or detected intervals when sharing splits.", "分享分段時可選 400 公尺、每公里或偵測到的間歇。"),
          ],
        },
        {
          title: tx("AI workout analysis (RPE & feelings)", "AI 訓練分析（RPE 與感受）"),
          where: tx("Activity detail → AI Workout Analysis", "活動詳情 →「AI 訓練分析」"),
          what: tx(
            "A premium AI breakdown of one run. For Apple Health, Garmin, Coros or Terra runs you first set an RPE (how hard it felt, 1-10); you can also tag a race and add a written comment about how the run felt, then run the analysis.",
            "付費版的 AI 單次跑步分析。Apple Health、Garmin、Coros 或 Terra 的紀錄需先填寫 RPE（體感強度 1-10）；亦可標記比賽並用文字寫下這次跑步的感受，然後執行分析。"
          ),
          steps: [
            tx("Open a running activity and scroll to the AI Workout Analysis card.", "打開一次跑步活動，向下滑到「AI 訓練分析」卡片。"),
            tx("If asked, set your RPE on the 1-10 slider or tap a quick option (Easy / A bit hard / Hard / Very hard).", "如出現提示，在 1-10 滑桿設定 RPE，或點擊快速選項（輕鬆／有點吃力／吃力／非常吃力）。"),
            tx("Optionally tag a race with 'Was this a race?' and type how the run felt in the comment box.", "可在「這是比賽嗎？」標記比賽，並在感受欄寫下這次跑步的感覺。"),
            tx("Tap Analyze to generate the analysis; tap Copy or Share to save or post it.", "點擊「分析」產生結果，再用「複製」或「分享」儲存或發佈。"),
          ],
          premium: true,
        },
        {
          title: tx("Monthly stats and Road Quest", "每月數據與每月挑戰"),
          where: tx("Activities tab (home cards)", "「活動」分頁（首頁卡片）"),
          what: tx(
            "A monthly summary card you can share, plus a monthly distance challenge to keep you moving.",
            "可分享的每月總結卡，以及每月里程挑戰，幫你保持動力。"
          ),
          steps: [
            tx("Scroll the Activities home screen to the monthly cards.", "在「活動」首頁向下滑到每月卡片。"),
            tx("Tap the share icon on the monthly card to post it.", "點擊每月卡片上的分享圖示即可發佈。"),
          ],
        },
        {
          title: tx("Export run files", "匯出跑步檔案"),
          where: tx("Activities tab → export button", "「活動」分頁 → 匯出按鈕"),
          what: tx("Download your runs as watch files in one batch.", "一次批量下載跑步紀錄的手錶檔案。"),
          steps: [
            tx("Tap the export button at the top of the Activities list.", "點擊活動列表上方的匯出按鈕。"),
            tx("Choose the date range and confirm.", "選擇日期範圍並確認。"),
          ],
          premium: true,
        },
      ],
    },
    {
      icon: Dumbbell,
      title: tx("Training", "訓練"),
      items: [
        {
          title: tx("Pace calculator", "配速計算機"),
          where: tx("Training tab → Paces", "「訓練」分頁 →「配速」"),
          what: tx(
            "Enter any distance and time to get your running level, equivalent results at other distances and your training paces.",
            "輸入任何距離與時間，得出你的跑力分數、其他距離的同等成績，以及各項訓練配速。"
          ),
          steps: [
            tx("Type a recent race or time trial result.", "輸入近期比賽或測試成績。"),
            tx("Read the equivalent times and suggested paces below.", "查看下方的同等成績與建議配速。"),
          ],
        },
        {
          title: tx("Free training plans", "免費訓練計劃"),
          where: tx("Training tab → Free", "「訓練」分頁 →「免費」"),
          what: tx(
            "Ready-made weekly plans shown on a calendar, so you can see what to run each day.",
            "已排好的逐週計劃，以日曆顯示，讓你清楚每日要跑什麼。"
          ),
          steps: [
            tx("Pick a plan that matches your goal.", "選擇符合目標的計劃。"),
            tx("Tap a day to see the workout details.", "點擊某一天查看課表詳情。"),
            tx("Share a week with friends from the share icon.", "用分享圖示把一週課表分享給朋友。"),
          ],
        },
        {
          title: tx("AI training plan", "AI 訓練計劃"),
          where: tx("Training tab → AI", "「訓練」分頁 →「AI」"),
          what: tx(
            "A plan built around your goal race, target time, weekly availability and current fitness — and it re-adjusts itself when you run more, less, or miss a session.",
            "根據你的目標賽事、目標時間、每週可跑日數與現時體能編排計劃；跑多了、跑少了或缺課，系統會自動微調之後的排程。"
          ),
          steps: [
            tx("Choose your race distance and target time.", "選擇比賽距離與目標時間。"),
            tx("Set how many days a week you can run.", "設定每週可跑日數。"),
            tx("Generate the plan, then follow the calendar week by week.", "產生計劃，然後按日曆逐週執行。"),
            tx("Edit any day if your schedule changes; past runs are never altered.", "行程有變可修改任何一天；已完成的紀錄不會被改動。"),
          ],
          premium: true,
        },
        {
          title: tx("Custom program", "自訂計劃"),
          where: tx("Training tab → Custom", "「訓練」分頁 →「自訂」"),
          what: tx("Build your own plan by placing workouts on the dates you choose.", "自己選日期安排課表，建立專屬計劃。"),
          steps: [
            tx("Set a start and end date.", "設定開始與結束日期。"),
            tx("Add workouts day by day and save.", "逐日新增課表並儲存。"),
          ],
        },
        {
          title: tx("Send workouts to your watch", "把課表傳到手錶"),
          where: tx("Training tab → plan calendar", "「訓練」分頁 → 計劃日曆"),
          what: tx("Push a planned workout to your connected watch so you can run it as a guided session.", "把計劃中的課表推送到已連接的手錶，直接照著跑。"),
          steps: [
            tx("Click the avatar image on the top left, then choose Fitness Apps to connect a supported watch.", "點擊左上角頭像，再選擇「健身應用程式」連接支援的手錶。"),
            tx("Open a workout day and tap the watch push button.", "打開課表日期，點擊推送到手錶的按鈕。"),
          ],
          premium: true,
        },
        {
          title: tx("Weekly review", "每週回顧"),
          where: tx("Training tab", "「訓練」分頁"),
          what: tx("A weekly summary of how your training went and what to change next week.", "每週訓練總結，並建議下週要調整的地方。"),
          steps: [tx("Open the weekly review card at the end of a training week.", "在訓練週結束時打開每週回顧卡片。")],
          premium: true,
        },
        {
          title: tx("Planned vs actual", "計劃對照實際"),
          where: tx("Training tab → plan calendar", "「訓練」分頁 → 計劃日曆"),
          what: tx("Each planned day shows what you actually ran beside it.", "每個計劃日期旁會顯示你實際跑了什麼。"),
          steps: [tx("Look at the calendar days — completed runs are matched to the plan automatically.", "查看日曆日期——已完成的跑步會自動配對到計劃。")],
        },
      ],
    },
    {
      icon: Trophy,
      title: tx("Races", "賽事"),
      items: [
        {
          title: tx("Race calendar", "賽事日曆"),
          where: tx("Races tab → Race Calendar", "「賽事」分頁 →「賽事日曆」"),
          what: tx("Search upcoming races by name, month, distance or country.", "以名稱、月份、距離或國家搜尋即將舉行的比賽。"),
          steps: [
            tx("Use the search box and filters to find a race.", "用搜尋框與篩選找出比賽。"),
            tx("Tap Import to add it to My Races.", "點擊匯入，加入「我的賽事」。"),
          ],
        },
        {
          title: tx("My Races", "我的賽事"),
          where: tx("Races tab → My Races", "「賽事」分頁 →「我的賽事」"),
          what: tx(
            "Your own race list with dates, priority (A/B/C) and finish times. Your target race also drives the training plan.",
            "你的比賽清單，包含日期、優先級（A／B／C）與完賽時間。目標賽事亦會用於編排訓練計劃。"
          ),
          steps: [
            tx("Add a race from the calendar or enter one manually.", "從日曆匯入，或手動新增比賽。"),
            tx("Mark it A, B or C depending on how important it is.", "按重要程度標記為 A、B 或 C。"),
            tx("Record your finish time after the race.", "比賽後填上完賽時間。"),
          ],
        },
        {
          title: tx("Race fuelling", "比賽補給"),
          where: tx("Races tab → Fueling", "「賽事」分頁 →「補給」"),
          what: tx("Work out how many carbs and how much fluid you need for a half or full marathon.", "計算半馬或全馬所需的碳水與水分攝取量。"),
          steps: [
            tx("Enter your weight and expected finish time.", "輸入體重與預計完賽時間。"),
            tx("Follow the gel and drink plan it produces.", "按產生的能量膠與飲水建議執行。"),
          ],
        },
      ],
    },
    {
      icon: Users,
      title: tx("Community", "社群"),
      items: [
        {
          title: tx("Group leaderboards", "群組排行榜"),
          where: tx("Community tab → Leaderboards", "「社群」分頁 →「排行榜」"),
          what: tx(
            "Compare monthly kilometres with your running friends. Groups are private — people join by invitation only.",
            "與跑友比拚每月公里數。群組為私人性質，只能透過邀請加入。"
          ),
          steps: [
            tx("Create a group and give it a name (the leader can rename it later).", "建立群組並命名（組長之後可改名）。"),
            tx("Share the 5-letter invite code — it copies straight to WhatsApp.", "分享 5 個字母的邀請碼——可直接複製到 WhatsApp。"),
            tx("Friends enter the code to join; the monthly ranking updates as runs sync.", "朋友輸入邀請碼即可加入；跑步同步後排名自動更新。"),
            tx("Turn notifications on or off per group so you get cheered on when a member finishes a run.", "可按群組開關通知，成員跑完時收到打氣提示。"),
          ],
        },
        {
          title: tx("Running feed", "跑步動態"),
          where: tx("Community tab → Social", "「社群」分頁 →「跑步動態」"),
          what: tx(
            "See runs from the public wall and from your groups, with distance, average pace and average heart rate. You can like and comment.",
            "查看公開牆及群組成員的跑步紀錄，顯示距離、平均配速與平均心率，可按讚和留言。"
          ),
          steps: [
            tx("Switch between Public and Friends at the top.", "在上方切換「公開」與「好友」。"),
            tx("Tap a run to see its full detail.", "點擊跑步紀錄查看完整詳情。"),
            tx("Sharing is off by default — click the avatar image on the top left, then open App Settings → Community Privacy to turn it on.", "分享預設關閉——點擊左上角頭像，再到「應用程式設定」→「社群私隱」開啟。"),
          ],
        },
        {
          title: tx("Group chat", "群組聊天"),
          where: tx("Community tab → Groups", "「社群」分頁 →「群組」"),
          what: tx("A private chat room inside each of your groups, with unread counts and push notifications.", "每個群組內的私人聊天室，顯示未讀數量並提供推送通知。"),
          steps: [
            tx("Open Groups and tap a group to enter its chat.", "打開「群組」，點擊群組進入聊天。"),
            tx("Type a message and send; members get a notification.", "輸入訊息並發送，成員會收到通知。"),
          ],
        },
        {
          title: tx("CityHunter", "城市獵人"),
          where: tx("Community tab → CityHunter", "「社群」分頁 →「城市獵人」"),
          what: tx("Run in different areas to fill in the map and unlock city progress.", "在不同區域跑步，逐步填滿地圖並解鎖城市進度。"),
          steps: [tx("Just keep running — your synced routes update the map automatically.", "持續跑步即可——已同步的路線會自動更新地圖。")],
        },
        {
          title: tx("Privacy controls", "私隱設定"),
          where: tx("Click the avatar image on the top left → App Settings → Community Privacy", "點擊左上角頭像 →「應用程式設定」→「社群私隱」"),
          what: tx(
            "Both the leaderboard and the public feed are opt-in and off by default. Turning public sharing off removes your runs from the public feed straight away.",
            "排行榜與公開動態都需自行選擇開啟，預設為關閉。關閉公開分享後，你的跑步紀錄會立即從公開動態移除。"
          ),
          steps: [
            tx("Open Community Privacy in App Settings.", "在「應用程式設定」打開「社群私隱」。"),
            tx("Turn each switch on only if you want to be visible.", "只在想被看見時才開啟相應開關。"),
          ],
        },
      ],
    },
    {
      icon: BarChart3,
      title: tx("Analytics", "分析"),
      items: [
        {
          title: tx("Performance dashboard", "表現總覽"),
          where: tx("Analytics tab → Performance", "「分析」分頁 →「表現」"),
          what: tx(
            "Your training load, weekly heart rate zones, year heatmap, health stats, readiness and trends — all free.",
            "訓練負荷、每週心率區間、年度熱圖、健康數據、身體準備度與趨勢——全部免費。"
          ),
          steps: [
            tx("Long-press a card to reorder your dashboard.", "長按卡片可重新排列版面。"),
            tx("Use Customize to choose which cards appear.", "用「自訂」選擇顯示哪些卡片。"),
          ],
        },
        {
          title: tx("Race time predictor", "比賽時間預測"),
          where: tx("Analytics tab → Performance", "「分析」分頁 →「表現」"),
          what: tx(
            "Predicts your finish time from your actual running data. The free version covers 5K; premium unlocks 10K, half and full marathon.",
            "根據實際跑步數據預測完賽時間。免費版提供 5 公里；付費版解鎖 10 公里、半馬與全馬。"
          ),
          steps: [
            tx("Keep syncing runs — accuracy improves with more data.", "持續同步跑步紀錄——資料越多越準確。"),
            tx("Read the predicted time and use it to set your goal pace.", "查看預測時間，用來設定目標配速。"),
          ],
        },
        {
          title: tx("Running form analysis", "跑姿分析"),
          where: tx("Analytics tab → Posture", "「分析」分頁 →「跑姿」"),
          what: tx(
            "Upload a video of yourself running and get scores plus suggestions for head, shoulders, arms, torso and legs. Free: once a day. Premium: unlimited.",
            "上傳自己跑步的影片，獲得頭部、肩膊、手臂、軀幹與下肢的評分及建議。免費：每日一次；付費：無限次。"
          ),
          steps: [
            tx("Film 10-20 seconds from the side, with your whole body in frame.", "從側面拍攝 10-20 秒，確保全身入鏡。"),
            tx("Upload the video and wait for the analysis.", "上傳影片並等待分析結果。"),
            tx("Work on the improvement points one at a time.", "逐項改善建議的重點。"),
          ],
        },
      ],
    },
    {
      icon: Settings2,
      title: tx("Profile & settings", "個人頁面與設定"),
      items: [
        {
          title: tx("Connect fitness apps", "連接健身應用程式"),
          where: tx("Click the avatar image on the top left → Fitness Apps", "點擊左上角頭像 →「健身應用程式」"),
          what: tx("Link Garmin, Coros, Suunto, Strava, Polar or Apple Health to sync runs, sleep, heart rate variability and daily readiness.", "連接 Garmin、Coros、Suunto、Strava、Polar 或 Apple Health，同步跑步、睡眠、心率變異與每日準備度。"),
          steps: [
            tx("Tap Fitness Apps and pick your brand.", "點擊「健身應用程式」，選擇你的品牌。"),
            tx("Sign in to that service and approve access.", "登入該服務並允許授權。"),
            tx("Wait a few minutes for the first sync to finish.", "等待幾分鐘完成首次同步。"),
          ],
        },
        {
          title: tx("Communication apps", "通訊應用程式"),
          where: tx("Click the avatar image on the top left → Communication Apps", "點擊左上角頭像 →「通訊應用程式」"),
          what: tx("Get your training reminders and summaries on WhatsApp or Telegram.", "透過 WhatsApp 或 Telegram 接收訓練提醒與總結。"),
          steps: [
            tx("Tap Communication Apps and choose WhatsApp or Telegram.", "點擊「通訊應用程式」，選擇 WhatsApp 或 Telegram。"),
            tx("Follow the connect steps and confirm the test message.", "按指示連接，並確認測試訊息。"),
          ],
        },
        {
          title: tx("Personal bests", "個人最佳成績"),
          where: tx("Click the avatar image on the top left (below Premium)", "點擊左上角頭像（付費版下方）"),
          what: tx("Your best times per distance, used across predictions and pace suggestions.", "各距離的最佳成績，用於預測與配速建議。"),
          steps: [
            tx("Tap the edit icon on the personal bests card.", "點擊個人最佳成績卡上的編輯圖示。"),
            tx("Enter or correct a time and save.", "輸入或修正時間後儲存。"),
          ],
        },
        {
          title: tx("Heart rate zones", "心率區間"),
          where: tx("Click the avatar image on the top left (below personal bests)", "點擊左上角頭像（個人最佳成績下方）"),
          what: tx("Your five training zones, used in activity detail and weekly zone charts.", "五個訓練區間，用於活動詳情與每週區間圖表。"),
          steps: [
            tx("Tap edit on the heart rate zones card.", "點擊心率區間卡上的編輯。"),
            tx("Adjust the boundaries to match your max or threshold heart rate and save.", "按你的最大或閾值心率調整區間界線並儲存。"),
          ],
        },
        {
          title: tx("Running guides", "跑步指南"),
          where: tx("Click the avatar image on the top left → Running Guides", "點擊左上角頭像 →「跑步指南」"),
          what: tx("Plain-language explanations of training terms, how to start long distance running, and a fuelling guide.", "以淺白文字解釋訓練術語、如何開始長距離跑步，以及補給指南。"),
          steps: [tx("Open Running Guides and tap any topic to expand it.", "打開「跑步指南」，點擊任何主題展開閱讀。")],
        },
        {
          title: tx("AI running coach", "AI 跑步教練"),
          where: tx("Floating chat button, any screen", "任何畫面上的懸浮聊天按鈕"),
          what: tx("Ask any running question and get answers based on your own training history.", "詢問任何跑步問題，並根據你的訓練紀錄獲得解答。"),
          steps: [
            tx("Tap the chat button and type your question.", "點擊聊天按鈕並輸入問題。"),
            tx("Click the avatar image on the top left, then open App Settings to hide the button.", "點擊左上角頭像，再到「應用程式設定」隱藏此按鈕。"),
          ],
          premium: true,
        },
        {
          title: tx("App settings", "應用程式設定"),
          where: tx("Click the avatar image on the top left → App Settings", "點擊左上角頭像 →「應用程式設定」"),
          what: tx(
            "Dark mode, language (English / 中文), text size, activity notifications, community privacy, privacy policy and account deletion.",
            "深色模式、語言（English／中文）、文字大小、活動推送通知、社群私隱、隱私政策與刪除帳號。"
          ),
          steps: [tx("Open App Settings and switch any option on or off.", "打開「應用程式設定」，開啟或關閉任何選項。")],
        },
        {
          title: tx("Premium and offer codes", "付費版與優惠代碼"),
          where: tx("Click the avatar image on the top left → Runward Premium", "點擊左上角頭像 → Runward Premium"),
          what: tx(
            "See your subscription status, upgrade, or redeem an offer code from a race or partner.",
            "查看訂閱狀態、升級，或兌換比賽及合作夥伴提供的優惠代碼。"
          ),
          steps: [
            tx("Tap the Premium card to see what is included.", "點擊 Premium 卡片查看內容。"),
            tx("To use a code, open App Settings → Redeem Offer Code and enter it.", "使用代碼：打開「應用程式設定」→「兌換優惠代碼」並輸入。"),
          ],
        },
      ],
    },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <BookOpen size={16} className="text-primary" />
          {tx("How to use Runward", "如何使用 Runward")}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {tx(
            "A guide to every feature, grouped by where you find it in the app.",
            "按功能在 App 中的位置分類，逐項說明使用方法。"
          )}
        </p>
      </div>

      {/* Quick start */}
      <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Rocket size={14} className="text-primary" />
          {tx("Quick start (5 steps)", "快速開始（5 步）")}
        </h3>
        <ol className="mt-2 space-y-1.5">
          {quickStart.map((s, i) => (
            <li key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
              <span className="shrink-0 w-4 h-4 mt-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Feature groups */}
      <div className="space-y-2">
        {groups.map(({ icon: Icon, title, items }) => {
          const groupOpen = openGroup === title;
          return (
            <div key={title} className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setOpenGroup(groupOpen ? null : title)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/50"
              >
                <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-primary" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {items.length} {tx("features", "項功能")}
                  </p>
                </div>
                <ChevronDown
                  size={16}
                  className={`text-muted-foreground shrink-0 transition-transform ${groupOpen ? "rotate-180" : ""}`}
                />
              </button>

              {groupOpen && (
                <div className="border-t border-border/60 bg-background/40 divide-y divide-border/50">
                  {items.map((item) => {
                    const key = `${title}-${item.title}`;
                    const itemOpen = openItem === key;
                    return (
                      <div key={key}>
                        <button
                          onClick={() => setOpenItem(itemOpen ? null : key)}
                          className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-accent/40"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground flex items-center gap-1.5 flex-wrap">
                              {item.title}
                              {item.premium && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-full px-1.5 py-0.5">
                                  <Crown size={9} />
                                  {tx("Premium", "付費版")}
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{item.where}</p>
                          </div>
                          <ChevronDown
                            size={14}
                            className={`text-muted-foreground shrink-0 mt-1 transition-transform ${itemOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                        {itemOpen && (
                          <div className="px-3 pb-3 space-y-2">
                            <p className="text-xs text-foreground leading-relaxed">{item.what}</p>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-primary mb-1">
                                {tx("How to use", "使用步驟")}
                              </p>
                              <ol className="space-y-1">
                                {item.steps.map((s, i) => (
                                  <li key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                                    <span className="text-primary/70 font-medium shrink-0">{i + 1}.</span>
                                    <span>{s}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HowToUseGuide;
