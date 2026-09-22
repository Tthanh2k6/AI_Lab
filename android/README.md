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

## Đã thử trên máy thật (Xiaomi 17 Pro, HyperOS / Android 16)

- Màn 1220×2656 → khung chụp 202×442. Ghi hình 8 s Mr Gun (`adb shell screenrecord`) rồi tách khung bằng ffmpeg
  (`scale=202:440:flags=area`) và chạy `MrGunRealFramesTest`: tâm xoay 469/479 khung, góc bám đúng (lắc −1…61°, ≈59°/s),
  địch 469/479, một quyết định bắn mỗi lượt vạch quét qua đầu địch. 40 khung trong số đó nằm ở
  `core/src/test/resources/mrgun_real/` làm test hồi quy.
- Vị trí tap: Flappy (50 %, 62 %); Mr Gun bắn ở (50 %, 78 %) và trên màn thua chỉ tap khi nhận ra nút **chơi lại**
  (ô vuông giữa-dưới) rồi tap đúng vào nó — banner quảng cáo nằm giữa màn nên không tap mù ở đó.
- Khi cấp quyền chụp màn hình hãy chọn **Toàn bộ màn hình**; nếu 3 s không nhận được khung hình nào, thông báo sẽ báo.
  Trạng thái chi tiết (fps, tap, cử chỉ xong/huỷ) xem `adb logcat -s AgentService TapAccessibility`.
- HyperOS có thể ngắt kết nối dịch vụ Trợ năng của app (Game Turbo); màn hình app hiện "đã bật trong Cài đặt nhưng chưa
  kết nối" → tắt rồi bật lại dịch vụ trong Cài đặt → Trợ năng.
- Chụp màn hình qua adb trên máy này cần chỉ định display: `adb exec-out screencap -p -d <id>` (id từ
  `dumpsys SurfaceFlinger --display-id`); trong Git Bash đặt `MSYS_NO_PATHCONV=1` khi truyền đường dẫn `/sdcard/...`.

## Giới hạn hiện tại (v0.2)

- Flappy: bộ nhận diện giả định bố cục cổ điển: ống cột đứng nối mép trên/đất, chim ở nửa trái, màn cuộn sang trái.
  Bản có ống di chuyển dọc, chim trôi ngang hoặc nền quá nhiều hiệu ứng sẽ kém.
- Mr Gun: giả định vạch ngắm là nét thẳng dài duy nhất đang chuyển động, địch đứng yên phía trên tâm xoay
  và nền gồm vài màu phẳng chiếm diện tích lớn. Độ trễ tap dùng giá trị mặc định 80 ms (chưa tự đo);
  boss nhiều máu được xử lý như địch thường (bắn lặp lại).
- Vị trí tap cố định ở (50 %, 62 %) màn hình.
- Chưa có lớp phủ debug trên màn hình; xem `adb logcat -s AgentService`.
