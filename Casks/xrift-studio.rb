cask "xrift-studio" do
  version "1.0.0"
  sha256 "492c07e417557251bcad23fd807da0e4d8678f85e99cd1c497a8aaa3b5f6426b"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
