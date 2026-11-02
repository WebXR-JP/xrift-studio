cask "xrift-studio" do
  version "1.0.18"
  sha256 "315ff1e4fda2e04c71be0d33b28aea04da4b8c58e65c2353a9a68321926131e6"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
