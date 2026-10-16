cask "xrift-studio" do
  version "1.0.8"
  sha256 "6a455186ed9e1ff74275897b352d061170f4a3a27ae3a9a39f7317655e6bfb41"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
