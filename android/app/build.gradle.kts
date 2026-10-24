plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "id.pendampingkuis"
    compileSdk = 35

    defaultConfig {
        applicationId = "id.pendampingkuis"
        minSdk = 24          // Android 7.0 — mencakup sebagian besar HP guru
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}

// Salin aplikasi web (../web) ke aset sebelum setiap build, sehingga APK selalu memakai versi web terbaru.
val salinWeb by tasks.registering(Sync::class) {
    from(rootProject.file("../web"))
    into(layout.projectDirectory.dir("src/main/assets/web"))
    exclude("sw.js") // service worker tidak dipakai di aplikasi native: semua file sudah ada di APK
}
tasks.named("preBuild") { dependsOn(salinWeb) }
