cask "xrift-studio" do
  version "1.0.13"
  sha256 "ad77e4805910e8c50badd647bb84998673bddd452faec6fd9d3f718b82c3b861"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
