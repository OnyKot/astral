$files = @(
  "astral_app/src/components/channel/dm/DMList.module.css",
  "astral_app/src/components/voice/CompactVoiceCallView.module.css",
  "astral_app/src/components/voice/VoiceCallView.module.css",
  "astral_app/src/components/voice/VoiceConnectionStatus.module.css",
  "astral_app/src/components/voice/VoiceConnectionStatus.tsx"
)

$commit = "7c87fa499c01690c01ad92191d2ebaeca6fdc574"

foreach ($file in $files) {
  git restore --source=$commit -- $file
}

Write-Host "Restored pre-Arc UI files from $commit"
