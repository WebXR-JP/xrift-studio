cask "xrift-studio" do
  version "1.0.12"
  sha256 "50be1dfdbaafeb79ebb6491ca8f17455a94d514c355d2f79e98b91965f61fd16"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
