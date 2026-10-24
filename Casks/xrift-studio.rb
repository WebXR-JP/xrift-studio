cask "xrift-studio" do
  version "1.0.14"
  sha256 "61967b8c664d8fcff556ad1818f3ccdc4d45f5da2818d890dce90162d00e5440"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
