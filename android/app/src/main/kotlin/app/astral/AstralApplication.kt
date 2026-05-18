package app.astral

import android.app.Application

class AstralApplication : Application() {
    val container: AppContainer by lazy {
        AppContainer(this)
    }
}
