cask "xrift-studio" do
  version "1.0.16"
  sha256 "10d6e583c0b1a19e607af7edb0249e4f8398d57afa9dde062e0e6b3d0a25297d"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
