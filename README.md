# AI Game Arena

> Hệ thống huấn luyện AI tự động — mô phỏng và giám sát quá trình tiến hóa của AI trong các trò chơi thời gian thực.

**AI Game Arena** là một ứng dụng desktop (Electron) kết hợp web, nơi bạn cấu hình, khởi tạo các "bộ não" AI từ con số 0 và theo dõi chúng tự học, tiến hóa và thi đấu trực tiếp. Dự án tích hợp nhiều giải thuật AI cổ điển lẫn hiện đại: **Minimax, MCTS, Mạng nơ-ron nhân tạo (ANN)** và **Giải thuật di truyền (Genetic Algorithm)**.

---

## Các chế độ trò chơi

| Trò chơi | Mô tả | Giải thuật |
|----------|-------|------------|
| ♟️ **Gomoku / Cờ Caro (20x20)** | Đấu trường AI cờ caro. Huấn luyện các thế cờ từ con số 0. | Heuristic + Minimax, MCTS (UCT), Genetic Brains |
| 🏎️ **Racing / Đua xe AI** | Huấn luyện thế hệ xe tự lái né chướng ngại vật & đường cua. | Neural Network, Genetic Algorithm, Raycasting Sensors |
| 🀄 **Xiangqi / Cờ Tướng** | *(Sắp ra mắt)* Alpha-Beta Pruning, Piece-Square Tables. | Minimax |

---

## Công nghệ sử dụng

- **React 19** + **TypeScript** — giao diện
- **Vite 8** — build & dev server
- **Electron 42** — đóng gói ứng dụng desktop
- **Web Workers** — chạy AI/huấn luyện trên luồng riêng, không khóa giao diện
- **lucide-react** — bộ icon
- **ESLint** — kiểm tra chất lượng mã

---

## Bắt đầu

### Yêu cầu

- [Node.js](https://nodejs.org/) (khuyến nghị phiên bản 18+)
- npm

### Cài đặt

```bash
git clone <repo-url>
cd AI_Lab
npm install
```

### Chạy ở chế độ phát triển (web)

```bash
npm run dev
```

Mở trình duyệt tại địa chỉ Vite in ra (mặc định `http://localhost:5173`).

### Chạy dưới dạng ứng dụng desktop (Electron)

```bash
npm run electron:dev
```

---

## Build & đóng gói

| Lệnh | Mô tả |
|------|-------|
| `npm run dev` | Khởi động Vite dev server |
| `npm run build` | Build bản web production vào `dist/` |
| `npm run preview` | Xem trước bản build |
| `npm run lint` | Chạy ESLint |
| `npm run electron:start` | Mở app Electron từ bản đã build |
| `npm run electron:dev` | Chạy Vite + Electron song song |
| `npm run electron:build` | Đóng gói file cài đặt Windows (NSIS) vào `release/` |

---

## Cấu trúc thư mục

```text
AI_Lab/
├── main.cjs                # Entry point của Electron
├── index.html              # Entry point của web
├── src/
│   ├── App.tsx             # Điều hướng màn hình
│   ├── components/         # Các màn hình UI (Select, Setup, Training, Racing...)
│   ├── utils/              # Giải thuật AI: minimax, mcts, trainer, evaluator, zobrist...
│   ├── hooks/              # React hooks (useAIWorker)
│   ├── workers/            # Web Workers chạy AI nền
│   └── types/              # Định nghĩa kiểu TypeScript
├── public/                 # Tài nguyên tĩnh
└── release/                # Output sau khi đóng gói Electron
```

---

## Cách hoạt động

1. **Chọn trò chơi** ở màn hình chính.
2. **Cấu hình** AI (giải thuật, tham số, khởi tạo từ đầu hay nạp sẵn).
3. **Khởi chạy đấu trường** — AI bắt đầu tự học/tiến hóa qua từng thế hệ.
4. **Giám sát thời gian thực** quá trình huấn luyện và thi đấu.

Các tác vụ tính toán nặng (huấn luyện mạng nơ-ron, tìm kiếm cây MCTS, tiến hóa quần thể) được tách ra **Web Worker** để giao diện luôn mượt.

---

## Giấy phép

Dự án phục vụ mục đích học tập & nghiên cứu.

---

> AI Arena v1.0.0
