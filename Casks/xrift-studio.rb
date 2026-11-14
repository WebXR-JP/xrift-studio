cask "xrift-studio" do
  version "1.0.19"
  sha256 "47a342ce09e390b2e92d126e27438d65f1ae18df229613353c58dfe4037146e7"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
