cask "xrift-studio" do
  version "1.0.2"
  sha256 "af04120642416aefb2bc81434b5cf233133d4a8677897e25b3e942d6da1df634"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
