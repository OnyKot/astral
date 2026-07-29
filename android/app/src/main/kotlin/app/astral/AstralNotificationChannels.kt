package app.astral

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build

object AstralNotificationChannels {
    const val CHANNEL_ID = "astral_notifications"
    const val NOTIFICATION_ID = 1200

    private val legacyChannelIds = listOf(
        "astral_background",
        "astral_messages",
        "astral_mentions",
        "astral_calls",
        "astral_system",
    )

    fun ensure(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = context.getSystemService(NotificationManager::class.java)
        legacyChannelIds.forEach(manager::deleteNotificationChannel)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Astral notifications",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Messages, calls, mentions, and Astral alerts"
                enableVibration(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            },
        )
    }

    fun contentIntent(context: Context, url: String?): PendingIntent {
        val target = url?.takeIf { it.startsWith("https://astraof.com") } ?: "https://astraof.com/channels/@me"
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse(target)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(
            context,
            target.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    fun userNotification(
        context: Context,
        title: String,
        body: String?,
        url: String?,
        tag: String?,
        isCall: Boolean,
        soundEnabled: Boolean,
        vibrateEnabled: Boolean,
    ): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
        }

        builder
            .setSmallIcon(R.drawable.ic_stat_astral)
            .setContentTitle(title.ifBlank { "Astral" })
            .setContentText(body.orEmpty())
            .setStyle(Notification.BigTextStyle().bigText(body.orEmpty()))
            .setContentIntent(contentIntent(context, url))
            .setAutoCancel(true)
            .setShowWhen(true)
            .setColor(Color.rgb(117, 80, 210))
            .setPriority(if (isCall) Notification.PRIORITY_MAX else Notification.PRIORITY_HIGH)
            .setCategory(if (isCall) Notification.CATEGORY_CALL else Notification.CATEGORY_MESSAGE)
            .setOnlyAlertOnce(false)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!soundEnabled) {
                builder.setSound(null)
            }
        } else {
            @Suppress("DEPRECATION")
            builder.setDefaults(if (soundEnabled) Notification.DEFAULT_SOUND else 0)
        }
        if (vibrateEnabled) {
            builder.setVibrate(if (isCall) longArrayOf(0L, 350L, 140L, 350L) else longArrayOf(0L, 80L))
        } else {
            builder.setVibrate(longArrayOf(0L))
        }

        return builder.build()
    }
}
