cask "xrift-studio" do
  version "1.0.11"
  sha256 "4af603d1b0e2007618a1e0980935fc84a758e06576f632251ad8710b67ae00d1"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
