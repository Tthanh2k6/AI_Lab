# AI Arena Agent (Android)

Tác nhân chạy **hoàn toàn trên điện thoại**: đọc màn hình game bằng chụp màn hình (MediaProjection),
nhận diện theo **cấu trúc** của thể loại game (không bám vào sprite của một bản cụ thể), rồi tap qua
dịch vụ Trợ năng. Không cần root. Chỉ dùng cá nhân. Hiện có hai tác nhân, chọn trong app trước khi bắt đầu:

| Game | Nhận diện | Điều khiển |
|---|---|---|
| **Flappy Bird** (mọi bản clone) | chim / ống / đất theo cấu trúc; tự đo trọng lực, lực vỗ, độ trễ của bản đang chơi | `FlapController`: mô phỏng vài lựa chọn (vỗ ngay / vỗ khung sau / không vỗ), vỗ khi bắt buộc |
| **Mr Gun** (Ketchapp) | tâm xoay + vạch ngắm đang lắc (khớp đường thẳng qua các khung), địch = khối tĩnh phía trên, đầu = phần trên khối; tự học biên lắc và vận tốc góc | `AimController`: dự đoán góc tại lúc tap có hiệu lực (θ + ω·độ trễ, phản xạ ở biên lắc), nhắm đầu nếu dải góc đủ rộng, không thì nhắm giữa thân |

```
MediaProjection (~216 px ngang) → FlappyDetector → PhysicsEstimator + FlapController → dispatchGesture
                                 → MrGunDetector  → AimController                     ↗
```

## Cấu trúc

| Module | Nội dung | Cần gì để build |
|---|---|---|
| `core/` | Kotlin thuần: `vision/` (Frame, ScrollEstimator, FlappyDetector, MrGunDetector), `control/` (PhysicsEstimator, FlapController, AimController), `agent/` (GameAgent, FlappyAgent, MrGunAgent, GameKind). Test bằng mô phỏng nhiều skin trong `src/test/.../sim/` (FlappySim, MrGunSim). | JDK 17 |
| `app/`  | Android: `AgentService` (chụp màn + chạy tác nhân, điều khiển qua thông báo), `TapAccessibilityService` (tap), `MainActivity` (cấp quyền, trạng thái). | Android SDK 36 |

## Build & chạy

```bash
cd android
./gradlew :core:test            # nghiệm thu lõi: nhận diện, vật lý, vòng kín trên 5 skin mỗi game
./gradlew :app:assembleDebug    # APK: app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`local.properties` (git bỏ qua) trỏ `sdk.dir` tới SDK trên máy. Không cần Android Studio.

## Trên điện thoại (Android 16, không root)

1. Cài qua `adb install` (cài từ file APK tải về sẽ bị chặn bật Trợ năng bởi "cài đặt bị hạn chế").
2. Mở app → **1. Bật dịch vụ Trợ năng** → bật "AI Arena Agent — tap tự động".
3. **2. Cấp quyền thông báo** (để dịch vụ nền hiện trạng thái và nút Dừng).
4. Chọn game (Flappy Bird / Mr Gun) → **3. Chọn game & bắt đầu** → hộp thoại chụp màn hình: chọn
   **chia sẻ một ứng dụng** và chọn game (tránh chụp lẫn thông báo của chính app này) → mở game.
5. Trạng thái hiện trong thông báo (Flappy: fps, tốc độ cuộn, chim, ống, g / vFlap / độ trễ đã đo;
   Mr Gun: tâm xoay, góc, vận tốc góc, biên lắc, địch, số phát bắn); bấm **Dừng** để tắt.

## Giới hạn hiện tại (v0.2)

- Flappy: bộ nhận diện giả định bố cục cổ điển: ống cột đứng nối mép trên/đất, chim ở nửa trái, màn cuộn sang trái.
  Bản có ống di chuyển dọc, chim trôi ngang hoặc nền quá nhiều hiệu ứng sẽ kém.
- Mr Gun: giả định vạch ngắm là nét thẳng dài duy nhất đang chuyển động, địch đứng yên phía trên tâm xoay
  và nền gồm vài màu phẳng chiếm diện tích lớn. Độ trễ tap dùng giá trị mặc định 80 ms (chưa tự đo);
  boss nhiều máu được xử lý như địch thường (bắn lặp lại).
- Vị trí tap cố định ở (50 %, 62 %) màn hình.
- Chưa có lớp phủ debug trên màn hình; xem `adb logcat -s AgentService`.
