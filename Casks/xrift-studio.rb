cask "xrift-studio" do
  version "1.0.1"
  sha256 "4ac72dcddd9139a45a969abeb58d4fd18ad30d9d2788829894a798cfa01e60d9"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
