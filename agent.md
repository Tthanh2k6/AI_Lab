# Cẩm nang Vận hành, Bảo vệ Bất biến & Đồng bộ Tài liệu — `agent.md` (`AI_Lab`)

> **Đối tượng áp dụng**: Mọi AI Coding Agent và Lập trình viên làm việc trên kho mã nguồn `AI_Lab` (`d:\Project\AI_Lab`).
> **Tài liệu song hành bắt buộc**: [`CODEBASE.md`](./CODEBASE.md) (Bản giải phẫu kiến trúc & mã nguồn chi tiết toàn dự án), cùng hai tài liệu giới thiệu gốc [`README.md`](./README.md) và [`android/README.md`](./android/README.md).

---

## 1. Mục đích & Nguyên tắc Hoạt động

`AI_Lab` là một kho mã nguồn đa nền tảng gồm **hai hệ thống độc lập nhưng cùng triết lý kỹ thuật**:
1. **Hệ thống 1 — `AI Game Arena` (Web SPA & Desktop Electron — thư mục gốc & `src/`)**: Phòng thí nghiệm trực quan hóa 9 thuật toán AI/RL/Neuroevolution/Game-Tree 2D & 3D viết bằng `React 19`, `TypeScript`, `Three.js`, `Canvas 2D` và `Web Worker`.
2. **Hệ thống 2 — `AI Arena Agent` (Android Auto-Play Agent — thư mục `android/`)**: Tác nhân đọc màn hình điện thoại thời gian thực qua `MediaProjection`, xử lý thị giác máy tính & điều khiển dự đoán có bù trễ trong module `:core` (Kotlin JVM thuần) và phát thao tác chạm qua `TapAccessibilityService` cho game **Flappy Bird** và **Mr Gun**.

### Cách sử dụng cặp tài liệu `agent.md` + `CODEBASE.md` ở bất kỳ phiên làm việc mới nào:
- **Không bao giờ đoán mò hoặc quét mù toàn bộ dự án từ con số 0**: Luôn đọc `agent.md` đầu tiên để nắm quy tắc bảo vệ bất biến và tra **Bảng Định tuyến Nhanh (Mục 2.2)** để xác định đúng phân hệ, đúng mục trong `CODEBASE.md` và đúng tệp mã nguồn cần mở.
- **Đọc kỹ mã nguồn thực tế trước khi sửa**: Sau khi nắm kiến trúc qua `CODEBASE.md`, luôn mở đọc trực tiếp các tệp nguồn liên quan để kiểm tra ngữ cảnh dòng lệnh hiện tại trước khi thực hiện chỉnh sửa.
- **Bảo toàn tài liệu gốc**: Không tự ý ghi đè `README.md` hoặc `android/README.md` trừ khi người dùng yêu cầu trực tiếp.
- **Đồng bộ tức thời**: `CODEBASE.md` và `agent.md` là "nguồn sự thật sống" (living source of truth). Mọi thay đổi mã nguồn đều phải được phản ánh ngay vào tài liệu trong cùng phiên làm việc theo **Mục 4**.

---

## 2. Quy trình BẮT BUỘC Trước Khi Sửa Code (Read-First Protocol)

### 2.1 Năm Bước Đọc Ngữ cảnh Chuẩn

Trước khi viết hoặc sửa bất kỳ dòng code nào, thực hiện tuần tự 5 bước sau:
1. **Bước 1 — Phân định phạm vi hệ thống**: Xác định yêu cầu thuộc **Hệ thống 1 (`Web / Electron` trong `src/`, `main.cjs`)** hay **Hệ thống 2 (`Android :app` / `Kotlin JVM :core` trong `android/`)**, hay cả hai.
2. **Bước 2 — Tra Bảng Định tuyến Nhanh (Mục 2.2 bên dưới)**: Tìm đúng mảng chức năng để biết chính xác mục nào trong `CODEBASE.md` cần đọc và danh sách đầy đủ các tệp nguồn có liên kết phụ thuộc.
3. **Bước 3 — Kiểm tra các Bất biến Kỹ thuật (Mục 3 bên dưới & Mục 8 của `CODEBASE.md`)**: Rà soát các ràng buộc ngầm cực kỳ dễ gây lỗi hồi quy (như cấp phát `IntArray` mới mỗi khung trên Android, hạt giống Zobrist của Caro, khóa lái 20 khung đầu của xe đua, hay quy ước trục 3D `(x, z, y)`).
4. **Bước 4 — Đọc trực tiếp tệp mã nguồn mục tiêu**: Đọc đầy đủ hàm/lớp định sửa và các nơi gọi nó (`callers`), chú ý chữ ký kiểu dữ liệu trong `src/types/game.ts` (với Web) hoặc `GameAgent.kt` / `Observation.kt` / `MrGunDetector.kt` (với Android).
5. **Bước 5 — Lập kế hoạch kiểm chứng**: Xác định lệnh kiểm tra kiểu/test tương ứng ở **Mục 5** sẽ chạy ngay sau khi sửa xong.

---

### 2.2 Bảng Định tuyến Nhanh (Quick Routing Table)

| Khi cần làm việc với mảng chức năng... | Đọc mục nào trong `CODEBASE.md` | Mở đọc những tệp mã nguồn nào |
| :--- | :--- | :--- |
| **1. Điều hướng màn hình Web hoặc Thêm trò chơi thứ 10 vào `AI Game Arena`** | Mục `2.1`, `2.4`, `4.1`, `4.11`, `6.1` | `src/types/game.ts`, `src/App.tsx`, `src/components/SelectGameScreen.tsx`, `src/components/SetupScreen.tsx` |
| **2. Giao diện chung Cyber-Lab, bảng màu, thanh trượt, hiệu ứng kính mờ** | Mục `6.2`, `8.1` (Mục 14) | `src/index.css`, `index.html` |
| **3. Ứng dụng Desktop Electron, bộ cài `.exe` NSIS hoặc cấu hình Vite / Vercel** | Mục `1.2`, `4.1`, `7.3`, `8.1` (Mục 13), `8.3` | `main.cjs`, `package.json`, `vite.config.ts`, `vercel.json`, `run.bat` |
| **4. Cờ Caro 20×20: Luật thắng, hàm đánh giá mẫu hình, Minimax Alpha-Beta, MCTS** | Mục `2.2.A`, `4.2` | `src/utils/zobrist.ts`, `src/utils/evaluator.ts`, `src/utils/minimax.ts`, `src/utils/mcts.ts` |
| **5. Cờ Caro: Đa luồng Web Worker, tiến hóa trọng số, Xuất/Nhập JSON & UI bàn cờ** | Mục `2.2.A`, `4.2`, `5.2.1`, `5.3` | `src/workers/ai.worker.ts`, `src/hooks/useAIWorker.ts`, `src/utils/trainer.ts`, `src/components/TrainingScreen.tsx`, `src/components/SetupScreen.tsx` |
| **6. Đua xe AI (`AI Racing`): Mạng nơ-ron, cảm biến tia, vật lý 2 pha & nâng cấp tốc độ** | Mục `2.4` (Luồng 4), `4.8`, `8.1` (Mục 9) | `src/utils/racingPhysics.ts`, `src/components/RacingScreen.tsx`, `src/components/SetupScreen.tsx` |
| **7. Đua xe AI: Sinh đường đua thủ tục theo Seed/Biome hoặc Trình vẽ `TrackBuilder`** | Mục `4.8`, `5.2.2`, `8.1` (Mục 9) | `src/utils/trackGen.ts`, `src/components/TrackBuilder.tsx`, `src/utils/racingPhysics.ts` |
| **8. Flappy Bird trên Web (Neuroevolution `[4, 6, 1]` & chế độ người chơi bay cùng)** | Mục `2.4` (Luồng 5), `4.6` | `src/utils/flappy.ts`, `src/components/FlappyScreen.tsx`, `src/assets/FlappyBird.png` |
| **9. Trò chơi 2048 (Thuật toán Expectimax & hoạt ảnh gạch trượt 2 pha)** | Mục `2.4` (Luồng 6), `4.3` | `src/utils/game2048.ts`, `src/components/Board2048.tsx`, `src/components/Game2048Screen.tsx`, `src/components/Game2048Preview.tsx` |
| **10. Trò chơi Connect Four (Minimax 69 cửa sổ & hoạt ảnh thả đĩa Canvas)** | Mục `2.4` (Luồng 7), `4.4` | `src/utils/connect4.ts`, `src/utils/renderConnect4.ts`, `src/components/Connect4Screen.tsx`, `src/components/Connect4Preview.tsx` |
| **11. Mê cung Q-Learning (`Q-Maze`: sinh mê cung BFS, bảng `Q` & bản đồ nhiệt)** | Mục `2.4` (Luồng 7), `4.5` | `src/utils/qmaze.ts`, `src/utils/renderQMaze.ts`, `src/components/QMazeScreen.tsx`, `src/components/QMazePreview.tsx` |
| **12. Bóng đá 3D V2 (`Soccer 3D`: vật lý khung thành nghiêng, đối xứng gương, nổ 64 mảnh)** | Mục `2.4` (Luồng 8), `4.9`, `8.1` (Mục 10, 11) | `src/utils/soccer2.ts`, `src/utils/renderSoccer2.ts`, `src/components/Soccer2Screen.tsx`, `src/components/SoccerPreview.tsx` |
| **13. Đuổi bắt 3D (`Tag 3D` KAI vs ALBERT: 6 phòng, kéo hộp, đồng tiến hóa ngầm `2×26`)** | Mục `2.4` (Luồng 8), `4.10`, `8.1` (Mục 10, 12) | `src/utils/tagGame.ts`, `src/utils/renderTag.ts`, `src/components/TagScreen.tsx` |
| **14. Chiến tranh Ô (`Cell War`: 5 chiến lược AI, khuếch tán quân & `ImageData`)** | Mục `2.4` (Luồng 7), `4.7` | `src/utils/cellwar.ts`, `src/components/CellWarScreen.tsx` |
| **15. Ứng dụng Android `:app` (Giao diện quyền, chụp `MediaProjection`, Trợ năng tap)** | Mục `2.2.B`, `4.12`, `5.1`, `5.4`, `6.3`, `8.1` (Mục 2–4) | `android/app/src/main/AndroidManifest.xml`, `MainActivity.kt`, `AgentService.kt`, `AgentStatus.kt`, `TapAccessibilityService.kt`, `activity_main.xml`, `strings.xml` |
| **16. Tác nhân Android Flappy Bird `:core` (Nhận diện tổng quát, đo vật lý, điều khiển 3 quỹ đạo)** | Mục `4.13`, `4.14`, `8.1` (Mục 1) | `Frame.kt`, `Observation.kt`, `ScrollEstimator.kt`, `FlappyDetector.kt`, `RunningMedian.kt`, `PhysicsEstimator.kt`, `FlapController.kt`, `FlappyAgent.kt`, `GameAgent.kt` |
| **17. Tác nhân Android Mr Gun `:core` (Nền 24 dải, đầu trắng, tâm xoay, quét góc, ngắm bắn, menu)** | Mục `4.15`, `8.1` (Mục 1, 5, 6) | `MrGunDetector.kt`, `AimController.kt`, `MrGunAgent.kt`, `GameAgent.kt` |
| **18. Kiểm thử & Mô phỏng đa skin Android `:core:test` hoặc Thêm game thứ 3 trên Android** | Mục `4.14`, `4.16`, `7.2`, `7.3.B` | `GameAgent.kt`, `FlappySim.kt`, `MrGunSim.kt`, `ClosedLoopTest.kt`, `DetectorTest.kt`, `PhysicsTest.kt`, `MrGunTest.kt`, `MrGunRealFramesTest.kt`, `MrGunSimDiagTest.kt` |

---

## 3. Các Bất biến Kỹ thuật & Quy tắc An toàn Riêng của Dự án (Project-Specific Guardrails)

### 3.1 Quy tắc Sống còn cho Hệ thống Android (`android/`)
1. **CẤM TUYỆT ĐỐI `import android.*` trong module `android/core/`**:
   - Module `:core` phải biên dịch và chạy toàn bộ JUnit tests trên JVM chuẩn mà không cần Android SDK runtime hay thiết bị thật. Mọi tương tác với `MediaProjection`, `Bitmap`, `AccessibilityService`, `Log`, `SystemClock` chỉ được phép nằm trong `android/app/`.
2. **BẮT BUỘC cấp phát `IntArray(w * h)` mới cho mỗi khung hình trong `AgentService.onImage()`**:
   - `FlappyDetector` và `MrGunDetector` lưu `prev = frame` để tính sai phân chuyển động giữa hai khung liên tiếp. Tuyệt đối không tối ưu hóa sai lầm bằng cách dùng lại chung một mảng `rgb` giữa các khung hình — làm vậy sẽ khiến `cur.rgb === prev.rgb` và làm mù hoàn toàn bộ phát hiện chuyển động.
3. **BẮT BUỘC tuân thủ trình tự khởi tạo `MediaProjection` của Android 14+ (`API 34+`)**:
   - Phải gọi `startForeground(NOTIF_ID, ..., FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)` **trước** `getMediaProjection(code, data)`.
   - Phải gắn `reader.setOnImageAvailableListener(...)` **trước** `mp.createVirtualDisplay(...)` và giữ nguyên `watchdog` `500 ms` để tránh kẹt hàng đợi `ImageReader` 3 bộ đệm.
   - Luôn ép chẵn `captureW` và `captureH` bằng `and 1.inv()`, và luôn bọc `img.close()` trong khối `finally`.
4. **CẤM chạm mù (blind tap) ngoài trận đấu trong `MrGunAgent` / `MrGunDetector`**:
   - Trên màn thua của Mr Gun, vùng giữa màn hình (`~55–66%` chiều cao) là banner quảng cáo dẫn ra Play Store. Mọi cú chạm menu bắt buộc phải được xác thực hình học qua `findMenu()` (`isFramedSquare`) và đứng yên `stableFrames >= 6` khung liên tiếp (`<= 4 px`).
5. **Bảo toàn quy ước góc và không làm yếu các ngưỡng `assertTrue` trong `:core:test`**:
   - Trong `MrGunDetector`, trục `y` màn hình hướng xuống nên góc `0°` = phải, `90°` = lên trên (`y = pivotY - r * sin(a)`).
   - Mọi thay đổi trong `FlappyDetector`, `MrGunDetector`, `FlapController`, `AimController` đều phải vượt qua toàn bộ kiểm thử mô phỏng đa skin (`ClosedLoopTest`, `DetectorTest`, `PhysicsTest`, `MrGunTest`) và bộ ảnh thật (`MrGunRealFramesTest`) mà **không được hạ thấp ngưỡng điểm số/tỷ lệ chính xác** trong các bài test nghiệm thu.
   - Khi chạy test có truyền biến môi trường `MRGUN_*`, luôn thêm cờ `--rerun` vào lệnh `gradlew.bat :core:test`.

### 3.2 Quy tắc Sống còn cho Hệ thống Web & Electron (`src/` & gốc)
6. **Đồng bộ Hạt giống Zobrist (`src/utils/zobrist.ts`) & Đồng bộ `requestSeq` (`src/hooks/useAIWorker.ts`)**:
   - Giữ nguyên PRNG tất định `mulberry32(0x5a0b21d7)` trong `zobrist.ts` để luồng giao diện và `ai.worker.ts` luôn tính ra cùng một mã băm 32-bit.
   - Khi hủy hoặc tạo ván Caro mới, luôn đi qua `cancelPending()` / `requestSeq` và bắt riêng `SearchCancelledError`; nhớ giới hạn kích thước `transpositionTable` (`MAX_TT_SIZE = 200_000`).
7. **Đồng bộ Khóa lái 20 tick đầu của Xe đua (`racingPhysics.ts`) với Đường băng Xuất phát (`trackGen.ts`)**:
   - `CarInstance` ép `steering = 0` khi `timeAlive < 20`. Bất kỳ đường đua mẫu hoặc thuật toán sinh đường đua nào cũng phải đảm bảo đoạn thẳng xuất phát dài tối thiểu `>= 300 px` không có tường chắn trước mũi xe.
8. **Quy ước Hoán vị Trục 3D & Đối xứng Gương (`soccer2.ts`, `tagGame.ts` ↔ `render*.ts`)**:
   - Trong vật lý (`soccer2.ts`, `tagGame.ts`), `z` là độ cao thẳng đứng; khi sang `Three.js` (`renderSoccer2.ts`, `renderTag.ts`), luôn ánh xạ `(x, z, y)`.
   - Trong `soccer2.ts`, giữ nguyên phép lật gương `mirror = p.team === 'blue' ? -1 : 1` cho cả đầu vào lẫn đầu ra mạng.
   - Trong `tagGame.ts`, luôn giữ bài đấu đánh giá bắt buộc với bot luật cứng (`'chase'` / `'flee'`) bên cạnh trận đấu với `bestBrain` để chống suy thoái đồng tiến hóa, và giải phóng tài nguyên WebGL (`renderer.dispose()`) khi unmount màn hình 3D.
9. **Tương thích Đóng gói Electron & CSS Overrides**:
   - Giữ `base: './'` trong `vite.config.ts` để Electron đóng gói đọc được tài nguyên tĩnh qua `file://`.
   - Luôn chạy `npx tsc -b` trước `npm run electron:build` (vì script `electron:build` chỉ gọi `vite build && electron-builder`).
   - Khi chỉnh sửa màu sắc Tailwind, kiểm tra các quy tắc ghi đè không bọc `@layer` ở cuối `src/index.css` (ánh xạ `purple`/`violet` sang `#3b82f6`).

### 3.3 Quy tắc Môi trường Windows, Encoding UTF-8 & Quản lý Tệp
10. **UTF-8 Tiếng Việt & Git Line Endings**:
    - Mọi chuỗi giao diện của dự án đều dùng tiếng Việt có dấu chuẩn UTF-8; trên Windows PowerShell khi chạy script Python xử lý văn bản, luôn dùng `python -X utf8 -c "..."`.
    - Không phá vỡ quy tắc `eol=lf` trong `.gitattributes` đối với `android/gradlew` và `*.sh`.
    - Không đưa `android/local.properties` hoặc thư mục dữ liệu cá nhân `.claude/` vào Git commit.

---

## 4. Quy trình BẮT BUỘC Cập nhật Tài liệu Sau Mỗi Lần Sửa Code (Post-Edit Sync Protocol)

> **QUY TẮC TỐI THƯỢNG**: Mọi thay đổi mã nguồn, cấu hình, giao diện hoặc kiểm thử đều **PHẢI** đi kèm việc cập nhật tương ứng vào `CODEBASE.md` (và `agent.md` nếu thay đổi kiến trúc, thêm phân hệ mới hoặc thêm quy tắc bất biến) **ngay trong cùng một phiên làm việc, trước khi báo cáo hoàn thành cho người dùng**. Không bao giờ để tài liệu lệch pha so với code thực tế!

### 4.1 Ma trận Đồng bộ Tài liệu (Documentation Sync Matrix)

| Loại thay đổi thực hiện trong dự án | Các mục PHẢI cập nhật trong `CODEBASE.md` | Các mục PHẢI cập nhật trong `agent.md` |
| :--- | :--- | :--- |
| **1. Thêm, xóa hoặc đổi tên tệp / thư mục bất kỳ** | **Mục 3.1** (Cây thư mục), **Mục 3.2** (Bảng kê khai tệp & số dòng), **Mục 4** (Phân tích chi tiết tệp mới / xóa mục tệp cũ), **Mục 9** | **Mục 2.2** (Bảng Định tuyến Nhanh — cập nhật đường dẫn tệp) |
| **2. Thêm trò chơi mô phỏng mới trên Web (`GameId` mới) hoặc game mới trên Android (`GameKind` mới)** | **Mục 1.1** (Danh sách mô phỏng/game), **Mục 2.1** (Sơ đồ kiến trúc), **Mục 2.4** (Luồng nghiệp vụ mới), **Mục 3**, **Mục 4** (Thêm tiểu mục phân tích sâu toàn bộ module mới), **Mục 6.1** (Sơ đồ màn hình), **Mục 9** | **Mục 1**, **Mục 2.2** (Thêm dòng định tuyến mới cho game đó), **Mục 3** (Nếu có bất biến vật lý/thị giác mới) |
| **3. Sửa đổi hàm, thuật toán, hằng số vật lý, kiến trúc mạng nơ-ron (`NET_SHAPE`), trọng số `DEFAULT_WEIGHTS` hoặc `Params` của Detector/Controller** | **Mục 4** (Cập nhật chính xác chữ ký hàm, công thức toán học, kích thước mạng và giá trị hằng số mới tại tiểu mục của tệp đó) & **Mục 3.2** (Cập nhật số dòng nếu thay đổi đáng kể), **Mục 9** | **Mục 3** (Nếu hằng số/thuật toán mới tạo ra ràng buộc an toàn mới giữa các module) |
| **4. Thay đổi định dạng JSON xuất/nhập, khóa `SharedPreferences`, `AgentStatus`, thông điệp `WorkerRequest`/`WorkerResponse` hoặc Android `Intent`** | **Mục 2.2** (Sequence Diagram nếu đổi luồng bản tin), **Mục 5.1 – 5.4** (Cập nhật chính xác tên khóa, kiểu dữ liệu, JSON schema, giá trị mặc định), **Mục 9** | **Mục 2.2** hoặc **Mục 3** (Nếu đổi giao thức đồng bộ luồng) |
| **5. Thay đổi giao diện, bố cục màn hình, modal, biến màu `:root` trong `index.css` hoặc layout `activity_main.xml`** | **Mục 6.1** (Sơ đồ chuyển màn hình), **Mục 6.2** (Bảng màu CSS / Typography / hiệu ứng), **Mục 6.3** (Giao diện Android & Notification), **Mục 9** | **Mục 2.2** (Nếu tách thêm component giao diện mới) |
| **6. Nâng cấp phiên bản thư viện (`package.json`, `build.gradle.kts`, Gradle Wrapper), đổi cổng mạng, biến môi trường hoặc câu lệnh CLI** | **Mục 1.2** (Bảng Tech Stack & phiên bản), **Mục 7.1 – 7.3** (Yêu cầu công cụ, Bảng biến môi trường, Lệnh chạy/build/test), **Mục 9** | **Mục 5.1** (Cập nhật ngay các lệnh kiểm tra & xác minh nhanh) |
| **7. Phát hiện hoặc khắc phục một lỗi kỹ thuật tinh vi, giới hạn thiết bị mới hoặc nợ kỹ thuật** | **Mục 8.1** (Bất biến kỹ thuật), **Mục 8.2** (Bảo mật), **Mục 8.3** (Cập nhật hoặc gỡ bỏ mục nợ kỹ thuật đã sửa xong), **Mục 9** | **Mục 3** (Bổ sung quy tắc phòng vệ vào Guardrails để không tái phạm ở các phiên sau) |

---

### 4.2 Quy chuẩn Viết Bổ sung Khi Cập nhật Tài liệu
1. **Ngôn ngữ & Định dạng**: Viết bằng tiếng Việt kỹ thuật mạch lạc, chuyên sâu; giữ nguyên 100% tên biến, tên hàm, tên class, đường dẫn file, hằng số, câu lệnh CLI, key lưu trữ trong dấu backtick `` `...` ``.
2. **Ký hiệu tiền tệ `\$`**: Nếu trong văn bản giải thích có dùng ký hiệu đô-la ngoài khối code/backtick, luôn escape thành `\$` để không kích hoạt nhầm công thức toán LaTeX.
3. **An toàn cú pháp sơ đồ Mermaid**:
   - Chỉ dùng các loại sơ đồ chuẩn (`flowchart TD`, `flowchart LR`, `sequenceDiagram`, `stateDiagram-v2`, `classDiagram`).
   - **Luôn bọc nhãn node chứa dấu ngoặc tròn `()`, ngoặc vuông `[]`, dấu hai chấm `:` hoặc ký tự đặc biệt trong dấu ngoặc kép `"..."`** (ví dụ: `NodeA["Web Worker (ai.worker.ts)"]`).
   - Tuyệt đối không dùng thẻ HTML (`<br/>`, `<b>`...) bên trong nhãn Mermaid.
4. **Bảo toàn độ chi tiết**: Chỉ sửa/bổ sung đúng phần thay đổi; tuyệt đối không tóm tắt rút gọn làm mất thông tin giải thuật của các module khác vẫn đang còn hiệu lực.
5. **Ghi nhận lịch sử**: Luôn thêm một dòng mới vào bảng **Mục 9 (Nhật ký Cập nhật Tài liệu)** ở cuối `CODEBASE.md` ghi rõ ngày cập nhật, tệp/phạm vi thay đổi và tóm tắt kỹ thuật.

---

## 5. Lệnh Kiểm tra & Xác minh Nhanh (Verification Commands) & Checklist Hoàn tất

### 5.1 Các Lệnh Xác minh Bắt buộc Theo Phân hệ

- **Khi sửa mã nguồn Web / Electron (`src/`, `main.cjs`, cấu hình gốc)** — chạy tại `d:\Project\AI_Lab`:
  ```powershell
  npx tsc -b
  npm run lint
  npm run build
  ```
- **Khi sửa mã nguồn lõi thị giác / điều khiển Android (`android/core/`)** — chạy tại `d:\Project\AI_Lab\android`:
  ```powershell
  cd d:\Project\AI_Lab\android
  .\gradlew.bat :core:test --rerun --console=plain
  ```
- **Khi sửa mã nguồn ứng dụng Android (`android/app/`)** — chạy tại `d:\Project\AI_Lab\android`:
  ```powershell
  cd d:\Project\AI_Lab\android
  .\gradlew.bat :core:test :app:assembleDebug
  ```
- **Kiểm tra trạng thái kho Git để chắc chắn không làm bẩn tệp ngoài ý muốn**:
  ```powershell
  git -C "d:\Project\AI_Lab" status --short
  ```

---

### 5.2 Checklist Hoàn tất Trước Khi Trả lời Người dùng

Trước khi kết thúc phiên làm việc và gửi báo cáo cho người dùng, hãy tự kiểm tra đủ 7 mục sau:
- [ ] **1. Đọc đủ ngữ cảnh**: Đã tra cứu `CODEBASE.md` và đọc trực tiếp đầy đủ các tệp nguồn liên quan trước khi sửa chưa?
- [ ] **2. Tuân thủ bất biến**: Thay đổi có vi phạm bất kỳ quy tắc nào trong **Mục 3** không (ví dụ: không `import android.*` vào `:core`, mảng `IntArray` mới mỗi khung, giữ `base: './'`, không hạ chuẩn test nghiệm thu)?
- [ ] **3. Biên dịch & Linter sạch**: Đã chạy `npx tsc -b` / `npm run lint` / `npm run build` (cho Web) hoặc `.\gradlew.bat :core:test --rerun` / `:app:assembleDebug` (cho Android) và xác nhận `0` lỗi chưa?
- [ ] **4. Không sửa nhầm tệp chỉ đọc**: `README.md`, `android/README.md` và các tệp ngoài phạm vi yêu cầu có được giữ nguyên vẹn không?
- [ ] **5. Đồng bộ `CODEBASE.md` & `agent.md`**: Đã cập nhật đầy đủ các mục tương ứng theo **Ma trận Đồng bộ (Mục 4.1)** và ghi thêm dòng mới vào **Mục 9 (Documentation Changelog)** của `CODEBASE.md` chưa?
- [ ] **6. Kiểm tra định dạng Markdown/Mermaid**: Các nhãn Mermaid có ký tự đặc biệt đã bọc `"..."` và không có ký tự `$` tiền tệ trần gây lỗi hiển thị chưa?
- [ ] **7. Kiểm tra `git status --short`**: Cây thư mục sạch sẽ, không bỏ sót tệp rác tạm thời (`.bak`, `.tmp`, log thừa) trong kho mã nguồn.
