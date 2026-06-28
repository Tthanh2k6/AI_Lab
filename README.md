# AI Game Arena

> Hệ thống mô phỏng, huấn luyện và đối kháng AI tự động — Trải nghiệm sự tiến hóa và tư duy của AI trên môi trường 2D & 3D thời gian thực.

**AI Game Arena** là một ứng dụng desktop (Electron) kết hợp web hiện đại, được thiết kế để trực quan hóa cách các giải thuật AI từ cổ điển đến hiện đại học hỏi, ra quyết định và tự tối ưu hóa. Người dùng có thể tự cấu hình các tham số huấn luyện, thiết lập cấu trúc mạng nơ-ron, hoặc tùy chỉnh hàm heuristic để chứng kiến các "bộ não" AI tự học từ con số 0 hoặc thi đấu trực tiếp với nhau.

---

## 🎮 Các chế độ trò chơi & Mô phỏng (8 trò chơi)

Dự án tích hợp đầy đủ 8 chế độ chơi đa dạng với độ khó lập trình và giải thuật AI khác nhau:

### 1. 🦅 Flappy Bird
*   **Mô tả**: Huấn luyện một đàn chim tự học cách bay luồn qua các đường ống có độ cao ngẫu nhiên. Người dùng có thể tùy chỉnh kích thước quần thể và tỷ lệ đột biến. Có chế độ cho phép người dùng tự chơi.
*   **Giải thuật**: Mạng nơ-ron nhân tạo (ANN) + Tiến hóa di truyền (Genetic Algorithm / Neuroevolution).
*   **Tham số**: Kích thước quần thể, Tỷ lệ đột biến, Độ rộng khe ống.

### 2. 🌀 Mê Cung AI (Robot Q-Maze)
*   **Mô tả**: Robot tự tìm đường ngắn nhất để thoát khỏi mê cung. Hệ thống hiển thị bản đồ nhiệt (Heatmap) của bảng Q-Table và các mũi tên chỉ hướng đi tối ưu sáng dần lên theo thời gian học.
*   **Giải thuật**: Học tăng cường (Reinforcement Learning - Q-Learning), chiến lược khám phá \(\epsilon\)-greedy.
*   **Tham số**: Kích thước lưới mê cung, Tốc độ học (ticks/frame).

### 3. 🔢 Game 2048
*   **Mô tả**: AI tự động trượt các ô số để đạt điểm cao nhất (gộp ô 2048 hoặc hơn). Hệ thống hoạt ảnh mượt mà kèm bảng theo dõi điểm số, số ô trống và thời gian xử lý. Người dùng cũng có thể tự chơi bằng phím mũi tên.
*   **Giải thuật**: Tìm kiếm Expectimax (Expectimax Search) kết hợp các hàm lượng giá heuristic (độ mượt, tính đơn điệu, ô lớn nằm ở góc, số ô trống).
*   **Tham số**: Tốc độ tự chơi của AI.

### 4. 🔴 Connect Four (Cờ Thả 4 Quân)
*   **Mô tả**: Trò chơi thả quân cờ vào lưới đứng kích thước 7×6. Mục tiêu là nối được 4 quân cờ thẳng hàng (ngang, dọc, chéo). Người dùng có thể xem máy đấu máy hoặc trực tiếp đấu với AI.
*   **Giải thuật**: Tìm kiếm Minimax kết hợp cắt tỉa Alpha-Beta và hàm đánh giá heuristic thế trận.
*   **Tham số**: Độ sâu tìm kiếm (sức mạnh AI), Tốc độ mô phỏng máy đấu máy.

### 5. 🏎️ Đua Xe AI (AI Racing)
*   **Mô tả**: Đàn xe tự học cách điều khiển (tăng tốc, phanh, bẻ lái) để hoàn thành vòng đua mà không đâm vào lề hay chướng ngại vật. Xe sử dụng các cảm biến tia quét (Raycasting Sensors) để nhận biết khoảng cách xung quanh.
*   **Tính năng đặc biệt**: Tích hợp **Trình tạo đường đua (Track Builder)** cho phép người dùng tự vẽ đường đua tùy ý.
*   **Giải thuật**: Mạng nơ-ron (Feedforward Neural Network) + Thuật toán tiến hóa di truyền.
*   **Tham số**: Số lượng xe, Số lượng cảm biến (tia quét), Tỷ lệ đột biến, Tốc độ xe.

### 6. ♟️ Cờ Caro (Gomoku 20×20)
*   **Mô tả**: Đấu trường cờ Caro trên bàn cờ kích thước lớn 20×20. Hai AI (X và O) đối đầu trực tiếp. Có thể cấu hình riêng biệt giải thuật cho từng bên để so sánh hiệu năng.
*   **Giải thuật**: 
    *   **Minimax** kết hợp cắt tỉa Alpha-Beta, bảng chuyển vị (Transposition Table) với mã hóa Zobrist Hashing, và tìm kiếm giới hạn theo vùng đá (Bounding Box).
    *   **MCTS** (Monte Carlo Tree Search) sử dụng công thức UCT (Upper Confidence bound applied to Trees).
    *   Hàm lượng giá thế trận nâng cao (nhận biết nước đôi 3-3, nước 4-3, chặn nước 4, chặn nước 3).
*   **Tham số**: Độ sâu tìm kiếm (Minimax), Số lượt mô phỏng (MCTS), Hằng số khám phá C (MCTS), Trọng số heuristic có thể điều chỉnh hoặc tiến hóa.

### 7. ⚽ Bóng Đá AI 3D (Soccer 3D)
*   **Mô tả**: Hai cầu thủ AI (Cam và Xanh) đấu với nhau trong phòng kín 3D rộng lớn. Quả bóng chuyển động hoàn toàn tự do với vật lý nảy sân, vấp tường và trọng lực. Cầu thủ có thể chạy, nhảy cao né tránh, dẫn bóng và sút bổng (kick lift) với thời gian hồi chiêu (cooldown) thực tế.
*   **Giải thuật**: Mạng nơ-ron + Tiến hóa di truyền (mỗi bàn thắng làm tăng độ thích nghi - fitness).
*   **Tham số**: Tỷ lệ đột biến, Tốc độ mô phỏng (tua nhanh quá trình học).

### 8. 🏃‍♂️ Đuổi Bắt AI 3D (Tag 3D)
*   **Mô tả**: Mô phỏng đấu trường đuổi bắt trong không gian 3D kín có 4 trụ cột chướng ngại vật di động (người chơi có thể đẩy dịch chuyển để chắn đường). AI Đỏ (Chaser) tự học cách đuổi bắt, AI Xanh (Evader) tự học cách né tránh và ẩn nấp sau các khối trụ.
*   **Giải thuật**: Tiến hóa song song đối kháng (Co-evolution) dựa trên mạng nơ-ron và cảm biến raycast 3D 8 hướng.
*   **Tham số**: Tỷ lệ đột biến, Tốc độ mô phỏng.

---

## 🛠️ Công nghệ sử dụng

*   **React 19** + **TypeScript** — Xây dựng giao diện ứng dụng modular, quản lý state và luồng dữ liệu chặt chẽ.
*   **Vite 8** — Trình biên dịch cực nhanh phục vụ quá trình phát triển (Hot Module Replacement) và tối ưu hóa đóng gói.
*   **Three.js** — Thư viện dựng đồ họa 3D thời gian thực cho các trò chơi bóng đá (Soccer 3D) và đuổi bắt (Tag 3D), xử lý va chạm vật lý cứng 3D và camera theo dõi động.
*   **HTML5 Canvas (2D)** — Dựng hình đồ họa mượt mà hiệu năng cao cho Đua xe, Flappy Bird, Q-Maze, 2048, Connect 4 và Caro.
*   **Web Workers (Vite Native Workers)** — Đẩy toàn bộ các tác vụ tính toán nặng (tìm kiếm Minimax/MCTS sâu, mô phỏng tiến hóa quần thể nhiều cá thể) xuống luồng phụ chạy nền, giữ cho giao diện UI luôn mượt mà ở tốc độ 60fps.
*   **Electron 42** — Đóng gói ứng dụng web thành ứng dụng Desktop hoàn chỉnh chạy trên Windows.
*   **lucide-react** — Bộ biểu tượng giao diện hiện đại.
*   **ESLint** — Đảm bảo chất lượng mã nguồn ổn định.

---

## 📂 Cấu trúc thư mục dự án

```text
AI_Lab/
├── main.cjs                # Entry point cấu hình ứng dụng Electron
├── index.html              # Entry point HTML của Web app
├── package.json            # Cấu hình dự án, scripts chạy và dependencies
├── vite.config.ts          # Cấu hình build & plugin React của Vite
├── src/
│   ├── App.tsx             # Bộ điều hướng màn hình chính và quản lý trạng thái game
│   ├── index.css           # CSS giao diện với hệ thống Theme Dark-mode và Glassmorphism cực đẹp
│   ├── main.tsx            # Điểm khởi đầu render ứng dụng React
│   │
│   ├── components/         # Các thành phần giao diện màn hình
│   │   ├── SelectGameScreen.tsx    # Giao diện chọn 1 trong 8 trò chơi
│   │   ├── SetupScreen.tsx         # Giao diện cấu hình tham số AI chi tiết trước khi chạy
│   │   ├── TrainingScreen.tsx      # Giao diện thi đấu/huấn luyện Caro 20x20
│   │   ├── RacingScreen.tsx        # Giao diện giả lập đua xe AI & Track Builder
│   │   ├── FlappyScreen.tsx        # Giao diện tiến hóa chim Flappy Bird
│   │   ├── QMazeScreen.tsx         # Giao diện hiển thị robot học thoát mê cung
│   │   ├── Connect4Screen.tsx      # Giao diện bàn cờ Connect 4 đấu với AI
│   │   ├── Soccer2Screen.tsx       # Giao diện đấu trường bóng đá 3D thực tế
│   │   ├── TagScreen.tsx           # Giao diện đuổi bắt 3D (Chaser vs Evader)
│   │   ├── TrackBuilder.tsx        # Trình vẽ đường đua cho game Racing
│   │   ├── Board2048.tsx           # Giao diện lưới chơi 2048
│   │   └── *Preview.tsx            # Các thành phần preview nhỏ hiển thị ở Setup
│   │
│   ├── utils/              # Lõi thuật toán và vật lý mô phỏng
│   │   ├── minimax.ts              # Thuật toán tìm kiếm Minimax & Alpha-Beta Pruning (Caro)
│   │   ├── mcts.ts                 # Thuật toán Monte Carlo Tree Search - UCT (Caro)
│   │   ├── evaluator.ts            # Hàm lượng giá, kiểm tra thắng thua trên lưới Caro
│   │   ├── zobrist.ts              # Tạo hash bàn cờ cho Transposition Table (Caro)
│   │   ├── trainer.ts              # Quản trị viên lưu trữ/lót mẫu tiến hóa Caro
│   │   ├── racingPhysics.ts        # Vật lý xe đua, cảm biến raycast 2D, NN & Genetic
│   │   ├── flappy.ts               # Bộ sinh ống, va chạm vật lý Flappy Bird
│   │   ├── game2048.ts             # Bộ sinh ô số mới, trượt gộp ô và thuật toán Expectimax
│   │   ├── connect4.ts             # Trạng thái bàn cờ Connect 4 & lượng giá nước đi
│   │   ├── qmaze.ts                # Khởi tạo ma trận mê cung & cập nhật Q-Table học tăng cường
│   │   ├── soccer2.ts              # Quy tắc di chuyển, va chạm người-bóng-tường 3D & Neuroevolution
│   │   ├── tagGame.ts              # Logic đuổi bắt, 8 cảm biến raycast 3D, va chạm chướng ngại vật
│   │   └── render*.ts              # Các hàm chuyên trách vẽ Canvas (2D) hoặc điều phối dựng Three.js (3D)
│   │
│   ├── hooks/              # Custom React Hooks
│   │   └── useAIWorker.ts          # Hook quản lý vòng đời và truyền tin với Web Worker Caro
│   │
│   ├── workers/            # Luồng tính toán nền
│   │   └── ai.worker.ts            # Web Worker độc lập thực thi Minimax/MCTS cho Caro
│   │
│   └── types/              # Định nghĩa cấu trúc dữ liệu (TypeScript Interfaces)
│       └── game.ts                 # Kiểu dữ liệu cho cấu hình, trạng thái của toàn bộ 8 game
```

---

## ⚡ Bắt đầu

### Yêu cầu hệ thống
*   [Node.js](https://nodejs.org/) (Khuyến nghị phiên bản 18 trở lên)
*   Trình duyệt web hiện đại hỗ trợ WebGL (để dựng Three.js) và Web Workers.

### Cài đặt dependencies
Tải mã nguồn về máy và thực hiện cài đặt thư viện:
```bash
git clone <repo-url>
cd AI_Lab
npm install
```

### Chạy ứng dụng trên trình duyệt (Web Mode)
Khởi chạy Vite dev server để mở giao diện web:
```bash
npm run dev
```
Trình duyệt sẽ tự động mở hoặc bạn có thể truy cập liên kết mặc định `http://localhost:5173`.

### Chạy ứng dụng Desktop (Electron Mode)
Để chạy giao diện tích hợp trong cửa sổ Desktop của Electron:
```bash
npm run electron:dev
```
Lệnh này sử dụng gói `concurrently` để khởi động cả Vite server và Electron shell song song.

---

## 📦 Build & Đóng gói ứng dụng

Dưới đây là danh sách các lệnh thực thi có sẵn trong `package.json`:

| Lệnh | Mô tả |
| :--- | :--- |
| `npm run dev` | Khởi chạy Vite dev server (Web mode) |
| `npm run build` | Biên dịch TypeScript và build bản web production tối ưu vào thư mục `dist/` |
| `npm run preview` | Chạy preview kiểm tra bản web sau khi build |
| `npm run lint` | Quét kiểm tra chất lượng code với ESLint |
| `npm run electron:start` | Mở ứng dụng Electron trực tiếp từ mã nguồn |
| `npm run electron:dev` | Chạy ứng dụng Electron ở chế độ dev (kèm Vite reload) |
| `npm run electron:build` | Build project React và đóng gói thành tệp cài đặt Windows (`.exe` qua NSIS) lưu trong thư mục `release/` |

---

## 🔬 Cách hoạt động của các hệ thống học máy

1.  **Huấn luyện bằng Thuật toán Di truyền (Flappy Bird, Racing, Soccer 3D, Tag 3D)**:
    *   Hệ thống khởi tạo một thế hệ đầu tiên gồm các cá thể có mạng nơ-ron mang bộ trọng số ngẫu nhiên.
    *   Qua mỗi vòng chạy, độ thích nghi (fitness) được tính toán dựa trên kết quả đạt được (quãng đường đi được, thời gian sống sót, bàn thắng ghi được, số lần bắt được đối thủ).
    *   Các cá thể xuất sắc nhất sẽ được giữ lại làm bố mẹ để lai ghép chéo (crossover) và đột biến (mutate) tạo ra thế hệ con cháu tiếp theo.
2.  **Tìm kiếm đối kháng (Caro, Connect 4, 2048)**:
    *   AI duyệt qua cây trạng thái các nước đi có thể xảy ra trong tương lai.
    *   Minimax tìm cách tối đa hóa điểm số của mình và tối thiểu hóa điểm số của đối thủ. Cắt tỉa Alpha-Beta giúp loại bỏ sớm các nhánh tìm kiếm không hiệu quả để tiết kiệm tài nguyên.
    *   Expectimax (trong 2048) xử lý các trạng thái ngẫu nhiên sinh ra bởi môi trường (ô số mới xuất hiện ngẫu nhiên là 2 hoặc 4) bằng cách tính trung bình trọng số xác suất điểm của các nhánh ngẫu nhiên.
3.  **Học tăng cường Q-Learning (Mê Cung)**:
    *   Robot cập nhật giá trị kỳ vọng nhận được khi thực hiện một hành động tại một trạng thái cụ thể thông qua phương trình Bellman:
        $$Q(s, a) \leftarrow Q(s, a) + \alpha \left[ r + \gamma \max_{a'} Q(s', a') - Q(s, a) \right]$$
    *   Hệ thống đồ thị nhiệt hiển thị trực quan các ô có giá trị Q cao hơn bằng màu sắc sáng hơn, cho thấy đường đi tối ưu đang dần hình thành trong "trí nhớ" của AI.

---

## 📜 Giấy phép & Bản quyền

Dự án được xây dựng phục vụ cho mục đích học tập, nghiên cứu và trực quan hóa các thuật toán trí tuệ nhân tạo.

*   **Phát triển bởi**: Trần Trung Thanh (Tthanh2k6)
*   **Phiên bản**: v1.5.11
