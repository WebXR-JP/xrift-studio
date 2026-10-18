cask "xrift-studio" do
  version "1.0.9"
  sha256 "7797097fea4d8b8dff9dcf7dddf2f58453304bfeddf16d680d2e3ee20a8bfbff"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
