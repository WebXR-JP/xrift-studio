cask "xrift-studio" do
  version "1.0.17"
  sha256 "6eec1864db8904e2b06b5e583f0de84d841e4281c836d6e40d5c561a86538463"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
