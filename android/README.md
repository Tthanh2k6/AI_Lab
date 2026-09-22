# AI Arena Agent (Android)

Tác nhân chạy **hoàn toàn trên điện thoại**: đọc màn hình game bằng chụp màn hình (MediaProjection),
nhận diện chim / ống / đất theo cấu trúc chung của thể loại Flappy Bird (không bám vào sprite của một
bản cụ thể), tự đo trọng lực + lực vỗ + độ trễ của bản đang chơi, rồi tap qua dịch vụ Trợ năng.
Không cần root. Chỉ dùng cá nhân.

```
MediaProjection (~216 px ngang) → FlappyDetector → PhysicsEstimator + FlapController → dispatchGesture
```

## Cấu trúc

| Module | Nội dung | Cần gì để build |
|---|---|---|
| `core/` | Kotlin thuần: `vision/` (Frame, ScrollEstimator, FlappyDetector), `control/` (PhysicsEstimator, FlapController), `agent/FlappyAgent`. Test bằng mô phỏng nhiều skin trong `src/test/.../sim/`. | JDK 17 |
| `app/`  | Android: `AgentService` (chụp màn + chạy tác nhân, điều khiển qua thông báo), `TapAccessibilityService` (tap), `MainActivity` (cấp quyền, trạng thái). | Android SDK 36 |

## Build & chạy

```bash
cd android
./gradlew :core:test            # nghiệm thu lõi: nhận diện, vật lý, vòng kín trên 5 skin
./gradlew :app:assembleDebug    # APK: app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`local.properties` (git bỏ qua) trỏ `sdk.dir` tới SDK trên máy. Không cần Android Studio.

## Trên điện thoại (Android 16, không root)

1. Cài qua `adb install` (cài từ file APK tải về sẽ bị chặn bật Trợ năng bởi "cài đặt bị hạn chế").
2. Mở app → **1. Bật dịch vụ Trợ năng** → bật "AI Arena Agent — tap tự động".
3. **2. Cấp quyền thông báo** (để dịch vụ nền hiện trạng thái và nút Dừng).
4. **3. Chọn game & bắt đầu** → hộp thoại chụp màn hình: chọn **chia sẻ một ứng dụng** và chọn game
   (tránh chụp lẫn thông báo của chính app này) → mở game.
5. Trạng thái (fps, tốc độ cuộn, chim, ống, g / vFlap / độ trễ đã đo) hiện trong thông báo; bấm **Dừng** để tắt.

## Giới hạn hiện tại (v0.1)

- Bộ nhận diện giả định bố cục Flappy cổ điển: ống cột đứng nối mép trên/đất, chim ở nửa trái, màn cuộn sang trái.
  Bản có ống di chuyển dọc, chim trôi ngang hoặc nền quá nhiều hiệu ứng sẽ kém.
- Vị trí tap cố định ở (50 %, 62 %) màn hình.
- Chưa có lớp phủ debug trên màn hình; xem `adb logcat -s AgentService`.
