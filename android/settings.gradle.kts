pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "ai-arena-android"

// core: lõi thị giác + điều khiển, Kotlin thuần (JVM) — build & test không cần điện thoại
// app:  ứng dụng Android bọc quanh core (chụp màn hình, tap qua Trợ năng)
include(":core", ":app")
