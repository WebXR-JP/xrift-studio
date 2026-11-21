cask "xrift-studio" do
  version "1.0.20"
  sha256 "b06f6a664fcc0042be7dc9bff141f4ba77e98cad8777299b62ba42f844e162d8"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
