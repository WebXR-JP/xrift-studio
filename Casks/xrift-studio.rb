cask "xrift-studio" do
  version "1.0.10"
  sha256 "4ce4f771546a6bfe0f01e5709c6c1d3c82bd4b8711563aea25b3c4aed9852c67"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
