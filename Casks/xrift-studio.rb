cask "xrift-studio" do
  version "0.10.1"
  sha256 "b5dc67a98a3883ea764b5856c680877c655451e3693a16f99014fcb5cf327d42"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
